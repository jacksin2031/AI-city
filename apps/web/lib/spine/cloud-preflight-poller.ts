import { randomUUID } from "node:crypto";
import type { CloudPhotoStorage } from "./cloud-photo-storage";
import { dispatchCloudPreflight } from "./cloud-preflight-dispatch";
import type { SpineJobs } from "./jobs";
import type { LocalSpineStorage } from "./local-storage";
import type { ToolOutcome } from "./worker";

/** This poller requires a trusted model-disabled preflight adapter. */
export async function pollCloudPreflightTasks(
  jobs: SpineJobs,
  cloud: Pick<CloudPhotoStorage, "read">,
  local: LocalSpineStorage,
  preflight: (task: string, photo: Uint8Array, worker: string) => Promise<ToolOutcome>,
  maxTasks = 1,
) {
  if (!Number.isSafeInteger(maxTasks) || maxTasks < 1 || maxTasks > 20)
    throw new Error("POLL_LIMIT");
  let claimed = 0;
  for (const task of await jobs.cloudTasks()) {
    if (claimed >= maxTasks) break;
    if (!(await jobs.cloudQueuedForWorker(task))) continue;
    try {
      await dispatchCloudPreflight(jobs, cloud, local, task, `worker-${randomUUID()}`, preflight);
      claimed += 1;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== "CLOUD_CLAIM_RACE" ||
        (await jobs.cloudQueuedForWorker(task))
      )
        throw error;
    }
  }
  return { claimed };
}
