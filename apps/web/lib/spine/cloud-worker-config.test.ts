import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCloudPhotoStorage } from "./cloud-photo-auth";
import { cloudWorkerConfig, openCloudWorkerStorage } from "./cloud-worker-config";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const env = (directory: string) => ({
  AI_CITY_SPINE_CLOUD_PREFLIGHT: "1",
  AI_CITY_VISITOR_PROJECT_ID: "ai-city-511822",
  AI_CITY_VISITOR_NAMESPACE: "test-exhibit",
  AI_CITY_SPINE_PHOTO_BUCKET: "ai-city-photo-test",
  AI_CITY_SPINE_CLOUD_WORK_DIR: directory,
  AI_CITY_SPINE_TOOL_PYTHON: process.execPath,
});
describe("cloud preflight worker configuration", () => {
  it("creates no network requests when configuring an approved project", () => {
    const network = vi.spyOn(globalThis, "fetch");
    expect(() => createCloudPhotoStorage("other-project", "ai-city-photo-test")).toThrow();
    expect(createCloudPhotoStorage("ai-city-511822", "ai-city-photo-test")).toBeDefined();
    expect(network).not.toHaveBeenCalled();
    network.mockRestore();
  });
  it("is disabled by default", () => {
    expect(cloudWorkerConfig({})).toBeNull();
  });
  it("requires explicit project, dedicated bucket, local paths and no emulator", async () => {
    const root = await mkdtemp(join(tmpdir(), "ai-city-cloud-worker-"));
    roots.push(root);
    expect(cloudWorkerConfig(env(root))).toMatchObject({
      projectId: "ai-city-511822",
      namespace: "test-exhibit",
      bucket: "ai-city-photo-test",
    });
    for (const patch of [
      { AI_CITY_VISITOR_PROJECT_ID: "other-project" },
      { AI_CITY_SPINE_PHOTO_BUCKET: "ai-city-511822-private" },
      { AI_CITY_SPINE_CLOUD_WORK_DIR: "relative" },
      { AI_CITY_SPINE_TOOL_PYTHON: "python" },
      { FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" },
    ])
      expect(() => cloudWorkerConfig({ ...env(root), ...patch })).toThrow();
  });
  it("refuses a work root inside or containing the project", async () => {
    await expect(openCloudWorkerStorage(process.cwd(), process.cwd())).rejects.toThrow(
      "PRIVATE_ROOT_INVALID",
    );
    const root = await mkdtemp(join(tmpdir(), "ai-city-cloud-worker-"));
    roots.push(root);
    await expect(openCloudWorkerStorage(root, process.cwd())).resolves.not.toBeNull();
  });
});
