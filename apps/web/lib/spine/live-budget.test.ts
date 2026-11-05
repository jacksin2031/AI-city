import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { VisitorService } from "../visitor/service";
import { MemoryVisitorStore } from "../visitor/test-store";
import { SpineJobs } from "./jobs";

const consent = {
  version: 2,
  processing: true,
  externalModelUpload: true,
  automaticPublication: true,
};
const flow = `flow-${"a".repeat(32)}`;
async function prepared(service: VisitorService, jobs: SpineJobs, task: string) {
  const { token } = await service.createOpenSession();
  const owner = createHash("sha256").update(token).digest("hex");
  await service.createSpineJob(token, task, "b".repeat(64), consent);
  await jobs.claim(task, "preflight");
  await jobs.bindToolFlow(task, "preflight", flow, "b".repeat(64));
  await jobs.markPrepared(task, "preflight");
  return { token, owner };
}
describe("live tool attempt reservation", () => {
  it("enforces a durable task cap and never refunds an uncertain attempt", async () => {
    const store = new MemoryVisitorStore();
    const service = new VisitorService(store);
    const jobs = new SpineJobs(store);
    const first = await prepared(service, jobs, "task1");
    await prepared(service, jobs, "task2");
    expect((await jobs.claimPreparedLive("task1", "live1", 1)).liveIntent).toBe(true);
    await jobs.markUnknown("task1", "live1");
    expect(await jobs.preflightRecoveryContext("task1")).toBeNull();
    await expect(jobs.recoverPrepared("task1", first.owner, flow, "b".repeat(64))).rejects.toThrow(
      "TOOL_FLOW_MISMATCH",
    );
    await expect(jobs.claimPreparedLive("task2", "live2", 1)).rejects.toThrow("BUDGET_EXHAUSTED");
    await expect(jobs.claimPreparedLive("task2", "live2", 2)).rejects.toThrow(
      "BUDGET_CONFIG_CHANGED",
    );
    await jobs.withdraw("task1", first.owner);
    await expect(jobs.claimPreparedLive("task2", "live2", 1)).rejects.toThrow("BUDGET_EXHAUSTED");
  });
  it("requires a live session and version 2 external upload consent", async () => {
    const store = new MemoryVisitorStore();
    const service = new VisitorService(store);
    const jobs = new SpineJobs(store);
    const first = await prepared(service, jobs, "task1");
    await service.closeSession(first.token);
    await expect(jobs.claimPreparedLive("task1", "live", 1)).rejects.toThrow("SESSION_EXPIRED");
    await jobs.create("legacy", "c".repeat(64), "b".repeat(64), {
      version: 1,
      processing: true,
      automaticPublication: true,
      recordedAt: new Date().toISOString(),
    });
    await jobs.claim("legacy", "preflight");
    await jobs.bindToolFlow("legacy", "preflight", flow, "b".repeat(64));
    await jobs.markPrepared("legacy", "preflight");
    await expect(jobs.claimPreparedLive("legacy", "live", 1)).rejects.toThrow("SESSION_REQUIRED");
  });
});
