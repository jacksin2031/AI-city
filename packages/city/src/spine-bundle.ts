import { SpineBundleSchema } from "@ai-city/contracts";
import type { SpineAdjustment } from "@ai-city/contracts/spine";
import {
  AtlasAttachmentLoader,
  CanvasTexture,
  SkeletonJson,
  TextureAtlas,
} from "@esotericsoftware/spine-canvas";
import { applySpineOrientation, parseOrientationPolicy } from "./spine-orientation";
import { createSpinePlayer } from "./spine-player";

type Descriptor = NonNullable<import("@ai-city/contracts").AvatarManifest["spine"]>;
type Manifest = { skin: string; files: Record<string, string> };

/** Fetch a scoped public bundle with bounded responses before verifying its contents. */
export async function fetchSpineBundle(descriptor: Descriptor, signal: AbortSignal) {
  if (!SpineBundleSchema.safeParse(descriptor).success) throw new Error("SPINE_DESCRIPTOR_INVALID");
  async function read(path: string, limit: number): Promise<Uint8Array> {
    const response = await fetch(path, { signal, redirect: "error", credentials: "same-origin" });
    if (!response.ok || !response.body) throw new Error("SPINE_FETCH_FAILED");
    const declared = response.headers.get("content-length");
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit))
      throw new Error("SPINE_ASSET_TOO_LARGE");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        length += result.value.byteLength;
        if (length > limit) throw new Error("SPINE_ASSET_TOO_LARGE");
        chunks.push(result.value);
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  }
  const manifest = await read(descriptor.buildManifest, 1024 * 1024);
  if ((await sha(manifest)) !== descriptor.sha256) throw new Error("SPINE_MANIFEST_HASH");
  const paths = [
    descriptor.skeleton,
    descriptor.atlas,
    descriptor.orientationPolicy,
    ...descriptor.pages,
  ];
  const entries: Array<readonly [string, Uint8Array]> = [];
  let remaining = 64 * 1024 * 1024;
  for (const path of paths) {
    const bytes = await read(path, Math.min(remaining, 32 * 1024 * 1024));
    remaining -= bytes.byteLength;
    entries.push([path.slice(path.lastIndexOf("/") + 1), bytes]);
  }
  return prepareSpineBundle(descriptor, manifest, Object.fromEntries(entries));
}

export function validatePngHeader(bytes: Uint8Array): void {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82];
  if (bytes.length < 24 || signature.some((value, index) => bytes[index] !== value))
    throw new Error("SPINE_IMAGE_INVALID");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16),
    height = view.getUint32(20);
  if (!width || !height || width > 4096 || height > 4096 || width * height > 16_777_216)
    throw new Error("SPINE_IMAGE_INVALID");
}

async function sha(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Verify the exact public subset before handing bytes to a runtime or image decoder. */
export async function checkBundleBytes(
  descriptor: Descriptor,
  manifestBytes: Uint8Array,
  assets: Record<string, Uint8Array>,
): Promise<Manifest> {
  if (!SpineBundleSchema.safeParse(descriptor).success) throw new Error("SPINE_DESCRIPTOR_INVALID");
  if (manifestBytes.length > 1024 * 1024 || (await sha(manifestBytes)) !== descriptor.sha256)
    throw new Error("SPINE_MANIFEST_HASH");
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes));
  } catch {
    throw new Error("SPINE_MANIFEST_INVALID");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("SPINE_MANIFEST_INVALID");
  const manifest = value as Record<string, unknown>;
  const runtime = manifest.runtime as Record<string, unknown> | undefined;
  if (
    !runtime ||
    runtime.package !== "@esotericsoftware/spine-canvas" ||
    runtime.version !== "4.3.13" ||
    manifest.runtime_guard_required !== true ||
    typeof manifest.skin !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(manifest.skin) ||
    !manifest.files ||
    typeof manifest.files !== "object" ||
    Array.isArray(manifest.files)
  )
    throw new Error("SPINE_MANIFEST_INVALID");
  const files = manifest.files as Record<string, unknown>;
  if (
    Object.keys(files).some(
      (name) =>
        !/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/.test(name) ||
        typeof files[name] !== "string" ||
        !/^[a-f0-9]{64}$/.test(files[name] as string),
    )
  )
    throw new Error("SPINE_MANIFEST_INVALID");
  const names = [
    descriptor.skeleton,
    descriptor.atlas,
    descriptor.orientationPolicy,
    ...descriptor.pages,
  ].map((path) => path.slice(path.lastIndexOf("/") + 1));
  if (Object.keys(assets).length !== names.length) throw new Error("SPINE_ASSET_INVALID");
  for (const name of names) {
    const content = Object.hasOwn(assets, name) ? assets[name] : undefined;
    if (
      !content ||
      content.length > 32 * 1024 * 1024 ||
      !Object.hasOwn(files, name) ||
      (await sha(content)) !== files[name]
    )
      throw new Error("SPINE_ASSET_INVALID");
  }
  return { skin: manifest.skin, files: files as Record<string, string> };
}

/** Loads only already-fetched bytes; lifetime must outlive all players created from this bundle. */
export async function prepareSpineBundle(
  descriptor: Descriptor,
  manifestBytes: Uint8Array,
  assets: Record<string, Uint8Array>,
) {
  const manifest = await checkBundleBytes(descriptor, manifestBytes, assets);
  const name = (path: string) => path.slice(path.lastIndexOf("/") + 1);
  const decode = (path: string) =>
    new TextDecoder("utf-8", { fatal: true }).decode(assets[name(path)]);
  const policy = parseOrientationPolicy(JSON.parse(decode(descriptor.orientationPolicy)));
  if (policy.skin !== manifest.skin) throw new Error("SPINE_POLICY_SKIN_MISMATCH");
  const atlas = new TextureAtlas(decode(descriptor.atlas));
  const bitmaps: ImageBitmap[] = [];
  try {
    const expected = new Set(descriptor.pages.map(name));
    if (
      atlas.pages.length !== expected.size ||
      atlas.pages.some((page) => !expected.delete(page.name)) ||
      expected.size
    )
      throw new Error("SPINE_ATLAS_PAGES_INVALID");
    for (const page of atlas.pages) {
      const bytes = assets[page.name];
      if (!bytes) throw new Error("SPINE_ASSET_INVALID");
      validatePngHeader(bytes);
      const bitmap = await createImageBitmap(
        new Blob([Uint8Array.from(bytes)], { type: "image/png" }),
      );
      bitmaps.push(bitmap);
      page.setTexture(new CanvasTexture(bitmap));
    }
    const data = new SkeletonJson(new AtlasAttachmentLoader(atlas)).readSkeletonData(
      decode(descriptor.skeleton),
    );
    let disposed = false;
    return {
      create(adjustment?: SpineAdjustment) {
        if (disposed) throw new Error("SPINE_BUNDLE_DISPOSED");
        return createSpinePlayer(
          data,
          document.createElement("canvas"),
          (skeleton, direction) => applySpineOrientation(skeleton, direction, policy),
          manifest.skin,
          adjustment,
        );
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        atlas.dispose();
        for (const bitmap of bitmaps) bitmap.close();
      },
    };
  } catch (error) {
    atlas.dispose();
    for (const bitmap of bitmaps) bitmap.close();
    throw error;
  }
}
