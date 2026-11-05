import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import type { VisitorService } from "../visitor/service";
import type { LocalSpineStorage } from "./local-storage";

const consentSchema = z.strictObject({
  processing: z.literal(true),
  automaticPublication: z.literal(true),
  version: z.literal(1),
});
const MAX_INPUT = 8 * 1024 * 1024;
const MAX_PIXELS = 16_777_216;
const MAX_OUTPUT = 24 * 1024 * 1024;

/** Decodes and re-encodes without metadata. No photo bytes are sent to the model here. */
export async function normalizeSpinePhoto(input: Uint8Array): Promise<Uint8Array> {
  if (!input.byteLength || input.byteLength > MAX_INPUT) throw new Error("PHOTO_SIZE");
  const options = { limitInputPixels: MAX_PIXELS, failOn: "error" as const, animated: false };
  try {
    const metadata = await sharp(input, options).metadata();
    if (
      !["jpeg", "png", "webp"].includes(metadata.format ?? "") ||
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > MAX_PIXELS ||
      (metadata.pages ?? 1) !== 1
    )
      throw new Error("PHOTO_INVALID");
    const png = await sharp(input, options).rotate().png().toBuffer();
    if (png.byteLength > MAX_OUTPUT) throw new Error("PHOTO_SIZE");
    return png;
  } catch (error) {
    if (error instanceof Error && error.message === "PHOTO_SIZE") throw error;
    throw new Error("PHOTO_INVALID");
  }
}

/** Admission only. A separately configured worker must claim and process the queued task. */
export async function submitSpinePhoto(
  service: VisitorService,
  storage: LocalSpineStorage,
  token: string,
  input: Uint8Array,
  consent: unknown,
) {
  const accepted = consentSchema.parse(consent);
  await service.current(token); // No data is stored for an invalid or expired session.
  const photo = await normalizeSpinePhoto(input);
  const digest = createHash("sha256").update(photo).digest("hex");
  const task = `spine-${randomUUID()}`;
  await storage.write(task, "photo.png", photo);
  try {
    return await service.createSpineJob(token, task, digest, accepted);
  } catch (error) {
    try {
      await storage.remove(task, "photo.png");
    } catch {
      throw new Error("PHOTO_CLEANUP_FAILED", { cause: error });
    }
    throw error;
  }
}

/** Public access is revoked first. A cleanup failure must be retried, not treated as erasure. */
export async function withdrawSpinePhoto(
  service: VisitorService,
  storage: LocalSpineStorage,
  token: string,
  task: string,
) {
  const { toolCleanupPending } = await service.withdrawSpineJob(token, task);
  try {
    await storage.removeTaskFiles(task);
    const done = !toolCleanupPending && (await service.completeSpinePhotoCleanup(token, task));
    return {
      state: "WITHDRAWN" as const,
      photoCleanup: done ? ("COMPLETE" as const) : ("PENDING" as const),
    };
  } catch {
    return { state: "WITHDRAWN" as const, photoCleanup: "PENDING" as const };
  }
}
