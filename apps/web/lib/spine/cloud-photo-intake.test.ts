import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { VisitorService } from "../visitor/service";
import { MemoryVisitorStore } from "../visitor/test-store";
import { submitCloudPhoto } from "./cloud-photo-intake";

const consent = {
  processing: true,
  externalModelUpload: true,
  automaticPublication: true,
  version: 2,
};
async function fixture() {
  const store = new MemoryVisitorStore();
  const service = new VisitorService(store);
  const { token } = await service.createOpenSession();
  const photo = await sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  let saved = new Uint8Array();
  const storage = {
    write: vi.fn(async (_task: string, bytes: Uint8Array) => {
      saved = Uint8Array.from(bytes);
      return "123";
    }),
    read: vi.fn(async (_task: string, _max: number, _generation?: string) => saved),
  };
  return { store, service, token, photo, storage };
}
describe("cloud photo admission orchestration", () => {
  it("reserves, verifies the uploaded generation and queues a cloud task", async () => {
    const f = await fixture();
    const result = await submitCloudPhoto(f.service, f.storage, f.token, f.photo, consent);
    expect(result.state).toBe("QUEUED");
    expect(f.storage.read).toHaveBeenCalledWith(result.task, expect.any(Number), "123");
    expect(f.store.dump().get(`jobs/spine-${result.task}`)).toMatchObject({
      state: "QUEUED",
      photoStorage: "CLOUD_PRIVATE",
      photoGeneration: "123",
    });
  });
  it("keeps an unknown upload outcome pending cleanup without queueing", async () => {
    const f = await fixture();
    f.storage.write.mockRejectedValueOnce(new Error("unknown result"));
    await expect(submitCloudPhoto(f.service, f.storage, f.token, f.photo, consent)).rejects.toThrow(
      "CLOUD_PHOTO_RECONCILIATION_REQUIRED",
    );
    const id = f.storage.write.mock.calls[0]?.[0];
    if (!id) throw new Error("missing task");
    const entries = f.store.dump().get("meta/cloud-photo-uploads")?.entries as Record<
      string,
      { state: string }
    >;
    expect(entries[id]?.state).toBe("CLEANUP_PENDING");
    expect(f.store.dump().has(`jobs/spine-${id}`)).toBe(false);
  });
  it("does not queue a mismatched uploaded photo", async () => {
    const f = await fixture();
    f.storage.read.mockResolvedValueOnce(new Uint8Array([1, 2, 3]));
    await expect(submitCloudPhoto(f.service, f.storage, f.token, f.photo, consent)).rejects.toThrow(
      "CLOUD_PHOTO_RECONCILIATION_REQUIRED",
    );
    const id = f.storage.write.mock.calls[0]?.[0];
    if (!id) throw new Error("missing task");
    expect(f.store.dump().has(`jobs/spine-${id}`)).toBe(false);
  });
  it("does not upload without explicit consent", async () => {
    const f = await fixture();
    await expect(
      submitCloudPhoto(f.service, f.storage, f.token, f.photo, { ...consent, processing: false }),
    ).rejects.toThrow();
    expect(f.storage.write).not.toHaveBeenCalled();
  });
  it("does not queue if the visitor cancels while upload is in flight", async () => {
    const f = await fixture();
    f.storage.write.mockImplementationOnce(async (id, bytes) => {
      await f.service.cancelCloudPhotoUpload(f.token, id);
      f.storage.read.mockResolvedValueOnce(Uint8Array.from(bytes));
      return "123";
    });
    await expect(submitCloudPhoto(f.service, f.storage, f.token, f.photo, consent)).rejects.toThrow(
      "CLOUD_PHOTO_RECONCILIATION_REQUIRED",
    );
    const id = f.storage.write.mock.calls[0]?.[0];
    if (!id) throw new Error("missing task");
    const entries = f.store.dump().get("meta/cloud-photo-uploads")?.entries as Record<
      string,
      { state: string }
    >;
    expect(entries[id]?.state).toBe("CLEANUP_PENDING");
    expect(f.store.dump().has(`jobs/spine-${id}`)).toBe(false);
  });
});
