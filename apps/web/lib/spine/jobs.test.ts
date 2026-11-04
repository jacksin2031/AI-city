import { describe, expect, it } from "vitest";
import { MemoryVisitorStore } from "../visitor/test-store";
import { SpineJobs } from "./jobs";

const owner = "a".repeat(64);
const other = "b".repeat(64);
const consent = {
  processing: true,
  automaticPublication: true,
  version: 1,
  recordedAt: "2026-11-05T00:00:00.000Z",
} as const;

describe("Spine jobs transaction boundary", () => {
  it("binds job to owner and prevents duplicate claims", async () => {
    const jobs = new SpineJobs(new MemoryVisitorStore());
    await jobs.create("task1", owner, "c".repeat(64), consent);
    await expect(jobs.get("task1", other)).rejects.toThrow("NOT_FOUND");
    const claims = await Promise.allSettled([
      jobs.claim("task1", "worker1"),
      jobs.claim("task1", "worker2"),
    ]);
    expect(claims.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await jobs.get("task1", owner)).state).toBe("RUNNING");
  });
  it("withdraws atomically, rejecting late worker results", async () => {
    const jobs = new SpineJobs(new MemoryVisitorStore());
    await jobs.create("task1", owner, "c".repeat(64), consent);
    await jobs.claim("task1", "worker1");
    await jobs.withdraw("task1", owner);
    await expect(jobs.markUnknown("task1", "worker1")).rejects.toThrow();
    expect((await jobs.get("task1", owner)).state).toBe("WITHDRAWN");
  });
  it("records unknown results without granting another attempt", async () => {
    const jobs = new SpineJobs(new MemoryVisitorStore());
    await jobs.create("task1", owner, "c".repeat(64), consent);
    await jobs.claim("task1", "worker1");
    await expect(jobs.markUnknown("task1", "worker2")).rejects.toThrow();
    await jobs.markUnknown("task1", "worker1");
    await expect(jobs.claim("task1", "worker2")).rejects.toThrow();
    expect((await jobs.get("task1", owner)).state).toBe("UNKNOWN");
  });
  it("rejects missing consent and preserves existing tasks", async () => {
    const jobs = new SpineJobs(new MemoryVisitorStore());
    await expect(
      jobs.create("task1", owner, "c".repeat(64), { ...consent, processing: false }),
    ).rejects.toThrow();
    await jobs.create("task1", owner, "c".repeat(64), consent);
    await expect(jobs.create("task1", other, "d".repeat(64), consent)).rejects.toThrow();
    expect((await jobs.get("task1", owner)).state).toBe("QUEUED");
  });
});
