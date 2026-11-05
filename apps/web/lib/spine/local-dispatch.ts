import { createHash } from "node:crypto";
import { verifySpineBundle } from "./bundle";
import type { SpineJobs } from "./jobs";
import type { LocalSpineStorage } from "./local-storage";
import { runSpineWorker, type ToolOutcome } from "./worker";

/** A separately running process must provide the tool adapter; this function never starts a model itself. */
export async function dispatchLocalTask(
  jobs: SpineJobs,
  storage: LocalSpineStorage,
  task: string,
  worker: string,
  execute: (photo: Uint8Array, worker: string) => Promise<ToolOutcome>,
) {
  const queued = await jobs.queuedForWorker(task);
  if (!queued?.photoSha256) return null;
  const staged: string[] = [];
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
      }
      return outcome;
    });
    if (result.state === "PUBLISHED") return result;
    for (const name of staged) await storage.remove(task, name);
    return result;
  } catch (error) {
    for (const name of staged) await storage.remove(task, name);
    throw error;
  }
}
