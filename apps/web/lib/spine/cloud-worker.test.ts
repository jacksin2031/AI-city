import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VisitorService } from "../visitor/service";
import { MemoryVisitorStore } from "../visitor/test-store";
import { submitCloudPhoto, withdrawCloudPhoto } from "./cloud-photo-intake";
import { pollCloudSpineTasks } from "./cloud-worker";
import { SpineJobs } from "./jobs";
import { LocalSpineStorage } from "./local-storage";
import { readPublishedSpineAsset } from "./published-assets";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const consent = {
  processing: true,
  externalModelUpload: true,
  automaticPublication: true,
  version: 2,
};

/** In-memory stand-ins for the two private-bucket adapters. */
function cloud() {
  const photos = new Map<string, Uint8Array>();
  const assets = new Map<string, Uint8Array>();
  return {
    photos,
    assets,
    photoApi: {
      write: async (task: string, bytes: Uint8Array) => {
        photos.set(task, bytes);
        return "7";
      },
      read: async (task: string, _max: number, generation?: string) => {
        if (generation !== undefined && generation !== "7") throw new Error("GENERATION");
        return photos.get(task) ?? null;
      },
      remove: async (task: string) => {
        photos.delete(task);
      },
    },
    assetApi: {
      write: async (task: string, name: string, bytes: Uint8Array) => {
        assets.set(`${task}/${name}`, bytes);
        return "1";
      },
      remove: async (task: string, name: string) => {
        assets.delete(`${task}/${name}`);
      },
      removeTask: async (task: string) => {
        for (const key of [...assets.keys()]) if (key.startsWith(`${task}/`)) assets.delete(key);
      },
    },
  };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "ai-city-cloudworker-"));
  roots.push(root);
  const storage = await LocalSpineStorage.open(root);
  const store = new MemoryVisitorStore();
  const service = new VisitorService(store);
  const jobs = new SpineJobs(store);
  const { token } = await service.createOpenSession();
  const c = cloud();
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  const job = await submitCloudPhoto(service, c.photoApi, token, png, consent);
  return { storage, service, jobs, token, c, task: job.task };
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
      files: Object.fromEntries(Object.entries(assets).map(([n, b]) => [n, hash(b)])),
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

type Fixture = Awaited<ReturnType<typeof fixture>>;
const poll = (f: Fixture, execute: never, assets: Fixture["c"]["assetApi"] = f.c.assetApi) =>
  pollCloudSpineTasks(
    {
      jobs: f.jobs,
      storage: f.storage,
      photos: f.c.photoApi,
      assets,
      listTasks: async () => [f.task],
      execute,
    },
    1,
  );

describe("cloud photo worker", () => {
  it("pulls the photo, publishes, uploads the bundle and removes every private copy", async () => {
    const f = await fixture();
    expect(f.c.photos.has(f.task)).toBe(true);
    const output = await candidate(f.task);
    const execute = vi.fn(async () => ({ status: "APPROVED" as const, candidate: output }));
    expect((await poll(f, execute as never)).claimed).toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(await f.jobs.publishedBundle(f.task)).toEqual(output.descriptor);
    expect(f.c.assets.size).toBe(5);
    // Delivery reads the bundle back from the cloud copy, behind the publication check.
    const page = output.descriptor.pages[0] ?? "";
    const served = await readPublishedSpineAsset(f.jobs, f.task, page, {
      read: async (path) =>
        f.c.assets.get(`${f.task}/${path.slice(path.lastIndexOf("/") + 1)}`) ?? null,
    });
    expect(served).toEqual(output.assets["page.png"]);
    // The next pass finishes the post-publication cleanup of the cloud photo and the local copy.
    await poll(f, execute as never);
    expect(f.c.photos.has(f.task)).toBe(false);
    expect(await f.storage.read(f.task, "photo.png", 10000)).toBeNull();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("never processes a photo whose bytes no longer match the recorded digest", async () => {
    const f = await fixture();
    f.c.photos.set(f.task, new Uint8Array([1, 2, 3]));
    const execute = vi.fn();
    expect((await poll(f, execute as never)).claimed).toBe(0);
    expect(execute).not.toHaveBeenCalled();
  });

  it("skips a withdrawn job and removes its cloud photo and assets", async () => {
    const f = await fixture();
    f.c.assets.set(`${f.task}/page.png`, new Uint8Array([1]));
    const result = await withdrawCloudPhoto(f.service, f.c.photoApi, f.c.assetApi, f.token, f.task);
    expect(result.state).toBe("WITHDRAWN");
    expect(f.c.photos.has(f.task)).toBe(false);
    expect(f.c.assets.size).toBe(0);
    const execute = vi.fn();
    await poll(f, execute as never);
    expect(execute).not.toHaveBeenCalled();
  });

  it("treats a cloud upload failure as UNKNOWN: nothing published and nothing re-sent", async () => {
    const f = await fixture();
    const output = await candidate(f.task);
    const execute = vi.fn(async () => ({ status: "APPROVED" as const, candidate: output }));
    const broken = {
      ...f.c.assetApi,
      write: async () => {
        throw new Error("bucket unavailable");
      },
    };
    await poll(f, execute as never, broken);
    expect(await f.jobs.publishedBundle(f.task)).toBeNull();
    await poll(f, execute as never);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
