import type { SpineJobs } from "./jobs";
import type { LocalSpineStorage } from "./local-storage";
import { prepareToolTask, type ToolPrepareConfig } from "./tool-prepare";
import type { ToolOutcome } from "./worker";

/** Explicit preflight executor for a separate worker. It prepares only; it cannot run a model. */
export function createToolPreflightExecutor(
  config: ToolPrepareConfig,
  jobs: SpineJobs,
  storage: LocalSpineStorage,
) {
  return async (task: string, photo: Uint8Array, worker: string): Promise<ToolOutcome> => {
    await prepareToolTask(config, jobs, storage, task, worker, photo);
    return { status: "PREPARED" };
  };
}
