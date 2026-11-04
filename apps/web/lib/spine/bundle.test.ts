import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySpineBundle } from "./bundle";

const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const bytes = (value: string) => Buffer.from(value, "utf8");

function fixture() {
  const files = {
    "skeleton.json": bytes('{"skeleton":{"spine":"4.3.00"}}'),
    "skeleton.atlas": bytes("page.png\nsize: 1,1\n"),
    "orientation-policy.json": bytes("{}"),
    "page.png": bytes("synthetic image"),
  };
  const manifest = bytes(
    JSON.stringify({
      runtime: { package: "@esotericsoftware/spine-canvas", version: "4.3.13" },
      runtime_guard_required: true,
      files: Object.fromEntries(Object.entries(files).map(([name, data]) => [name, hash(data)])),
    }),
  );
  const base = "/avatars/character1/version1/";
  const descriptor = {
    runtime: "4.3" as const,
    skeleton: `${base}skeleton.json`,
    atlas: `${base}skeleton.atlas`,
    pages: [`${base}page.png`],
    orientationPolicy: `${base}orientation-policy.json`,
    buildManifest: `${base}build-manifest.json`,
    sha256: hash(manifest),
  };
  return { descriptor, manifest, files };
}

describe("Spine bundle integrity boundary", () => {
  it("accepts matching synthetic files and manifest", () => {
    const f = fixture();
    expect(verifySpineBundle(f.descriptor, f.manifest, f.files)).toBe(true);
  });
  it("rejects tampering, missing assets and a changed manifest", () => {
    const f = fixture();
    expect(
      verifySpineBundle(f.descriptor, f.manifest, { ...f.files, "page.png": bytes("changed") }),
    ).toBe(false);
    expect(verifySpineBundle(f.descriptor, f.manifest, { ...f.files, "page.png": undefined })).toBe(
      false,
    );
    expect(verifySpineBundle(f.descriptor, bytes("{}"), f.files)).toBe(false);
  });
  it("rejects unsafe manifest paths, unsupported versions and extra resources", () => {
    const f = fixture();
    const altered = (data: object) => {
      const manifest = bytes(JSON.stringify(data));
      return { manifest, descriptor: { ...f.descriptor, sha256: hash(manifest) } };
    };
    const hashes = Object.fromEntries(
      Object.entries(f.files).map(([name, data]) => [name, hash(data)]),
    );
    for (const data of [
      {
        runtime: { package: "@esotericsoftware/spine-canvas", version: "4.2.0" },
        runtime_guard_required: true,
        files: hashes,
      },
      {
        runtime: { package: "@esotericsoftware/spine-canvas", version: "4.3.13" },
        runtime_guard_required: false,
        files: hashes,
      },
      {
        runtime: { package: "@esotericsoftware/spine-canvas", version: "4.3.13" },
        runtime_guard_required: true,
        files: { ...hashes, "../private": "a".repeat(64) },
      },
    ]) {
      const changed = altered(data);
      expect(verifySpineBundle(changed.descriptor, changed.manifest, f.files)).toBe(false);
    }
    expect(
      verifySpineBundle(f.descriptor, f.manifest, { ...f.files, "private.png": bytes("no") }),
    ).toBe(false);
  });
});
