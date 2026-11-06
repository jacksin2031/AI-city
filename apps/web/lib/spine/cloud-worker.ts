import { createHash, randomUUID } from "node:crypto";
import type { CloudAssetStorage } from "./cloud-asset-storage";
import type { CloudPhotoStorage } from "./cloud-photo-storage";
import type { PollSummary, TaskListing } from "./cloud-worker-report";
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
  /**
   * Cloud-stored job ids to look at, in the order to look at them. Listing is the caller's concern
   * (Firestore query). A plain list is accepted; a listing also carries counts for the summary.
   */
  listTasks: () => Promise<string[] | TaskListing>;
  execute: (task: string, photo: Uint8Array, worker: string) => Promise<ToolOutcome>;
};

/** Why a task was looked at and left alone. Fixed names only; they never carry job content. */
type Outcome = { kind: "CLAIMED" } | { kind: "CLEANED" } | { kind: "SKIPPED"; reason: string };

const skipped = (reason: string): Outcome => ({ kind: "SKIPPED", reason });

/** Only an upper-case code from our own error messages is reported; anything else is not echoed. */
function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return /^[A-Z][A-Z0-9_]{2,40}$/.test(message) ? message : "UNCLASSIFIED";
}

/**
 * One pass of the cloud worker, run from a separate process on a trusted machine.
 * The cloud only ever holds a queued job; this process pulls the photo, runs the tool locally,
 * uploads the verified bundle and then removes the cloud photo. It never starts a model itself.
 *
 * A problem with one task is recorded under a reason code and never stops the pass or the process:
 * before a claim nothing has been sent to a model, so the task is simply looked at again next pass;
 * after a claim the job is no longer QUEUED and this pass never starts it a second time.
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
): Promise<PollSummary> {
  if (!Number.isSafeInteger(maxTasks) || maxTasks < 1 || maxTasks > 20)
    throw new Error("POLL_LIMIT");
  const cleanup: CloudCleanup = {
    removePhoto: (task) => deps.photos.remove(task),
    removeAssets: (task) => deps.assets.removeTask(task),
  };
  let claimed = 0;
  let cleaned = 0;
  const reasons: Record<string, number> = {};
  const listed = await deps.listTasks();
  const tasks = Array.isArray(listed) ? listed : listed.tasks;
  // Given order is kept (queued, oldest first). Concurrent loops never collide because a task that is
  // in flight is skipped, and the in-flight check and insert have no await between them.
  for (const task of tasks) {
    if (inFlight.has(task)) {
      reasons.IN_FLIGHT = (reasons.IN_FLIGHT ?? 0) + 1;
      continue;
    }
    inFlight.add(task);
    let outcome: Outcome;
    try {
      outcome = await handleTask(deps, cleanup, task, claimed, maxTasks);
    } catch (error) {
      outcome = skipped(`ERROR_${errorCode(error)}`);
    } finally {
      inFlight.delete(task);
    }
    if (outcome.kind === "CLAIMED") claimed += 1;
    else if (outcome.kind === "CLEANED") cleaned += 1;
    else reasons[outcome.reason] = (reasons[outcome.reason] ?? 0) + 1;
  }
  const summary: PollSummary = { claimed, cleaned, skipped: reasons };
  if (!Array.isArray(listed)) {
    const { tasks: _tasks, ...rest } = listed;
    summary.listing = { ...rest, listed: tasks.length + listed.settled };
  }
  return summary;
}

async function handleTask(
  deps: CloudWorkerDeps,
  cleanup: CloudCleanup,
  task: string,
  claimed: number,
  maxTasks: number,
): Promise<Outcome> {
  const result = await cleanupLocalTask(deps.jobs, deps.storage, task, cleanup);
  if (result === "COMPLETE") return { kind: "CLEANED" };
  if (result === "PENDING") return skipped("CLEANUP_PENDING");
  // Cleanup is done above even at capacity; admission is not examined once this pass has its share.
  if (claimed >= maxTasks) return skipped("NOT_EXAMINED");
  const admission = await deps.jobs.inspectCloudQueue(task);
  if (!admission.queued) return skipped(admission.reason);
  const pending = admission.queued;
  if (!pending.photoSha256) return skipped("NO_PHOTO_DIGEST");
  // Stage the exact stored generation locally; a changed or tampered object is never processed.
  let photo: Uint8Array | null;
  try {
    photo = await deps.photos.read(task, MAX_PHOTO, pending.generation);
  } catch (error) {
    const code = errorCode(error);
    if (code === "CLOUD_PHOTO_GENERATION_CHANGED") return skipped("PHOTO_GENERATION_CHANGED");
    if (code === "CLOUD_PHOTO_SIZE") return skipped("PHOTO_SIZE_INVALID");
    return skipped("PHOTO_UNAVAILABLE");
  }
  if (!photo) return skipped("PHOTO_MISSING");
  if (createHash("sha256").update(photo).digest("hex") !== pending.photoSha256)
    return skipped("BAD_PHOTO_DIGEST");
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
    return done ? { kind: "CLAIMED" } : skipped("NOT_DISPATCHED");
  } catch (error) {
    // A competing worker or a withdrawal may have claimed the task after the lookup.
    if (
      error instanceof Error &&
      ["INVALID_TRANSITION", "SESSION_EXPIRED"].includes(error.message) &&
      !(await deps.jobs.cloudQueuedForWorker(task))
    )
      return skipped("CLAIM_LOST");
    throw error;
  }
}
