import type { SpineJobs } from "./jobs";
import type { LocalSpineStorage } from "./local-storage";

/** Maintenance must be run by the separate local worker; it never starts a model. */
export async function cleanupLocalTask(jobs: SpineJobs, storage: LocalSpineStorage, task: string) {
  const state = await jobs.prepareCleanup(task);
  if (!state?.pending) return "NOT_REQUIRED" as const;
  try {
    if (state.toolCleanupPending && state.toolCleanupSafe) {
      await storage.removePreflightWorkspace(task);
      if (!(await jobs.finishToolCleanup(task))) return "PENDING" as const;
      state.toolCleanupPending = false;
    }
    await storage.removeTaskFiles(task);
    if (!state.toolCleanupPending && (await jobs.finishCleanup(task))) return "COMPLETE" as const;
  } catch {
    // Preserve the durable cleanup marker for a later retry.
  }
  return "PENDING" as const;
}
