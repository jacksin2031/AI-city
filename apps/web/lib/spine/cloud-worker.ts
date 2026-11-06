import { createHash, randomUUID } from "node:crypto";
import type { CloudAssetStorage } from "./cloud-asset-storage";
import type { CloudPhotoStorage } from "./cloud-photo-storage";
import type { SpineJobs } from "./jobs";
import { type CloudCleanup, cleanupLocalTask } from "./local-cleanup";
import { dispatchLocalTask } from "./local-dispatch";
import type { LocalSpineStorage } from "./local-storage";
import type { ToolOutcome } from "./worker";

const MAX_PHOTO = 24 * 1024 * 1024;

export type CloudWorkerDeps = {
  jobs: SpineJobs;
  /** Scratch directory on the worker machine, outside the project. Holds the photo only while working. */
  storage: LocalSpineStorage;
  photos: Pick<CloudPhotoStorage, "read" | "remove">;
  assets: Pick<CloudAssetStorage, "write" | "remove" | "removeTask">;
  /** Cloud-stored job ids to look at. Listing is the caller's concern (Firestore query). */
  listTasks: () => Promise<string[]>;
  execute: (task: string, photo: Uint8Array, worker: string) => Promise<ToolOutcome>;
};

/**
 * One pass of the cloud worker, run from a separate process on a trusted machine.
 * The cloud only ever holds a queued job; this process pulls the photo, runs the tool locally,
 * uploads the verified bundle and then removes the cloud photo. It never starts a model itself.
 */
export async function pollCloudSpineTasks(
  deps: CloudWorkerDeps,
  maxTasks = 1,
  /**
   * Tasks another loop of the same process is already handling. Concurrent loops share this set so
   * two of them never stage, run or clean the same task. It does not coordinate separate processes;
   * the worker script enforces a single process per scratch directory instead.
   */
  inFlight: Set<string> = new Set(),
) {
  if (!Number.isSafeInteger(maxTasks) || maxTasks < 1 || maxTasks > 20)
    throw new Error("POLL_LIMIT");
  const cleanup: CloudCleanup = {
    removePhoto: (task) => deps.photos.remove(task),
    removeAssets: (task) => deps.assets.removeTask(task),
  };
  let claimed = 0;
  let cleaned = 0;
  const tasks = await deps.listTasks();
  // Loops start from different tasks so that concurrent workers rarely line up on the same one.
  const offset = tasks.length ? Math.floor(Math.random() * tasks.length) : 0;
  for (const task of [...tasks.slice(offset), ...tasks.slice(0, offset)]) {
    if (inFlight.has(task)) continue;
    inFlight.add(task);
    try {
      const outcome = await handleTask(deps, cleanup, task, claimed, maxTasks);
      if (outcome === "CLAIMED") claimed += 1;
      else if (outcome === "CLEANED") cleaned += 1;
    } finally {
      inFlight.delete(task);
    }
  }
  return { claimed, cleaned };
}

async function handleTask(
  deps: CloudWorkerDeps,
  cleanup: CloudCleanup,
  task: string,
  claimed: number,
  maxTasks: number,
): Promise<"CLAIMED" | "CLEANED" | "SKIPPED"> {
  {
    const result = await cleanupLocalTask(deps.jobs, deps.storage, task, cleanup);
    if (result === "COMPLETE") return "CLEANED";
    if (result !== "NOT_REQUIRED" || claimed >= maxTasks) return "SKIPPED";
    const pending = await deps.jobs.cloudQueuedForWorker(task);
    if (!pending?.photoSha256) return "SKIPPED";
    // Stage the exact stored generation locally; a changed or tampered object is never processed.
    const photo = await deps.photos.read(task, MAX_PHOTO, pending.generation);
    if (!photo || createHash("sha256").update(photo).digest("hex") !== pending.photoSha256)
      return "SKIPPED";
    if (!(await deps.storage.read(task, "photo.png", MAX_PHOTO)))
      await deps.storage.write(task, "photo.png", photo);
    try {
      const done = await dispatchLocalTask(
        deps.jobs,
        deps.storage,
        task,
        `worker-${randomUUID()}`,
        (staged, worker) => deps.execute(task, staged, worker),
        deps.assets,
        { queued: (t) => deps.jobs.cloudQueuedForWorker(t), cleanup },
      );
      return done ? "CLAIMED" : "SKIPPED";
    } catch (error) {
      // A competing worker or a withdrawal may have claimed the task after the lookup.
      if (
        !(error instanceof Error) ||
        !["INVALID_TRANSITION", "SESSION_EXPIRED"].includes(error.message) ||
        (await deps.jobs.cloudQueuedForWorker(task))
      )
        throw error;
      return "SKIPPED";
    }
  }
}
