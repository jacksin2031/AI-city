import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { checkBundleBytes, prepareSpineBundle, validatePngHeader } from "./spine-bundle";

describe("browser Spine bundle verification", () => {
  const base = "/avatars/person/v1/";
  const descriptor = {
    runtime: "4.3" as const,
    skeleton: `${base}skeleton.json`,
    atlas: `${base}skeleton.atlas`,
    pages: [`${base}page.png`],
    orientationPolicy: `${base}orientation-policy.json`,
    buildManifest: `${base}build-manifest.json`,
    sha256: "0".repeat(64),
  };
  it("rejects a modified manifest before loading any asset", async () => {
    await expect(checkBundleBytes(descriptor, new TextEncoder().encode("{}"), {})).rejects.toThrow(
      "SPINE_MANIFEST_HASH",
    );
  });
  it("rejects cross-bundle resource paths", async () => {
    await expect(
      checkBundleBytes(
        { ...descriptor, pages: ["/avatars/other/v1/page.png"] },
        new Uint8Array(),
        {},
      ),
    ).rejects.toThrow("SPINE_DESCRIPTOR_INVALID");
  });
  it("accepts matching bytes and rejects a changed texture", async () => {
    const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
    const bytes = (s: string) => new TextEncoder().encode(s);
    const assets = {
      "skeleton.json": bytes("{}"),
      "skeleton.atlas": bytes("atlas"),
      "orientation-policy.json": bytes("{}"),
      "page.png": bytes("png"),
    };
    const manifest = bytes(
      JSON.stringify({
        skin: "synthetic",
        runtime: { package: "@esotericsoftware/spine-canvas", version: "4.3.13" },
        runtime_guard_required: true,
        files: Object.fromEntries(Object.entries(assets).map(([name, data]) => [name, hash(data)])),
      }),
    );
    const matching = { ...descriptor, sha256: hash(manifest) };
    expect((await checkBundleBytes(matching, manifest, assets)).skin).toBe("synthetic");
    await expect(
      checkBundleBytes(matching, manifest, { ...assets, "page.png": bytes("changed") }),
    ).rejects.toThrow("SPINE_ASSET_INVALID");
  });
  it("rejects oversized and invalid PNG headers before decoding", () => {
    const data = Uint8Array.from([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1,
    ]);
    expect(() => validatePngHeader(data)).not.toThrow();
    data[16] = 1;
    expect(() => validatePngHeader(data)).toThrow("SPINE_IMAGE_INVALID");
    expect(() => validatePngHeader(new Uint8Array(24))).toThrow("SPINE_IMAGE_INVALID");
  });
  it("parses a synthetic Spine 4.3 bundle and releases its image", async () => {
    const encode = (s: string) => new TextEncoder().encode(s);
    const hash = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
    const skeleton = {
      skeleton: { spine: "4.3.00" },
      bones: [{ name: "root" }],
      slots: [{ name: "body", bone: "root", attachment: "body" }],
      skins: [{ name: "synthetic", attachments: { body: { body: { width: 10, height: 20 } } } }],
      animations: Object.fromEntries(
        ["front", "back", "left", "right"].flatMap((d) =>
          ["idle", "trot"].map((a) => [`movement/${a}-${d}`, {}]),
        ),
      ),
    };
    const assets = {
      "skeleton.json": encode(JSON.stringify(skeleton)),
      "skeleton.atlas": encode(
        "page.png\nsize: 1,1\nfilter: Nearest,Nearest\nbody\n  bounds: 0,0,1,1\n",
      ),
      "orientation-policy.json": encode(
        JSON.stringify({ skin: "synthetic", face_slots: [], front_order: [] }),
      ),
      "page.png": Uint8Array.from([
        137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1,
      ]),
    };
    const manifest = encode(
      JSON.stringify({
        skin: "synthetic",
        runtime: { package: "@esotericsoftware/spine-canvas", version: "4.3.13" },
        runtime_guard_required: true,
        files: Object.fromEntries(Object.entries(assets).map(([name, data]) => [name, hash(data)])),
      }),
    );
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 1, height: 1, close })),
    );
    const ctx = { setTransform: vi.fn(), clearRect: vi.fn(), translate: vi.fn(), scale: vi.fn() };
    vi.stubGlobal("document", {
      createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
    });
    try {
      const bundle = await prepareSpineBundle(
        { ...descriptor, sha256: hash(manifest) },
        manifest,
        assets,
      );
      const player = bundle.create();
      player.dispose();
      bundle.dispose();
      bundle.dispose();
      expect(close).toHaveBeenCalledTimes(1);
      expect(() => bundle.create()).toThrow("SPINE_BUNDLE_DISPOSED");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
