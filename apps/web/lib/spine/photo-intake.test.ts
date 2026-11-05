import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VisitorService } from "../visitor/service";
import { MemoryVisitorStore } from "../visitor/test-store";
import { LocalSpineStorage } from "./local-storage";
import { normalizeSpinePhoto, submitSpinePhoto, withdrawSpinePhoto } from "./photo-intake";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "ai-city-spine-intake-"));
  roots.push(root);
  const files = await LocalSpineStorage.open(root);
  const service = new VisitorService(new MemoryVisitorStore());
  const { token } = await service.createOpenSession();
  const image = await sharp({ create: { width: 4, height: 3, channels: 3, background: "red" } })
    .jpeg()
    .withMetadata()
    .toBuffer();
  return { root, files, service, token, image };
}
const consent = { processing: true, automaticPublication: true, version: 1 };

describe("photo admission", () => {
  it("normalizes a valid image, strips metadata, and queues it privately", async () => {
    const f = await fixture();
    const result = await submitSpinePhoto(f.service, f.files, f.token, f.image, consent);
    expect(result.state).toBe("QUEUED");
    const saved = await f.files.read(result.task, "photo.png", 1024 * 1024);
    if (!saved) throw new Error("PHOTO_NOT_SAVED");
    const metadata = await sharp(saved).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.exif).toBeUndefined();
  });
  it("stores nothing without both consent and a live session", async () => {
    const f = await fixture();
    const write = vi.spyOn(f.files, "write");
    await expect(
      submitSpinePhoto(f.service, f.files, f.token, f.image, { ...consent, processing: false }),
    ).rejects.toThrow();
    await expect(
      submitSpinePhoto(f.service, f.files, "a".repeat(64), f.image, consent),
    ).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
  });
  it("rejects malformed bytes and cleans up after a conflicting task", async () => {
    const f = await fixture();
    await expect(normalizeSpinePhoto(Buffer.from("not an image"))).rejects.toThrow("PHOTO_INVALID");
    const first = await submitSpinePhoto(f.service, f.files, f.token, f.image, consent);
    await expect(
      submitSpinePhoto(f.service, f.files, f.token, f.image, consent),
    ).rejects.toMatchObject({ code: "ACTIVE_JOB_EXISTS" });
    const dirs = await readdir(f.root);
    for (const task of dirs.filter((name) => name !== first.task))
      expect(await f.files.read(task, "photo.png", 1024 * 1024)).toBeNull();
    expect(await f.files.read(first.task, "photo.png", 1024 * 1024)).not.toBeNull();
  });
  it("revokes before deleting only the owner's photo and reports cleanup failures", async () => {
    const f = await fixture();
    const first = await submitSpinePhoto(f.service, f.files, f.token, f.image, consent);
    const stranger = await f.service.createOpenSession();
    await expect(
      withdrawSpinePhoto(f.service, f.files, stranger.token, first.task),
    ).rejects.toMatchObject({ code: "JOB_NOT_FOUND" });
    expect(await f.files.read(first.task, "photo.png", 1024 * 1024)).not.toBeNull();
    const remove = vi.spyOn(f.files, "remove").mockRejectedValueOnce(new Error("disk failure"));
    expect(await withdrawSpinePhoto(f.service, f.files, f.token, first.task)).toEqual({
      state: "WITHDRAWN",
      photoCleanup: "PENDING",
    });
    expect(await withdrawSpinePhoto(f.service, f.files, f.token, first.task)).toEqual({
      state: "WITHDRAWN",
      photoCleanup: "COMPLETE",
    });
    expect(await f.files.read(first.task, "photo.png", 1024 * 1024)).toBeNull();
    expect(remove).toHaveBeenCalledTimes(2);
  });
});
