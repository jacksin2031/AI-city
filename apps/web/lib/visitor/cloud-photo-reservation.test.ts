import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { HEARTBEAT_PATH } from "../spine/heartbeat";
import { SpineJobs } from "../spine/jobs";
import { VisitorService } from "./service";
import { MemoryVisitorStore } from "./test-store";

const consent = {
  version: 2 as const,
  processing: true as const,
  externalModelUpload: true as const,
  automaticPublication: true as const,
};
const task = () => `spine-${randomUUID()}`;

describe("cloud photo upload reservation", () => {
  it("binds a reservation to a live session and server-recorded consent before upload", async () => {
    const store = new MemoryVisitorStore();
    const now = Date.parse("2026-11-05T00:00:00Z");
    const service = new VisitorService(store, () => now);
    await store.run(async (tx) => tx.set(HEARTBEAT_PATH, { seenAt: now, running: 0 }));
    const { token, expiresAt } = await service.createOpenSession();
    const id = task();
    expect(await service.reserveCloudPhotoUpload(token, id, "a".repeat(64), consent)).toEqual({
      task: id,
      state: "RESERVED",
    });
    const entries = store.dump().get("meta/cloud-photo-uploads")?.entries as
      | Record<string, Record<string, unknown>>
      | undefined;
    const entry = entries?.[id];
    expect(entry?.owner).toBe(createHash("sha256").update(token).digest("hex"));
    expect(entry?.sessionExpiresAt).toBe(expiresAt);
    expect(entry?.consent).toEqual({ ...consent, recordedAt: new Date(now).toISOString() });
    expect(JSON.stringify(entry)).not.toContain(token);
  });
  it("does not reserve for invalid consent, expired sessions, or invalid task IDs", async () => {
    const store = new MemoryVisitorStore();
    let now = Date.parse("2026-11-05T00:00:00Z");
    const service = new VisitorService(store, () => now);
    await store.run(async (tx) => tx.set(HEARTBEAT_PATH, { seenAt: now, running: 0 }));
    const { token } = await service.createOpenSession();
    await expect(
      service.reserveCloudPhotoUpload(token, task(), "a".repeat(64), {
        ...consent,
        externalModelUpload: false,
      }),
    ).rejects.toThrow();
    await expect(
      service.reserveCloudPhotoUpload(token, "../escape", "a".repeat(64), consent),
    ).rejects.toThrow();
    now += 25 * 60 * 60 * 1000;
    await expect(
      service.reserveCloudPhotoUpload(token, task(), "a".repeat(64), consent),
    ).rejects.toThrow();
    expect(store.dump().has("meta/cloud-photo-uploads")).toBe(false);
  });
  it("allows only one reservation for a session, including concurrent requests", async () => {
    const store = new MemoryVisitorStore();
    const service = new VisitorService(store);
    await store.run(async (tx) => tx.set(HEARTBEAT_PATH, { seenAt: Date.now(), running: 0 }));
    const { token } = await service.createOpenSession();
    const result = await Promise.allSettled([
      service.reserveCloudPhotoUpload(token, task(), "a".repeat(64), consent),
      service.reserveCloudPhotoUpload(token, task(), "b".repeat(64), consent),
    ]);
    expect(result.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(result.filter((item) => item.status === "rejected")).toHaveLength(1);
  });
  it("prevents a local job and cloud reservation from claiming the same session", async () => {
    const store = new MemoryVisitorStore();
    const service = new VisitorService(store);
    await store.run(async (tx) => tx.set(HEARTBEAT_PATH, { seenAt: Date.now(), running: 0 }));
    const { token } = await service.createOpenSession();
    await service.reserveCloudPhotoUpload(token, task(), "a".repeat(64), consent);
    await expect(
      service.createSpineJob(token, task(), "b".repeat(64), consent),
    ).rejects.toMatchObject({ code: "ACTIVE_JOB_EXISTS" });
  });
  it("rejects cloud admission when a local task is already active", async () => {
    const store = new MemoryVisitorStore();
    const service = new VisitorService(store);
    await store.run(async (tx) => tx.set(HEARTBEAT_PATH, { seenAt: Date.now(), running: 0 }));
    const { token } = await service.createOpenSession();
    await service.createSpineJob(token, task(), "a".repeat(64), consent);
    await expect(
      service.reserveCloudPhotoUpload(token, task(), "b".repeat(64), consent),
    ).rejects.toMatchObject({ code: "ACTIVE_JOB_EXISTS" });
  });
  it("fails closed if the durable reservation index is malformed", async () => {
    const store = new MemoryVisitorStore();
    const service = new VisitorService(store);
    await store.run(async (tx) => tx.set(HEARTBEAT_PATH, { seenAt: Date.now(), running: 0 }));
    const { token } = await service.createOpenSession();
    await store.run(async (tx) =>
      tx.set("meta/cloud-photo-uploads", { schemaVersion: 1, entries: "bad" }),
    );
    await expect(
      service.reserveCloudPhotoUpload(token, task(), "a".repeat(64), consent),
    ).rejects.toMatchObject({ code: "STORAGE_INVALID" });
  });
  it("cancels an unstarted reservation and permanently fences the task ID", async () => {
    const store = new MemoryVisitorStore();
    const service = new VisitorService(store);
    await store.run(async (tx) => tx.set(HEARTBEAT_PATH, { seenAt: Date.now(), running: 0 }));
    const { token } = await service.createOpenSession();
    const id = task();
    await service.reserveCloudPhotoUpload(token, id, "a".repeat(64), consent);
    expect(await service.cancelCloudPhotoUpload(token, id)).toEqual({
      task: id,
      state: "CANCELLED",
    });
    await expect(service.beginCloudPhotoUpload(token, id)).rejects.toThrow();
    await expect(
      service.reserveCloudPhotoUpload(token, id, "a".repeat(64), consent),
    ).rejects.toMatchObject({ code: "ACTIVE_JOB_EXISTS" });
    await expect(
      service.reserveCloudPhotoUpload(token, task(), "b".repeat(64), consent),
    ).resolves.toMatchObject({ state: "RESERVED" });
  });
  it("keeps an upload already started pending cleanup after cancellation", async () => {
    const store = new MemoryVisitorStore();
    const service = new VisitorService(store);
    await store.run(async (tx) => tx.set(HEARTBEAT_PATH, { seenAt: Date.now(), running: 0 }));
    const { token } = await service.createOpenSession();
    const id = task();
    await service.reserveCloudPhotoUpload(token, id, "a".repeat(64), consent);
    expect(await service.beginCloudPhotoUpload(token, id)).toEqual({
      task: id,
      state: "UPLOADING",
    });
    expect(await service.cancelCloudPhotoUpload(token, id)).toEqual({
      task: id,
      state: "CLEANUP_PENDING",
    });
    await expect(service.beginCloudPhotoUpload(token, id)).rejects.toThrow();
    await expect(
      service.reserveCloudPhotoUpload(token, task(), "b".repeat(64), consent),
    ).rejects.toMatchObject({ code: "ACTIVE_JOB_EXISTS" });
  });
  it("does not let a different visitor cancel a reservation", async () => {
    const store = new MemoryVisitorStore();
    await store.run(async (tx) => tx.set(HEARTBEAT_PATH, { seenAt: Date.now(), running: 0 }));
    const service = new VisitorService(store);
    const first = await service.createOpenSession();
    const second = await service.createOpenSession();
    const id = task();
    await service.reserveCloudPhotoUpload(first.token, id, "a".repeat(64), consent);
    await expect(service.cancelCloudPhotoUpload(second.token, id)).rejects.toThrow();
    await expect(service.beginCloudPhotoUpload(first.token, id)).resolves.toMatchObject({
      state: "UPLOADING",
    });
  });
  it("serializes cancellation with upload intent and never permits a second start", async () => {
    const store = new MemoryVisitorStore();
    await store.run(async (tx) => tx.set(HEARTBEAT_PATH, { seenAt: Date.now(), running: 0 }));
    const service = new VisitorService(store);
    const { token } = await service.createOpenSession();
    const id = task();
    await service.reserveCloudPhotoUpload(token, id, "a".repeat(64), consent);
    const [started, cancelled] = await Promise.allSettled([
      service.beginCloudPhotoUpload(token, id),
      service.cancelCloudPhotoUpload(token, id),
    ]);
    expect(cancelled.status).toBe("fulfilled");
    if (cancelled.status !== "fulfilled") throw new Error("cancel failed");
    expect(cancelled.value.state).toBe(
      started.status === "fulfilled" ? "CLEANUP_PENDING" : "CANCELLED",
    );
    await expect(service.beginCloudPhotoUpload(token, id)).rejects.toThrow();
  });
  it("promotes a verified upload to one cloud-backed queued job", async () => {
    const store = new MemoryVisitorStore();
    const service = new VisitorService(store);
    await store.run(async (tx) => tx.set(HEARTBEAT_PATH, { seenAt: Date.now(), running: 0 }));
    const { token } = await service.createOpenSession();
    const id = task();
    await service.reserveCloudPhotoUpload(token, id, "a".repeat(64), consent);
    await service.beginCloudPhotoUpload(token, id);
    await expect(
      service.completeCloudPhotoUpload(token, id, "a".repeat(64), "123"),
    ).resolves.toEqual({ task: id, state: "QUEUED" });
    expect(store.dump().get(`jobs/spine-${id}`)).toMatchObject({
      state: "QUEUED",
      photoStorage: "CLOUD_PRIVATE",
      photoGeneration: "123",
    });
    expect(await new SpineJobs(store).queuedForWorker(id)).toBeNull();
    await expect(
      service.completeCloudPhotoUpload(token, id, "a".repeat(64), "123"),
    ).rejects.toThrow();
  });
  it("refuses mismatched, invalid or cancelled uploads", async () => {
    const store = new MemoryVisitorStore();
    const service = new VisitorService(store);
    await store.run(async (tx) => tx.set(HEARTBEAT_PATH, { seenAt: Date.now(), running: 0 }));
    const { token } = await service.createOpenSession();
    const id = task();
    await service.reserveCloudPhotoUpload(token, id, "a".repeat(64), consent);
    await service.beginCloudPhotoUpload(token, id);
    await expect(
      service.completeCloudPhotoUpload(token, id, "b".repeat(64), "123"),
    ).rejects.toThrow();
    await expect(
      service.completeCloudPhotoUpload(token, id, "a".repeat(64), "0"),
    ).rejects.toThrow();
    await service.cancelCloudPhotoUpload(token, id);
    await expect(
      service.completeCloudPhotoUpload(token, id, "a".repeat(64), "123"),
    ).rejects.toThrow();
    expect(store.dump().has(`jobs/spine-${id}`)).toBe(false);
  });
  it("cannot queue a cancelled upload when completion races cancellation", async () => {
    const store = new MemoryVisitorStore();
    const service = new VisitorService(store);
    await store.run(async (tx) => tx.set(HEARTBEAT_PATH, { seenAt: Date.now(), running: 0 }));
    const { token } = await service.createOpenSession();
    const id = task();
    await service.reserveCloudPhotoUpload(token, id, "a".repeat(64), consent);
    await service.beginCloudPhotoUpload(token, id);
    const [completed, cancelled] = await Promise.allSettled([
      service.completeCloudPhotoUpload(token, id, "a".repeat(64), "123"),
      service.cancelCloudPhotoUpload(token, id),
    ]);
    expect(completed.status === "fulfilled").not.toBe(cancelled.status === "fulfilled");
    expect(store.dump().has(`jobs/spine-${id}`)).toBe(completed.status === "fulfilled");
  });
});
