import { randomUUID } from "node:crypto";
import type { SpineJobs } from "./jobs";
import { cleanupLocalTask } from "./local-cleanup";
import { dispatchLocalTask } from "./local-dispatch";
import type { LocalSpineStorage } from "./local-storage";
import type { ToolOutcome } from "./worker";

/** Run from a separate process, not an HTTP handler. The supplied adapter controls live calls. */
export async function pollLocalSpineTasks(
  jobs: SpineJobs,
  storage: LocalSpineStorage,
  execute: (task: string, photo: Uint8Array, worker: string) => Promise<ToolOutcome>,
  maxTasks = 4,
) {
  if (!Number.isSafeInteger(maxTasks) || maxTasks < 1 || maxTasks > 20)
    throw new Error("POLL_LIMIT");
  let claimed = 0;
  let cleaned = 0;
  for (const task of await storage.listTasks()) {
    const cleanup = await cleanupLocalTask(jobs, storage, task);
    if (cleanup === "COMPLETE") cleaned += 1;
    if (cleanup !== "NOT_REQUIRED" || claimed >= maxTasks) continue;
    const pending = await jobs.queuedForWorker(task);
    if (!pending) continue;
    try {
      const result = await dispatchLocalTask(
        jobs,
        storage,
        task,
        `worker-${randomUUID()}`,
        (photo, worker) => execute(task, photo, worker),
      );
      if (result) claimed += 1;
    } catch (error) {
      // A competing worker or withdrawal may have claimed the task after the lookup.
      // Re-read before deciding whether this was a benign race.
      if (
        !(error instanceof Error) ||
        !["INVALID_TRANSITION", "SESSION_EXPIRED"].includes(error.message) ||
        (await jobs.queuedForWorker(task))
      )
        throw error;
    }
  }
  return { claimed, cleaned };
}
