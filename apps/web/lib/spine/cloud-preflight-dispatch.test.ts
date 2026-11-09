import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VisitorService } from "../visitor/service";
import { MemoryVisitorStore } from "../visitor/test-store";
import { submitCloudPhoto } from "./cloud-photo-intake";
import { dispatchCloudPreflight } from "./cloud-preflight-dispatch";
import { pollCloudPreflightTasks } from "./cloud-preflight-poller";
import { SpineJobs } from "./jobs";
import { LocalSpineStorage } from "./local-storage";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "ai-city-cloud-preflight-"));
  roots.push(root);
  const local = await LocalSpineStorage.open(root);
  const store = new MemoryVisitorStore();
  const service = new VisitorService(store);
  const jobs = new SpineJobs(store);
  const { token } = await service.createOpenSession();
  const task = `spine-${randomUUID()}`;
  const photo = new Uint8Array([1, 2, 3]);
  const hash = createHash("sha256").update(photo).digest("hex");
  await service.reserveCloudPhotoUpload(token, task, hash, {
    version: 2,
    processing: true,
    externalModelUpload: true,
    automaticPublication: true,
  });
  await service.beginCloudPhotoUpload(token, task);
  await service.completeCloudPhotoUpload(token, task, hash, "123");
  const cloud = { read: vi.fn(async () => photo) };
  return { service, jobs, local, cloud, token, task, photo, hash };
}
describe("cloud-to-local preflight dispatch", () => {
  it("runs one preflight when two pollers race on the same task", async () => {
    const f = await fixture();
    const execute = vi.fn(async (id: string, _photo: Uint8Array, worker: string) => {
      await f.jobs.bindToolFlow(id, worker, `flow-${"a".repeat(32)}`, f.hash);
      return { status: "PREPARED" as const };
    });
    const results = await Promise.all([
      pollCloudPreflightTasks(f.jobs, f.cloud, f.local, execute, 1),
      pollCloudPreflightTasks(f.jobs, f.cloud, f.local, execute, 1),
    ]);
    expect(results.reduce((total, result) => total + result.claimed, 0)).toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("polls queued work once and does not rerun a prepared task", async () => {
    const f = await fixture();
    const execute = vi.fn(async (id: string, _photo: Uint8Array, worker: string) => {
      await f.jobs.bindToolFlow(id, worker, `flow-${"a".repeat(32)}`, f.hash);
      return { status: "PREPARED" as const };
    });
    expect(await pollCloudPreflightTasks(f.jobs, f.cloud, f.local, execute, 1)).toEqual({
      claimed: 1,
    });
    expect(await pollCloudPreflightTasks(f.jobs, f.cloud, f.local, execute, 1)).toEqual({
      claimed: 0,
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("does not execute expired or result-unknown work when polling again", async () => {
    const f = await fixture();
    const execute = vi.fn(async () => {
      throw new Error("uncertain");
    });
    expect(await pollCloudPreflightTasks(f.jobs, f.cloud, f.local, execute, 1)).toEqual({
      claimed: 1,
    });
    expect(await pollCloudPreflightTasks(f.jobs, f.cloud, f.local, execute, 1)).toEqual({
      claimed: 0,
    });
    expect(execute).toHaveBeenCalledTimes(1);
    const expired = await fixture();
    await expired.service.closeSession(expired.token);
    expect(
      await pollCloudPreflightTasks(expired.jobs, expired.cloud, expired.local, execute, 1),
    ).toEqual({ claimed: 0 });
  });
  it("surfaces a post-claim transition failure and does not retry the task", async () => {
    const f = await fixture();
    const execute = vi.fn(async (id: string, _photo: Uint8Array, worker: string) => {
      await f.jobs.bindToolFlow(id, worker, `flow-${"a".repeat(32)}`, f.hash);
      return { status: "PREPARED" as const };
    });
    vi.spyOn(f.jobs, "markPrepared").mockRejectedValueOnce(new Error("INVALID_TRANSITION"));
    await expect(pollCloudPreflightTasks(f.jobs, f.cloud, f.local, execute, 1)).rejects.toThrow(
      "INVALID_TRANSITION",
    );
    expect(await pollCloudPreflightTasks(f.jobs, f.cloud, f.local, execute, 1)).toEqual({
      claimed: 0,
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("connects synthetic admission to a model-disabled worker", async () => {
    const root = await mkdtemp(join(tmpdir(), "ai-city-cloud-roundtrip-"));
    roots.push(root);
    const local = await LocalSpineStorage.open(root);
    const store = new MemoryVisitorStore();
    const service = new VisitorService(store);
    const jobs = new SpineJobs(store);
    const { token } = await service.createOpenSession();
    const photo = await sharp({ create: { width: 3, height: 3, channels: 3, background: "red" } })
      .png()
      .toBuffer();
    let saved = new Uint8Array();
    const cloud = {
      write: async (_task: string, bytes: Uint8Array) => {
        saved = Uint8Array.from(bytes);
        return "123";
      },
      read: async (_task: string, _max: number, generation?: string) =>
        generation === "123" ? saved : null,
    };
    const result = await submitCloudPhoto(service, cloud, token, photo, {
      version: 2,
      processing: true,
      externalModelUpload: true,
      automaticPublication: true,
    });
    expect(await jobs.cloudTasks()).toContain(result.task);
    const prepared = await dispatchCloudPreflight(
      jobs,
      cloud,
      local,
      result.task,
      "worker",
      async (id, bytes, worker) => {
        await jobs.bindToolFlow(
          id,
          worker,
          `flow-${"a".repeat(32)}`,
          createHash("sha256").update(bytes).digest("hex"),
        );
        return { status: "PREPARED" };
      },
    );
    expect(prepared.state).toBe("PREPARED");
    expect(await jobs.publishedBundle(result.task)).toBeNull();
  });
  it("claims once, reads the expected generation, verifies the digest and prepares without publication", async () => {
    const f = await fixture();
    const execute = vi.fn(async (task: string, photo: Uint8Array, worker: string) => {
      expect(photo).toEqual(f.photo);
      await f.jobs.bindToolFlow(task, worker, `flow-${"a".repeat(32)}`, f.hash);
      return { status: "PREPARED" as const };
    });
    expect(
      (await dispatchCloudPreflight(f.jobs, f.cloud, f.local, f.task, "worker1", execute)).state,
    ).toBe("PREPARED");
    expect(f.cloud.read).toHaveBeenCalledWith(f.task, expect.any(Number), "123");
    expect(await f.local.read(f.task, "photo.png", 100)).toEqual(Buffer.from(f.photo));
    expect(await f.jobs.publishedBundle(f.task)).toBeNull();
    await expect(
      dispatchCloudPreflight(f.jobs, f.cloud, f.local, f.task, "worker2", execute),
    ).rejects.toThrow();
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("does not execute the tool for a corrupted cloud photo", async () => {
    const f = await fixture();
    f.cloud.read.mockResolvedValueOnce(new Uint8Array([9]));
    const execute = vi.fn();
    expect(
      (await dispatchCloudPreflight(f.jobs, f.cloud, f.local, f.task, "worker1", execute)).state,
    ).toBe("FAILED");
    expect(execute).not.toHaveBeenCalled();
  });
  it("does not mark a late result prepared after withdrawal", async () => {
    const f = await fixture();
    const execute = vi.fn(async () => {
      await f.service.withdrawSpineJob(f.token, f.task);
      return { status: "PREPARED" as const };
    });
    expect(
      (await dispatchCloudPreflight(f.jobs, f.cloud, f.local, f.task, "worker1", execute)).state,
    ).toBe("WITHDRAWN");
    expect(await f.jobs.publishedBundle(f.task)).toBeNull();
  });
  it("does not retry when the tool outcome is unknown", async () => {
    const f = await fixture();
    const execute = vi.fn(async () => {
      throw new Error("tool uncertain");
    });
    expect(
      (await dispatchCloudPreflight(f.jobs, f.cloud, f.local, f.task, "worker1", execute)).state,
    ).toBe("UNKNOWN");
    await expect(
      dispatchCloudPreflight(f.jobs, f.cloud, f.local, f.task, "worker2", execute),
    ).rejects.toThrow();
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
