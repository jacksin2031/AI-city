import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifySpineBundle } from "./bundle";
import { loadToolBundleCandidate } from "./tool-bundle";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const task = "spine-12345678-1234-4234-8234-123456789abc";

async function exportDirectory(atlas: string, pages: string[]) {
  const directory = await mkdtemp(join(tmpdir(), "ai-city-bundle-"));
  roots.push(directory);
  await mkdir(directory, { recursive: true });
  const files: Record<string, Buffer> = {
    "skeleton.json": Buffer.from("{}"),
    "skeleton.atlas": Buffer.from(atlas),
    "orientation-policy.json": Buffer.from("{}"),
  };
  for (const page of pages) files[page] = Buffer.from(`png-${page}`);
  for (const [name, bytes] of Object.entries(files)) await writeFile(join(directory, name), bytes);
  const manifest = {
    runtime: { package: "@esotericsoftware/spine-canvas", version: "4.3.13" },
    runtime_guard_required: true,
    files: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, hash(bytes)])),
  };
  await writeFile(join(directory, "build-manifest.json"), JSON.stringify(manifest));
  return directory;
}

describe("tool export to public candidate", () => {
  it("maps atlas pages into a verifiable scoped descriptor", async () => {
    const directory = await exportDirectory(
      "a-1.png\nsize:4,4\nfilter:Linear,Linear\n\nb_2.png\nsize:4,4\n",
      ["a-1.png", "b_2.png"],
    );
    const candidate = await loadToolBundleCandidate(task, directory, true);
    expect(candidate.descriptor.skeleton.startsWith(`/avatars/${task}/`)).toBe(true);
    expect(candidate.descriptor.pages).toHaveLength(2);
    expect(verifySpineBundle(candidate.descriptor, candidate.manifest, candidate.assets)).toBe(
      true,
    );
  });
  it("rejects a missing page and an atlas without pages", async () => {
    const missing = await exportDirectory("gone.png\nsize:4,4\n", []);
    await expect(loadToolBundleCandidate(task, missing, true)).rejects.toThrow();
    const none = await exportDirectory("size:4,4\n", []);
    await expect(loadToolBundleCandidate(task, none, true)).rejects.toThrow("BUNDLE_PAGES");
  });
});
