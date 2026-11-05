import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeviceDisplaySchema } from "@ai-city/contracts/device-link";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalParticipationService } from "../development/service";
import { DeviceLinkService } from "../link/service";
import { handlePersistentDeviceRequest } from "../visitor/device-http";
import { VisitorService } from "../visitor/service";
import { MemoryVisitorStore } from "../visitor/test-store";
import { handleLocalSpineAsset } from "./asset-http";
import { SpineJobs } from "./jobs";
import { cleanupLocalTask } from "./local-cleanup";
import { dispatchLocalTask } from "./local-dispatch";
import { pollLocalSpineTasks } from "./local-poller";
import { LocalSpineStorage } from "./local-storage";
import { submitSpinePhoto, withdrawSpinePhoto } from "./photo-intake";
import { readPublishedSpineAsset } from "./published-assets";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "ai-city-dispatch-"));
  roots.push(root);
  const storage = await LocalSpineStorage.open(root);
  const store = new MemoryVisitorStore();
  const service = new VisitorService(store);
  const jobs = new SpineJobs(store);
  const { token } = await service.createOpenSession();
  const photo = await sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  const job = await submitSpinePhoto(service, storage, token, photo, {
    processing: true,
    externalModelUpload: true,
    automaticPublication: true,
    version: 2,
  });
  return { root, storage, service, jobs, token, task: job.task };
}
async function candidate(task: string) {
  const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: "red" } })
    .png()
    .toBuffer();
  const assets = {
    "skeleton.json": Buffer.from("{}"),
    "skeleton.atlas": Buffer.from("atlas"),
    "orientation-policy.json": Buffer.from("{}"),
    "page.png": png,
  };
  const manifest = Buffer.from(
    JSON.stringify({
      runtime: { package: "@esotericsoftware/spine-canvas", version: "4.3.13" },
      runtime_guard_required: true,
      files: Object.fromEntries(Object.entries(assets).map(([name, bytes]) => [name, hash(bytes)])),
    }),
  );
  const base = `/avatars/${task}/v1/`;
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

describe("local task dispatch with isolated synthetic data", () => {
  it("reclaims an old photo with no job and prevents late job creation", async () => {
    const f = await fixture();
    const orphan = `spine-${randomUUID()}`;
    await f.storage.write(orphan, "photo.png", Buffer.from("synthetic"));
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await utimes(join(f.root, orphan, "photo.png"), old, old);
    await pollLocalSpineTasks(f.jobs, f.storage, async () => ({ status: "FAILED" }), 1);
    expect(await f.storage.read(orphan, "photo.png", 100)).toBeNull();
    const other = await f.service.createOpenSession();
    await expect(
      f.service.createSpineJob(other.token, orphan, "a".repeat(64), {
        processing: true,
        externalModelUpload: true,
        automaticPublication: true,
        version: 2,
      }),
    ).rejects.toMatchObject({ code: "ACTIVE_JOB_EXISTS" });
  });
  it("does not reclaim a fresh photo or an old photo belonging to an existing job", async () => {
    const f = await fixture();
    const fresh = `spine-${randomUUID()}`;
    await f.storage.write(fresh, "photo.png", Buffer.from("synthetic"));
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await utimes(join(f.root, f.task, "photo.png"), old, old);
    await f.jobs.claim(f.task, "worker1");
    await pollLocalSpineTasks(f.jobs, f.storage, async () => ({ status: "FAILED" }), 1);
    expect(await f.storage.read(fresh, "photo.png", 100)).not.toBeNull();
    expect(await f.storage.read(f.task, "photo.png", 1024 * 1024)).not.toBeNull();
  });
  it("retries orphan removal after a storage failure without admitting a late job", async () => {
    const f = await fixture();
    const orphan = `spine-${randomUUID()}`;
    await f.storage.write(orphan, "photo.png", Buffer.from("synthetic"));
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await utimes(join(f.root, orphan, "photo.png"), old, old);
    vi.spyOn(f.storage, "remove").mockRejectedValueOnce(new Error("storage failure"));
    await expect(
      pollLocalSpineTasks(f.jobs, f.storage, async () => ({ status: "FAILED" }), 1),
    ).rejects.toThrow("storage failure");
    const other = await f.service.createOpenSession();
    await expect(
      f.service.createSpineJob(other.token, orphan, "a".repeat(64), {
        processing: true,
        externalModelUpload: true,
        automaticPublication: true,
        version: 2,
      }),
    ).rejects.toMatchObject({ code: "ACTIVE_JOB_EXISTS" });
    await pollLocalSpineTasks(f.jobs, f.storage, async () => ({ status: "FAILED" }), 1);
    expect(await f.storage.read(orphan, "photo.png", 100)).toBeNull();
  });
  it("removes the photo after publication but holds a tool copy until writers are verified stopped", async () => {
    const f = await fixture();
    const workspace = join(f.root, f.task, "tool-workspace");
    await mkdir(workspace);
    await writeFile(join(workspace, "photo-copy.png"), "synthetic");
    const output = await candidate(f.task);
    await dispatchLocalTask(f.jobs, f.storage, f.task, "worker1", async () => ({
      status: "APPROVED",
      candidate: output,
    }));
    expect(await f.storage.read(f.task, "photo.png", 10000)).toBeNull();
    expect(await readFile(join(workspace, "photo-copy.png"), "utf8")).toBe("synthetic");
    expect(await cleanupLocalTask(f.jobs, f.storage, f.task)).toBe("PENDING");
    expect(await f.jobs.publishedBundle(f.task)).toEqual(output.descriptor);
    expect(await f.storage.read(f.task, "page.png", 10000)).not.toBeNull();
  });
  it("retries post-publication photo cleanup after a storage failure", async () => {
    const f = await fixture();
    const output = await candidate(f.task);
    const remove = vi.spyOn(f.storage, "remove");
    remove.mockRejectedValueOnce(new Error("temporary"));
    await dispatchLocalTask(f.jobs, f.storage, f.task, "worker1", async () => ({
      status: "APPROVED",
      candidate: output,
    }));
    expect(await f.storage.read(f.task, "photo.png", 10000)).not.toBeNull();
    expect(await cleanupLocalTask(f.jobs, f.storage, f.task)).toBe("COMPLETE");
    expect(await f.storage.read(f.task, "photo.png", 10000)).toBeNull();
    expect(await f.jobs.publishedBundle(f.task)).toEqual(output.descriptor);
  });
  it("keeps published assets if cleanup cannot read its durable marker", async () => {
    const f = await fixture();
    const output = await candidate(f.task);
    vi.spyOn(f.jobs, "publishedPhotoCleanupPending").mockRejectedValueOnce(
      new Error("store unavailable"),
    );
    const result = await dispatchLocalTask(f.jobs, f.storage, f.task, "worker1", async () => ({
      status: "APPROVED",
      candidate: output,
    }));
    expect(result?.state).toBe("PUBLISHED");
    expect(await f.storage.read(f.task, "page.png", 10000)).not.toBeNull();
    expect(await cleanupLocalTask(f.jobs, f.storage, f.task)).toBe("COMPLETE");
  });
  it("claims once, stages verified assets, serves them, and withdraws all stored files", async () => {
    const f = await fixture();
    const before = await f.service.snapshot();
    const output = await candidate(f.task);
    const execute = vi.fn(async () => ({ status: "APPROVED" as const, candidate: output }));
    expect(await f.storage.listTasks()).toContain(f.task);
    expect((await dispatchLocalTask(f.jobs, f.storage, f.task, "worker1", execute))?.state).toBe(
      "PUBLISHED",
    );
    const published = await f.service.snapshot();
    expect(published.mode).toBe("LOCAL_PRIVATE_TEST");
    expect(published.eventSeq).toBe(before.eventSeq + 1);
    expect(published.residents.some((resident) => resident.residentId === f.task)).toBe(true);
    expect(
      published.avatars.find((avatar) => avatar.manifest.avatarVersion === f.task)?.manifest.spine,
    ).toEqual(output.descriptor);
    const serialized = JSON.stringify(published);
    expect(serialized).not.toContain(createHash("sha256").update(f.token).digest("hex"));
    expect(serialized).not.toContain("photo.png");
    expect(
      await readPublishedSpineAsset(
        f.jobs,
        f.task,
        output.descriptor.pages[0] ?? "",
        f.storage.assetReader(f.task),
      ),
    ).toEqual(output.assets["page.png"]);
    const path = output.descriptor.pages[0] ?? "";
    const request = new Request(`http://127.0.0.1:3000${path}`, {
      headers: { host: "127.0.0.1:3000" },
    });
    const served = await handleLocalSpineAsset(request, f.jobs, f.storage);
    expect(served.status).toBe(200);
    expect(served.headers.get("cache-control")).toBe("no-store");
    expect(Buffer.from(await served.arrayBuffer())).toEqual(output.assets["page.png"]);
    expect(await dispatchLocalTask(f.jobs, f.storage, f.task, "worker2", execute)).toBeNull();
    expect(execute).toHaveBeenCalledTimes(1);
    expect((await withdrawSpinePhoto(f.service, f.storage, f.token, f.task)).photoCleanup).toBe(
      "PENDING",
    );
    expect(
      await readPublishedSpineAsset(
        f.jobs,
        f.task,
        output.descriptor.pages[0] ?? "",
        f.storage.assetReader(f.task),
      ),
    ).toBeNull();
    expect((await handleLocalSpineAsset(request, f.jobs, f.storage)).status).toBe(404);
    const withdrawn = await f.service.snapshot();
    expect(withdrawn.eventSeq).toBe(published.eventSeq + 1);
    expect(withdrawn.residents.some((resident) => resident.residentId === f.task)).toBe(false);
    expect(withdrawn.mode).toBe("MOCK");
    expect(await f.storage.read(f.task, "page.png", 10000)).toBeNull();
    expect(await f.storage.read(f.task, "photo.png", 10000)).toBeNull();
  });
  it("does not send an altered photo to the tool", async () => {
    const f = await fixture();
    await writeFile(join(f.root, f.task, "photo.png"), Buffer.from("changed"));
    const execute = vi.fn(async () => ({ status: "FAILED" as const }));
    expect((await dispatchLocalTask(f.jobs, f.storage, f.task, "worker1", execute))?.state).toBe(
      "FAILED",
    );
    expect(execute).not.toHaveBeenCalled();
  });
  it("does not publish a result returned after withdrawal", async () => {
    const f = await fixture();
    const output = await candidate(f.task);
    const result = await dispatchLocalTask(f.jobs, f.storage, f.task, "worker1", async () => {
      expect((await withdrawSpinePhoto(f.service, f.storage, f.token, f.task)).photoCleanup).toBe(
        "PENDING",
      );
      expect((await withdrawSpinePhoto(f.service, f.storage, f.token, f.task)).photoCleanup).toBe(
        "PENDING",
      );
      return { status: "APPROVED", candidate: output };
    });
    expect(result?.state).toBe("WITHDRAWN");
    expect(await f.jobs.publishedBundle(f.task)).toBeNull();
    expect(await f.storage.read(f.task, "page.png", 10000)).toBeNull();
  });
  it("expires and cleans an unstarted task after the visitor session closes", async () => {
    const f = await fixture();
    await f.service.closeSession(f.token);
    expect(await cleanupLocalTask(f.jobs, f.storage, f.task)).toBe("COMPLETE");
    expect(await f.storage.read(f.task, "photo.png", 10000)).toBeNull();
    expect(await f.jobs.publishedBundle(f.task)).toBeNull();
    expect(await cleanupLocalTask(f.jobs, f.storage, f.task)).toBe("NOT_REQUIRED");
  });
  it("cleans an isolated completed preflight after withdrawal without affecting other tasks", async () => {
    const f = await fixture();
    const other = await fixture();
    const workspace = join(f.root, f.task, "tool-workspace");
    await mkdir(join(workspace, "runtime", "work"), { recursive: true });
    await writeFile(join(workspace, "runtime", "work", "photo-copy.png"), "synthetic");
    const photo = await f.storage.read(f.task, "photo.png", 1024 * 1024);
    if (!photo) throw new Error("PHOTO_MISSING");
    await f.jobs.claim(f.task, "preflight");
    await f.jobs.bindToolFlow(
      f.task,
      "preflight",
      `flow-${"a".repeat(32)}`,
      createHash("sha256").update(photo).digest("hex"),
    );
    await f.jobs.markPrepared(f.task, "preflight");
    expect((await withdrawSpinePhoto(f.service, f.storage, f.token, f.task)).photoCleanup).toBe(
      "PENDING",
    );
    expect(await cleanupLocalTask(f.jobs, f.storage, f.task)).toBe("COMPLETE");
    await expect(
      readFile(join(workspace, "runtime", "work", "photo-copy.png")),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await f.storage.read(f.task, "photo.png", 1024 * 1024)).toBeNull();
    expect(await other.storage.read(other.task, "photo.png", 1024 * 1024)).not.toBeNull();
  });
  it("keeps tool cleanup pending when a live attempt has an unknown result", async () => {
    const f = await fixture();
    const workspace = join(f.root, f.task, "tool-workspace");
    await mkdir(workspace);
    await writeFile(join(workspace, "in-flight.txt"), "synthetic");
    const photo = await f.storage.read(f.task, "photo.png", 1024 * 1024);
    if (!photo) throw new Error("PHOTO_MISSING");
    await f.jobs.claim(f.task, "preflight");
    await f.jobs.bindToolFlow(
      f.task,
      "preflight",
      `flow-${"a".repeat(32)}`,
      createHash("sha256").update(photo).digest("hex"),
    );
    await f.jobs.markPrepared(f.task, "preflight");
    await f.jobs.claimPreparedLive(f.task, "live", 1);
    await f.jobs.markUnknown(f.task, "live");
    await withdrawSpinePhoto(f.service, f.storage, f.token, f.task);
    expect(await cleanupLocalTask(f.jobs, f.storage, f.task)).toBe("PENDING");
    expect(await readFile(join(workspace, "in-flight.txt"), "utf8")).toBe("synthetic");
  });
  it("removes a published resident when the visitor session closes", async () => {
    const f = await fixture();
    const output = await candidate(f.task);
    await dispatchLocalTask(f.jobs, f.storage, f.task, "worker1", async () => ({
      status: "APPROVED",
      candidate: output,
    }));
    expect(
      (await f.service.snapshot()).residents.some((resident) => resident.residentId === f.task),
    ).toBe(true);
    await f.service.closeSession(f.token);
    expect(
      (await f.service.snapshot()).residents.some((resident) => resident.residentId === f.task),
    ).toBe(false);
    expect(await f.jobs.publishedBundle(f.task)).toBeNull();
  });
  it("expires a published resident and denies assets when the session expires", async () => {
    const root = await mkdtemp(join(tmpdir(), "ai-city-expiry-"));
    roots.push(root);
    const storage = await LocalSpineStorage.open(root);
    const store = new MemoryVisitorStore();
    let now = Date.parse("2026-11-05T00:00:00Z");
    const service = new VisitorService(store, () => now);
    const jobs = new SpineJobs(store, () => now);
    const { token } = await service.createOpenSession();
    const photo = await sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } })
      .png()
      .toBuffer();
    const { task } = await submitSpinePhoto(service, storage, token, photo, {
      processing: true,
      externalModelUpload: true,
      automaticPublication: true,
      version: 2,
    });
    const output = await candidate(task);
    await dispatchLocalTask(jobs, storage, task, "worker1", async () => ({
      status: "APPROVED",
      candidate: output,
    }));
    expect(
      (await service.snapshot()).residents.some((resident) => resident.residentId === task),
    ).toBe(true);
    now += 25 * 60 * 60 * 1000;
    expect(await jobs.publishedBundle(task)).toBeNull();
    expect(
      (await service.snapshot()).residents.some((resident) => resident.residentId === task),
    ).toBe(false);
    expect(await cleanupLocalTask(jobs, storage, task)).toBe("PENDING");
    expect(await storage.read(task, "photo.png", 10000)).toBeNull();
  });
  it("withdraws an expired resident even while a tool workspace remains pending", async () => {
    const root = await mkdtemp(join(tmpdir(), "ai-city-expiry-pending-"));
    roots.push(root);
    const storage = await LocalSpineStorage.open(root);
    const store = new MemoryVisitorStore();
    let now = Date.parse("2026-11-05T00:00:00Z");
    const service = new VisitorService(store, () => now);
    const jobs = new SpineJobs(store, () => now);
    const { token } = await service.createOpenSession();
    const photo = await sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } })
      .png()
      .toBuffer();
    const { task } = await submitSpinePhoto(service, storage, token, photo, {
      processing: true,
      externalModelUpload: true,
      automaticPublication: true,
      version: 2,
    });
    await mkdir(join(root, task, "tool-workspace"));
    const output = await candidate(task);
    await dispatchLocalTask(jobs, storage, task, "worker1", async () => ({
      status: "APPROVED",
      candidate: output,
    }));
    now += 25 * 60 * 60 * 1000;
    expect(await cleanupLocalTask(jobs, storage, task)).toBe("PENDING");
    expect(store.dump().get(`jobs/spine-${task}`)?.state).toBe("WITHDRAWN");
    expect(await storage.read(task, "page.png", 10000)).toBeNull();
  });
  it("allows an administrator to withdraw a Spine resident from the city", async () => {
    const f = await fixture();
    const output = await candidate(f.task);
    await dispatchLocalTask(f.jobs, f.storage, f.task, "worker1", async () => ({
      status: "APPROVED",
      candidate: output,
    }));
    await f.service.removeResident(f.task);
    expect(
      (await f.service.snapshot()).residents.some((resident) => resident.residentId === f.task),
    ).toBe(false);
    expect(await f.jobs.publishedBundle(f.task)).toBeNull();
    expect((await f.service.spineJobStatus(f.token, f.task)).state).toBe("WITHDRAWN");
  });
  it("delivers the resident to a paired display and removes it after withdrawal", async () => {
    const f = await fixture();
    const device = new DeviceLinkService(new LocalParticipationService(), "a".repeat(64));
    const admin = device.login("a".repeat(64));
    const display = device.pair(device.createPairing(admin).code);
    device.update(admin, { expectedRevision: 0, displayMode: "LIVE" });
    const request = () =>
      new Request("http://127.0.0.1:3000/api/link/display", {
        headers: { host: "127.0.0.1:3000", cookie: `ai-city-link=${display}` },
      });
    const output = await candidate(f.task);
    await dispatchLocalTask(f.jobs, f.storage, f.task, "worker1", async () => ({
      status: "APPROVED",
      candidate: output,
    }));
    const firstResponse = await handlePersistentDeviceRequest(request(), device, f.service, true);
    expect(firstResponse.status).toBe(200);
    const first = DeviceDisplaySchema.parse(await firstResponse.json());
    expect(first.snapshot?.residents.some((resident) => resident.residentId === f.task)).toBe(true);
    await withdrawSpinePhoto(f.service, f.storage, f.token, f.task);
    const nextResponse = await handlePersistentDeviceRequest(request(), device, f.service, true);
    const next = DeviceDisplaySchema.parse(await nextResponse.json());
    expect(next.snapshot?.residents.some((resident) => resident.residentId === f.task)).toBe(false);
    expect(next.snapshot?.eventSeq).toBeGreaterThan(first.snapshot?.eventSeq ?? -1);
  });
  it("processes a bounded queue without retrying a completed task", async () => {
    const f = await fixture();
    const next = await f.service.createOpenSession();
    const photo = await f.storage.read(f.task, "photo.png", 1024 * 1024);
    if (!photo) throw new Error("PHOTO_NOT_SAVED");
    const second = await submitSpinePhoto(f.service, f.storage, next.token, photo, {
      processing: true,
      externalModelUpload: true,
      automaticPublication: true,
      version: 2,
    });
    const execute = vi.fn(async () => ({ status: "REQUIRES_REVIEW" as const }));
    expect((await pollLocalSpineTasks(f.jobs, f.storage, execute, 1)).claimed).toBe(1);
    expect((await pollLocalSpineTasks(f.jobs, f.storage, execute, 1)).claimed).toBe(1);
    expect((await pollLocalSpineTasks(f.jobs, f.storage, execute, 1)).claimed).toBe(0);
    expect(execute).toHaveBeenCalledTimes(2);
    expect((await f.service.spineJobStatus(next.token, second.task)).state).toBe("REQUIRES_REVIEW");
  });
});
