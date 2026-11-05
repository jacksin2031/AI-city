import { describe, expect, it, vi } from "vitest";
import { MemoryVisitorStore } from "../visitor/test-store";
import { SpineJobs } from "./jobs";
import { runSpineWorker } from "./worker";

const owner = "a".repeat(64);
const consent = {
  processing: true,
  automaticPublication: true,
  version: 1,
  recordedAt: "2026-11-05T00:00:00.000Z",
};
async function queued() {
  const jobs = new SpineJobs(new MemoryVisitorStore());
  await jobs.create("task1", owner, "b".repeat(64), consent);
  return jobs;
}

describe("Spine worker dispatch", () => {
  it("preserves a tool's review requirement without publishing", async () => {
    const jobs = await queued();
    const execute = vi.fn(async () => ({ status: "REQUIRES_REVIEW" as const }));
    expect((await runSpineWorker(jobs, "task1", owner, "worker1", execute)).state).toBe(
      "REQUIRES_REVIEW",
    );
    expect(await jobs.publishedBundle("task1")).toBeNull();
    await expect(runSpineWorker(jobs, "task1", owner, "worker2", execute)).rejects.toThrow();
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("records unknown outcomes without making a second external call", async () => {
    const jobs = await queued();
    const execute = vi.fn(async () => {
      throw new Error("timeout");
    });
    expect((await runSpineWorker(jobs, "task1", owner, "worker1", execute)).state).toBe("UNKNOWN");
    await expect(runSpineWorker(jobs, "task1", owner, "worker2", execute)).rejects.toThrow();
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("honours withdrawal while the external tool is working", async () => {
    const jobs = await queued();
    const result = await runSpineWorker(jobs, "task1", owner, "worker1", async () => {
      await jobs.withdraw("task1", owner);
      return { status: "REQUIRES_REVIEW" };
    });
    expect(result.state).toBe("WITHDRAWN");
    expect(await jobs.publishedBundle("task1")).toBeNull();
  });
  it("does not invoke the tool for an unrelated owner", async () => {
    const jobs = await queued();
    const execute = vi.fn(async () => ({ status: "FAILED" as const }));
    await expect(runSpineWorker(jobs, "task1", "c".repeat(64), "worker1", execute)).rejects.toThrow(
      "NOT_FOUND",
    );
    expect(execute).not.toHaveBeenCalled();
  });
});
