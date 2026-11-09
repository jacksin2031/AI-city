import { createHash } from "node:crypto";
import type { SpineJobs } from "./jobs";

/** An implementation must read private, immutable bytes and never expose paths directly. */
export interface PrivateSpineAssets {
  read(path: string, maxBytes: number): Promise<Uint8Array | null>;
}

/** Rechecks publication on each read. Callers must send no-store and never redirect to private storage. */
export async function readPublishedSpineAsset(
  jobs: SpineJobs,
  task: string,
  path: string,
  storage: PrivateSpineAssets,
): Promise<Uint8Array | null> {
  const bundle = await jobs.publishedBundle(task);
  if (!bundle) return null;
  const paths = [
    bundle.buildManifest,
    bundle.skeleton,
    bundle.atlas,
    bundle.orientationPolicy,
    ...bundle.pages,
  ];
  if (!paths.includes(path)) return null;
  const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
  const manifest = await storage.read(bundle.buildManifest, 1024 * 1024);
  if (!manifest || manifest.byteLength > 1024 * 1024 || hash(manifest) !== bundle.sha256)
    return null;
  let expected: string | undefined;
  if (path !== bundle.buildManifest) {
    try {
      const data: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifest));
      if (!data || typeof data !== "object" || !("files" in data)) return null;
      const files = data.files;
      const name = path.slice(path.lastIndexOf("/") + 1);
      if (!files || typeof files !== "object" || !Object.hasOwn(files, name)) return null;
      const value: unknown = (files as Record<string, unknown>)[name];
      if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) return null;
      expected = value;
    } catch {
      return null;
    }
  }
  const bytes =
    path === bundle.buildManifest ? manifest : await storage.read(path, 32 * 1024 * 1024);
  if (!bytes || bytes.byteLength > 32 * 1024 * 1024 || (expected && hash(bytes) !== expected))
    return null;
  const current = await jobs.publishedBundle(task);
  if (!current || current.sha256 !== bundle.sha256) return null;
  return bytes;
}
