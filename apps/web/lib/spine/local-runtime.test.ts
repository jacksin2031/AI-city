import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getLocalSpineStorage } from "./local-runtime";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
function enable(directory: string) {
  vi.stubEnv("AI_CITY_SPINE_LOCAL_INTAKE", "1");
  vi.stubEnv("AI_CITY_LOOPBACK_PREVIEW", "1");
  vi.stubEnv("AI_CITY_PUBLIC_ORIGIN", "");
  vi.stubEnv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080");
  vi.stubEnv("AI_CITY_VISITOR_PROJECT_ID", "demo-ai-city");
  vi.stubEnv("AI_CITY_SPINE_LOCAL_DIR", directory);
}
describe("local Spine runtime opt-in", () => {
  it("defaults to disabled and rejects hosted or non-demo environments", async () => {
    vi.stubEnv("AI_CITY_SPINE_LOCAL_INTAKE", "");
    expect(await getLocalSpineStorage()).toBeNull();
    const root = await mkdtemp(join(tmpdir(), "ai-city-spine-runtime-"));
    roots.push(root);
    enable(root);
    expect(await getLocalSpineStorage()).not.toBeNull();
    vi.stubEnv("AI_CITY_PUBLIC_ORIGIN", "https://example.org");
    await expect(getLocalSpineStorage()).rejects.toThrow("SPINE_LOCAL_ONLY");
    vi.stubEnv("AI_CITY_PUBLIC_ORIGIN", "");
    vi.stubEnv("AI_CITY_VISITOR_PROJECT_ID", "real-project");
    await expect(getLocalSpineStorage()).rejects.toThrow("SPINE_LOCAL_ONLY");
  });
  it("rejects the project directory even when otherwise enabled", async () => {
    enable(process.cwd());
    await expect(getLocalSpineStorage()).rejects.toThrow("PRIVATE_ROOT_IN_PROJECT");
  });
});
