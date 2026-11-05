import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SpineJobs } from "../spine/jobs";
import { VisitorService } from "./service";
import type { VisitorStore, VisitorTransaction } from "./store";
import { MemoryVisitorStore } from "./test-store";

/** Match the production adapter's document-path restriction, including transactional writes. */
class PathCheckingStore implements VisitorStore {
  private readonly inner = new MemoryVisitorStore();
  run<T>(action: (tx: VisitorTransaction) => Promise<T>): Promise<T> {
    const check = (path: string) => {
      if (!/^(meta|sessions|jobs|requests)\/[A-Za-z0-9_-]{1,128}$/.test(path))
        throw new Error("Invalid visitor document path");
    };
    return this.inner.run((tx) =>
      action({
        get: (path) => {
          check(path);
          return tx.get(path);
        },
        set: (path, value) => {
          check(path);
          tx.set(path, value);
        },
        delete: (path) => {
          check(path);
          tx.delete(path);
        },
      }),
    );
  }
}

describe("visitor-bound Spine admission", () => {
  it("serializes orphan cleanup with a racing admission", async () => {
    const store = new MemoryVisitorStore();
    const service = new VisitorService(store);
    const jobs = new SpineJobs(store);
    const { token } = await service.createOpenSession();
    const consent = {
      processing: true,
      externalModelUpload: true,
      automaticPublication: true,
      version: 2,
    };
    const [reserved, admitted] = await Promise.allSettled([
      jobs.reserveOrphanCleanup("race"),
      service.createSpineJob(token, "race", "a".repeat(64), consent),
    ]);
    expect(reserved.status).toBe("fulfilled");
    if (reserved.status !== "fulfilled") throw new Error("reservation failed");
    expect(reserved.value).toBe(admitted.status === "rejected");
    if (admitted.status === "rejected") expect(admitted.reason.code).toBe("ACTIVE_JOB_EXISTS");
  });
  it("requires a live session and both explicit consents, with one active task per session", async () => {
    const store = new PathCheckingStore();
    const now = Date.parse("2026-11-05T00:00:00Z");
    const service = new VisitorService(store, () => now);
    const { token } = await service.createOpenSession();
    const consent = {
      processing: true,
      externalModelUpload: true,
      automaticPublication: true,
      version: 2,
    };
    await expect(
      service.createSpineJob(token, "a", "a".repeat(64), { ...consent, processing: false }),
    ).rejects.toThrow();
    await expect(
      service.createSpineJob("f".repeat(64), "a", "a".repeat(64), consent),
    ).rejects.toMatchObject({ code: "SESSION_REQUIRED" });
    expect(await service.createSpineJob(token, "a", "a".repeat(64), consent)).toEqual({
      task: "a",
      state: "QUEUED",
    });
    await expect(service.createSpineJob(token, "b", "b".repeat(64), consent)).rejects.toMatchObject(
      { code: "ACTIVE_JOB_EXISTS" },
    );
    const owner = createHash("sha256").update(token).digest("hex");
    const jobs = new SpineJobs(store, () => now);
    expect((await jobs.get("a", owner)).consent?.recordedAt).toBe(new Date(now).toISOString());
    await jobs.withdraw("a", owner);
    await service.completeSpinePhotoCleanup(token, "a");
    expect((await service.createSpineJob(token, "b", "b".repeat(64), consent)).state).toBe(
      "QUEUED",
    );
  });
  it("cannot start a queued job after the session is closed or expired", async () => {
    const store = new MemoryVisitorStore();
    let now = Date.parse("2026-11-05T00:00:00Z");
    const service = new VisitorService(store, () => now);
    const first = await service.createOpenSession();
    const owner = createHash("sha256").update(first.token).digest("hex");
    const consent = {
      processing: true,
      externalModelUpload: true,
      automaticPublication: true,
      version: 2,
    };
    await service.createSpineJob(first.token, "a", "a".repeat(64), consent);
    const jobs = new SpineJobs(store, () => now);
    await service.closeSession(first.token);
    await expect(jobs.claim("a", "worker")).rejects.toThrow("SESSION_EXPIRED");
    const second = await service.createOpenSession();
    await service.createSpineJob(second.token, "b", "b".repeat(64), consent);
    now += 25 * 60 * 60 * 1000;
    await expect(jobs.claim("b", "worker")).rejects.toThrow("SESSION_EXPIRED");
    expect((await jobs.get("a", owner)).state).toBe("QUEUED");
  });
});
