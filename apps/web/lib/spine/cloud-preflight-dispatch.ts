import { createHash } from "node:crypto";
import type { CloudPhotoStorage } from "./cloud-photo-storage";
import type { SpineJobs } from "./jobs";
import type { LocalSpineStorage } from "./local-storage";
import type { ToolOutcome } from "./worker";

/** The caller must inject the model-disabled preflight executor, never the live executor. */
export async function dispatchCloudPreflight(
  jobs: SpineJobs,
  cloud: Pick<CloudPhotoStorage, "read">,
  local: LocalSpineStorage,
  task: string,
  worker: string,
  preflight: (task: string, photo: Uint8Array, worker: string) => Promise<ToolOutcome>,
) {
  const claim = await jobs.claimCloud(task, worker).catch((error: unknown) => {
    if (error instanceof Error && ["INVALID_TRANSITION", "SESSION_EXPIRED"].includes(error.message))
      throw new Error("CLOUD_CLAIM_RACE");
    throw error;
  });
  async function finish(action: () => ReturnType<SpineJobs["markFailed"]>) {
    try {
      return await action();
    } catch (error) {
      const current = await jobs.get(task, claim.owner);
      if (["WITHDRAWN", "PREPARED", "UNKNOWN", "FAILED"].includes(current.state)) return current;
      throw error;
    }
  }

  let photo: Uint8Array;
  try {
    const data = await cloud.read(task, 24 * 1024 * 1024, claim.photoGeneration);
    if (!data || createHash("sha256").update(data).digest("hex") !== claim.photoSha256)
      throw new Error("CLOUD_PHOTO_DIGEST_MISMATCH");
    await local.write(task, "photo.png", data);
    photo = data;
  } catch {
    return finish(() => jobs.markFailed(task, worker));
  }

  let outcome: ToolOutcome;
  try {
    outcome = await preflight(task, photo, worker);
  } catch {
    return finish(() => jobs.markUnknown(task, worker));
  }
  if (outcome.status !== "PREPARED") return finish(() => jobs.markUnknown(task, worker));
  return finish(() => jobs.markPrepared(task, worker));
}
