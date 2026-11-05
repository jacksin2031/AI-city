import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ToolOutcome } from "./worker";

type Candidate = Extract<ToolOutcome, { status: "APPROVED" }>["candidate"];

const MAX_FILE = 32 * 1024 * 1024;

async function readRegular(directory: string, name: string): Promise<Buffer> {
  if (!/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/.test(name)) throw new Error("BUNDLE_FILE_NAME");
  const path = join(directory, name);
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_FILE)
    throw new Error("BUNDLE_FILE_INVALID");
  return readFile(path);
}

/**
 * Turns a tool export directory into the public candidate shape. It only reads fixed names and the
 * atlas-listed pages, never follows links, and leaves integrity and approval to the publisher.
 */
export async function loadToolBundleCandidate(
  task: string,
  directory: string,
  reviewApproved: boolean,
): Promise<Candidate> {
  const manifest = await readRegular(directory, "build-manifest.json");
  const skeleton = await readRegular(directory, "skeleton.json");
  const atlas = await readRegular(directory, "skeleton.atlas");
  const policy = await readRegular(directory, "orientation-policy.json");
  const pages = [
    ...new Set(
      [...atlas.toString("utf8").matchAll(/^([A-Za-z0-9_-]+\.png)[ \t]*\r?$/gm)].map(
        (match) => match[1] as string,
      ),
    ),
  ];
  if (pages.length === 0 || pages.length > 32) throw new Error("BUNDLE_PAGES");
  const assets: Record<string, Uint8Array> = {
    "skeleton.json": skeleton,
    "skeleton.atlas": atlas,
    "orientation-policy.json": policy,
  };
  for (const page of pages) assets[page] = await readRegular(directory, page);
  const sha256 = createHash("sha256").update(manifest).digest("hex");
  const base = `/avatars/${task}/${sha256.slice(0, 16)}/`;
  return {
    descriptor: {
      runtime: "4.3",
      skeleton: `${base}skeleton.json`,
      atlas: `${base}skeleton.atlas`,
      pages: pages.map((page) => `${base}${page}`),
      orientationPolicy: `${base}orientation-policy.json`,
      buildManifest: `${base}build-manifest.json`,
      sha256,
    },
    manifest,
    assets,
    reviewApproved,
  };
}
