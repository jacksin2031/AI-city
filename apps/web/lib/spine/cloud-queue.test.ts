import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { VisitorService } from "../visitor/service";
import { MemoryVisitorStore } from "../visitor/test-store";
import { SpineJobs } from "./jobs";

async function fixture() {
  const store = new MemoryVisitorStore();
  const service = new VisitorService(store);
  const jobs = new SpineJobs(store);
  const { token } = await service.createOpenSession();
  const task = `spine-${randomUUID()}`;
  const consent = {
    processing: true,
    externalModelUpload: true,
    automaticPublication: true,
    version: 2,
  };
  await service.reserveCloudPhotoUpload(token, task, "a".repeat(64), consent);
  await service.beginCloudPhotoUpload(token, task);
  await service.completeCloudPhotoUpload(token, task, "a".repeat(64), "123");
  return { store, service, jobs, token, task };
}
describe("cloud worker task queue", () => {
  it("lists queued tasks and lets only one worker claim a photo generation", async () => {
    const f = await fixture();
    expect(await f.jobs.cloudTasks()).toContain(f.task);
    const claims = await Promise.allSettled([
      f.jobs.claimCloud(f.task, "worker1"),
      f.jobs.claimCloud(f.task, "worker2"),
    ]);
    const claimed = claims.filter((item) => item.status === "fulfilled");
    expect(claimed).toHaveLength(1);
    const one = claimed[0];
    if (one?.status !== "fulfilled") throw new Error("missing claim");
    expect(one.value).toMatchObject({ photoSha256: "a".repeat(64), photoGeneration: "123" });
    expect(await f.jobs.cloudTasks()).toContain(f.task);
  });
  it("does not claim after session closure or retry an unknown outcome", async () => {
    const closed = await fixture();
    await closed.service.closeSession(closed.token);
    await expect(closed.jobs.claimCloud(closed.task, "worker")).rejects.toThrow();
    const unknown = await fixture();
    await unknown.jobs.claimCloud(unknown.task, "worker");
    await unknown.jobs.markUnknown(unknown.task, "worker");
    await expect(unknown.jobs.claimCloud(unknown.task, "other")).rejects.toThrow();
  });
  it("fails closed for a malformed queue", async () => {
    const f = await fixture();
    await f.store.run(async (tx) =>
      tx.set("meta/cloud-photo-queue", { schemaVersion: 1, tasks: "bad" }),
    );
    await expect(f.jobs.cloudTasks()).rejects.toThrow();
    await expect(f.jobs.claimCloud(f.task, "worker")).rejects.toThrow();
  });
});
