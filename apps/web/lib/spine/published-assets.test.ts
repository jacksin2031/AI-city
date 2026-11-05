import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { MemoryVisitorStore } from "../visitor/test-store";
import { SpineJobs } from "./jobs";
import { readPublishedSpineAsset } from "./published-assets";

async function fixture() {
  const owner = "a".repeat(64);
  const base = "/avatars/person/v1/";
  const files = {
    "skeleton.json": Buffer.from("{}"),
    "skeleton.atlas": Buffer.from("atlas"),
    "orientation-policy.json": Buffer.from("{}"),
    "page.png": Buffer.from("png"),
  };
  const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
  const manifest = Buffer.from(
    JSON.stringify({
      runtime: { package: "@esotericsoftware/spine-canvas", version: "4.3.13" },
      runtime_guard_required: true,
      files: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, hash(bytes)])),
    }),
  );
  const descriptor = {
    runtime: "4.3" as const,
    skeleton: `${base}skeleton.json`,
    atlas: `${base}skeleton.atlas`,
    pages: [`${base}page.png`],
    orientationPolicy: `${base}orientation-policy.json`,
    buildManifest: `${base}build-manifest.json`,
    sha256: hash(manifest),
  };
  const jobs = new SpineJobs(new MemoryVisitorStore());
  await jobs.create("task1", owner, "b".repeat(64), {
    processing: true,
    automaticPublication: true,
    version: 1,
    recordedAt: "2026-11-05T00:00:00.000Z",
  });
  await jobs.claim("task1", "worker1");
  const read = vi.fn(async (path: string) =>
    path === descriptor.buildManifest
      ? manifest
      : (files[path.slice(base.length) as keyof typeof files] ?? null),
  );
  return { jobs, owner, files, manifest, descriptor, storage: { read } };
}

describe("published Spine asset gate", () => {
  it("serves only verified assets belonging to a published job", async () => {
    const f = await fixture();
    expect(
      await readPublishedSpineAsset(f.jobs, "task1", f.descriptor.skeleton, f.storage),
    ).toBeNull();
    expect(f.storage.read).not.toHaveBeenCalled();
    await f.jobs.publish("task1", "worker1", {
      descriptor: f.descriptor,
      manifest: f.manifest,
      assets: f.files,
      reviewApproved: true,
    });
    expect(
      await readPublishedSpineAsset(f.jobs, "task1", f.descriptor.skeleton, f.storage),
    ).toEqual(f.files["skeleton.json"]);
    const reads = f.storage.read.mock.calls.length;
    expect(
      await readPublishedSpineAsset(f.jobs, "task1", "/avatars/person/v1/secret.png", f.storage),
    ).toBeNull();
    expect(f.storage.read).toHaveBeenCalledTimes(reads);
    await f.jobs.withdraw("task1", f.owner);
    expect(
      await readPublishedSpineAsset(f.jobs, "task1", f.descriptor.skeleton, f.storage),
    ).toBeNull();
  });
  it("rejects altered bytes and withdrawal while reading", async () => {
    const f = await fixture();
    await f.jobs.publish("task1", "worker1", {
      descriptor: f.descriptor,
      manifest: f.manifest,
      assets: f.files,
      reviewApproved: true,
    });
    f.storage.read.mockImplementation(async (path) =>
      path === f.descriptor.buildManifest ? f.manifest : Buffer.from("changed"),
    );
    expect(
      await readPublishedSpineAsset(f.jobs, "task1", f.descriptor.skeleton, f.storage),
    ).toBeNull();
    f.storage.read.mockImplementation(async (path) => {
      if (path === f.descriptor.buildManifest) return f.manifest;
      await f.jobs.withdraw("task1", f.owner);
      return f.files["skeleton.json"];
    });
    expect(
      await readPublishedSpineAsset(f.jobs, "task1", f.descriptor.skeleton, f.storage),
    ).toBeNull();
  });
});
