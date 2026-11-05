import { createHash } from "node:crypto";
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

function candidate() {
  const bytes = (s: string) => Buffer.from(s);
  const hash = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
  const assets = {
    "skeleton.json": bytes("{}"),
    "skeleton.atlas": bytes("atlas"),
    "orientation-policy.json": bytes("{}"),
    "page.png": bytes("png"),
  };
  const manifest = bytes(
    JSON.stringify({
      runtime: { package: "@esotericsoftware/spine-canvas", version: "4.3.13" },
      runtime_guard_required: true,
      files: Object.fromEntries(Object.entries(assets).map(([name, data]) => [name, hash(data)])),
    }),
  );
  const base = "/avatars/person/v1/";
  return {
    descriptor: {
      runtime: "4.3" as const,
      skeleton: `${base}skeleton.json`,
      atlas: `${base}skeleton.atlas`,
      pages: [`${base}page.png`],
      orientationPolicy: `${base}orientation-policy.json`,
      buildManifest: `${base}build-manifest.json`,
      sha256: hash(manifest),
    },
    manifest,
    assets,
    reviewApproved: true,
  };
}

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
  it("does not publish unchecked or damaged candidates, and can publish after review", async () => {
    const jobs = new SpineJobs(new MemoryVisitorStore());
    await jobs.create("task1", owner, "c".repeat(64), consent);
    await jobs.claim("task1", "worker1");
    const output = candidate();
    await expect(
      jobs.publish("task1", "worker1", { ...output, reviewApproved: false }),
    ).rejects.toThrow("BUNDLE_NOT_APPROVED");
    await expect(
      jobs.publish("task1", "worker1", {
        ...output,
        assets: { ...output.assets, "page.png": Buffer.from("changed") },
      }),
    ).rejects.toThrow("BUNDLE_NOT_APPROVED");
    await jobs.markReview("task1", "worker1");
    expect(await jobs.publishedBundle("task1")).toBeNull();
    await expect(jobs.publish("task1", "other", output)).rejects.toThrow("WORKER_MISMATCH");
    await jobs.publish("task1", "worker1", output);
    expect(await jobs.publishedBundle("task1")).toEqual(output.descriptor);
    await jobs.withdraw("task1", owner);
    expect(await jobs.publishedBundle("task1")).toBeNull();
  });
  it("prevents a late result from becoming public after withdrawal", async () => {
    const jobs = new SpineJobs(new MemoryVisitorStore());
    await jobs.create("task1", owner, "c".repeat(64), consent);
    await jobs.claim("task1", "worker1");
    await jobs.withdraw("task1", owner);
    await expect(jobs.publish("task1", "worker1", candidate())).rejects.toThrow();
    expect(await jobs.publishedBundle("task1")).toBeNull();
  });
  it("withdrawal wins against a concurrent publication transaction", async () => {
    const jobs = new SpineJobs(new MemoryVisitorStore());
    await jobs.create("task1", owner, "c".repeat(64), consent);
    await jobs.claim("task1", "worker1");
    await Promise.allSettled([
      jobs.publish("task1", "worker1", candidate()),
      jobs.withdraw("task1", owner),
    ]);
    expect((await jobs.get("task1", owner)).state).toBe("WITHDRAWN");
    expect(await jobs.publishedBundle("task1")).toBeNull();
  });
});
