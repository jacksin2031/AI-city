import { createHash, randomUUID } from "node:crypto";
import { SpinePhotoConsentSchema } from "@ai-city/contracts/spine";
import type { VisitorService } from "../visitor/service";
import type { CloudPhotoStorage } from "./cloud-photo-storage";
import { normalizeSpinePhoto } from "./photo-intake";

/** Internal orchestration only. It is not enabled in any HTTP route. */
export async function submitCloudPhoto(
  service: VisitorService,
  storage: Pick<CloudPhotoStorage, "write" | "read">,
  token: string,
  input: Uint8Array,
  consent: unknown,
) {
  const accepted = SpinePhotoConsentSchema.parse(consent);
  await service.current(token);
  const photo = await normalizeSpinePhoto(input);
  const digest = createHash("sha256").update(photo).digest("hex");
  const task = `spine-${randomUUID()}`;
  await service.reserveCloudPhotoUpload(token, task, digest, accepted);
  try {
    await service.beginCloudPhotoUpload(token, task);
    const generation = await storage.write(task, photo);
    const uploaded = await storage.read(task, 24 * 1024 * 1024, generation);
    if (!uploaded || createHash("sha256").update(uploaded).digest("hex") !== digest)
      throw new Error("CLOUD_PHOTO_DIGEST_MISMATCH");
    return await service.completeCloudPhotoUpload(token, task, digest, generation);
  } catch {
    // A timeout or cancellation can leave an object or an already-committed job.
    // Never retry the upload or claim deletion here; maintenance must reconcile it.
    await service.cancelCloudPhotoUpload(token, task).catch(() => {});
    throw new Error("CLOUD_PHOTO_RECONCILIATION_REQUIRED");
  }
}
