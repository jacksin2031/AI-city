import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SpineJobs } from "../spine/jobs";
import { VisitorService } from "./service";
import { MemoryVisitorStore } from "./test-store";

const TASK = "spine-11111111-1111-4111-8111-111111111111";

const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");

/** A synthetic but hash-consistent bundle: the same shape the production verifier accepts. */
function candidate() {
  const assets = {
    "skeleton.json": Buffer.from('{"skeleton":{"spine":"4.3.00"}}'),
    "skeleton.atlas": Buffer.from("page.png\nsize: 1,1\n"),
    "orientation-policy.json": Buffer.from("{}"),
    "page.png": Buffer.from("synthetic image"),
  };
  const manifest = Buffer.from(
    JSON.stringify({
      runtime: { package: "@esotericsoftware/spine-canvas", version: "4.3.13" },
      runtime_guard_required: true,
      files: Object.fromEntries(Object.entries(assets).map(([n, b]) => [n, hash(b)])),
    }),
  );
  const base = `/avatars/${TASK}/v1/`;
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

describe("the participant's own character bundle", () => {
  it("is hidden until the character is published, then readable only by its owner", async () => {
    const store = new MemoryVisitorStore();
    const now = Date.parse("2026-11-06T00:00:00Z");
    const service = new VisitorService(store, () => now);
    const consent = {
      processing: true,
      externalModelUpload: true,
      automaticPublication: true,
      version: 2 as const,
    };
    const owner = await service.createOpenSession();
    await service.createSpineJob(owner.token, TASK, "a".repeat(64), consent);

    // Owned but not yet published: the card has nothing to draw.
    expect(await service.currentSpineBundle(owner.token)).toBeNull();

    const jobs = new SpineJobs(store, () => now);
    const ownerDigest = createHash("sha256").update(owner.token).digest("hex");
    await jobs.claim(TASK, "worker");
    const output = candidate();
    await jobs.publish(TASK, "worker", output);

    expect(await service.currentSpineBundle(owner.token)).toEqual(output.descriptor);

    // Another participant must never see it, even with a live session of their own.
    const stranger = await service.createOpenSession();
    expect(await service.currentSpineBundle(stranger.token)).toBeNull();
    // A forged token is not a session at all.
    await expect(service.currentSpineBundle("f".repeat(64))).rejects.toMatchObject({
      code: "SESSION_REQUIRED",
    });
    expect(ownerDigest).toHaveLength(64);
  });
});
