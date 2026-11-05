import { createHash } from "node:crypto";
import { verifySpineBundle } from "./bundle";
import type { CloudAssetStorage } from "./cloud-asset-storage";
import type { SpineJobs } from "./jobs";
import { type CloudCleanup, cleanupLocalTask } from "./local-cleanup";
import type { LocalSpineStorage } from "./local-storage";
import { runSpineWorker, type ToolOutcome } from "./worker";

/** A separately running process must provide the tool adapter; this function never starts a model itself. */
export async function dispatchLocalTask(
  jobs: SpineJobs,
  storage: LocalSpineStorage,
  task: string,
  worker: string,
  execute: (photo: Uint8Array, worker: string) => Promise<ToolOutcome>,
  cloud: Pick<CloudAssetStorage, "write" | "remove"> | null = null,
  options: {
    queued?: (task: string) => Promise<{ owner: string; photoSha256: string | null } | null>;
    cleanup?: CloudCleanup | null;
  } = {},
) {
  const queued = await (options.queued ?? ((t: string) => jobs.queuedForWorker(t)))(task);
  if (!queued?.photoSha256) return null;
  const staged: string[] = [];
  const stagedCloud: string[] = [];
  const unstage = async () => {
    for (const name of staged) await storage.remove(task, name);
    for (const name of stagedCloud) await cloud?.remove(task, name).catch(() => {});
  };
  try {
    const result = await runSpineWorker(jobs, task, queued.owner, worker, async () => {
      const photo = await storage.read(task, "photo.png", 24 * 1024 * 1024);
      if (!photo || createHash("sha256").update(photo).digest("hex") !== queued.photoSha256)
        return { status: "FAILED" };
      const outcome = await execute(photo, worker);
      if (outcome.status !== "APPROVED") return outcome;
      const { candidate } = outcome;
      const base = `/avatars/${task}/`;
      if (
        !candidate.reviewApproved ||
        !candidate.descriptor.skeleton.startsWith(base) ||
        !verifySpineBundle(candidate.descriptor, candidate.manifest, candidate.assets)
      )
        return { status: "FAILED" };
      const all = [
        ["build-manifest.json", candidate.manifest] as const,
        ...Object.entries(candidate.assets),
      ];
      if (
        all.some(([name, bytes]) => name === "photo.png" || !bytes) ||
        all.reduce((total, [, bytes]) => total + (bytes?.byteLength ?? 0), 0) > 64 * 1024 * 1024
      )
        return { status: "FAILED" };
      for (const [name, bytes] of all) {
        if (!bytes) return { status: "FAILED" };
        await storage.write(task, name, bytes);
        staged.push(name);
        // Upload before publication commits, so a published bundle is never missing in the cloud.
        if (cloud) {
          await cloud.write(task, name, bytes);
          stagedCloud.push(name);
        }
      }
      return outcome;
    });
    if (result.state === "PUBLISHED") {
      // Publication has committed: a cleanup outage must not remove its staged assets.
      await cleanupLocalTask(jobs, storage, task, options.cleanup ?? null).catch(
        () => "PENDING" as const,
      );
      return result;
    }
    await unstage();
    return result;
  } catch (error) {
    await unstage();
    throw error;
  }
}
