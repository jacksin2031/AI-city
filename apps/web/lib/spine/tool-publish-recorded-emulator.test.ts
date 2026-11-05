import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Firestore } from "@google-cloud/firestore";
import { describe, expect, it } from "vitest";
import { FirestoreVisitorStore } from "../visitor/firestore";
import { VisitorService } from "../visitor/service";
import { SpineJobs } from "./jobs";
import { dispatchLocalTask } from "./local-dispatch";
import { LocalSpineStorage } from "./local-storage";
import { submitSpinePhoto } from "./photo-intake";
import { readPublishedSpineAsset } from "./published-assets";
import { loadToolBundleCandidate } from "./tool-bundle";

// Zero model calls: publishes an already generated tool export through the real worker path.
const bundleDirectory = process.env.AI_CITY_SPINE_RECORDED_BUNDLE ?? "";
const photoPath = process.env.AI_CITY_SPINE_LIVE_PHOTO ?? "";
const enabled =
  process.env.FIRESTORE_EMULATOR_HOST === "127.0.0.1:8080" &&
  existsSync(join(bundleDirectory, "build-manifest.json")) &&
  existsSync(photoPath);

describe.skipIf(!enabled)("recorded tool export through the publish path", () => {
  it("publishes, serves and withdraws a real generated bundle", async () => {
    const root = await mkdtemp(join(tmpdir(), "ai-city-recorded-"));
    const db = new Firestore({ projectId: "demo-ai-city", preferRest: false });
    try {
      const store = new FirestoreVisitorStore(db, `rec-${randomUUID()}`);
      const service = new VisitorService(store);
      const jobs = new SpineJobs(store);
      const storage = await LocalSpineStorage.open(root);
      const { token } = await service.createOpenSession();
      const { task } = await submitSpinePhoto(service, storage, token, await readFile(photoPath), {
        processing: true,
        externalModelUpload: true,
        automaticPublication: true,
        version: 2,
      });
      const owner = createHash("sha256").update(token).digest("hex");
      const done = await dispatchLocalTask(
        jobs,
        storage,
        task,
        `worker-${randomUUID()}`,
        async () => ({
          status: "APPROVED",
          candidate: await loadToolBundleCandidate(task, bundleDirectory, true),
        }),
      );
      expect(done?.state).toBe("PUBLISHED");
      const bundle = await jobs.publishedBundle(task);
      expect(bundle?.pages.length).toBeGreaterThan(0);
      if (!bundle) return;
      const read = (path: string) =>
        readPublishedSpineAsset(jobs, task, path, {
          read: (name, max) => storage.read(task, name.slice(name.lastIndexOf("/") + 1), max),
        });
      expect((await read(bundle.skeleton))?.byteLength ?? 0).toBeGreaterThan(0);
      expect((await read(bundle.pages[0] as string))?.byteLength ?? 0).toBeGreaterThan(0);
      expect((await jobs.get(task, owner)).state).toBe("PUBLISHED");
    } finally {
      await db.terminate();
      await rm(root, { recursive: true, force: true });
    }
  }, 120_000);
});
