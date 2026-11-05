import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Firestore } from "@google-cloud/firestore";
import { describe, expect, it } from "vitest";
import { FirestoreVisitorStore } from "../visitor/firestore";
import { VisitorService } from "../visitor/service";
import { SpineJobs } from "./jobs";
import { pollLocalSpineTasks } from "./local-poller";
import { LocalSpineStorage } from "./local-storage";
import { submitSpinePhoto } from "./photo-intake";
import { readPublishedSpineAsset } from "./published-assets";
import { createToolLiveExecutor } from "./tool-live";

// Zero model calls: real prepare step + a stub "live" script that copies a recorded real export.
const project = resolve(process.cwd());
const tool = join(project, "apps/web/app/city/spine-lab/SpineSkinTool_v1.0");
const python =
  process.platform === "win32"
    ? join(tool, "runtime/python/.venv/Scripts/python.exe")
    : join(tool, "runtime/python/.venv/bin/python");
const recorded = process.env.AI_CITY_SPINE_RECORDED_BUNDLE ?? "";
const photoPath = process.env.AI_CITY_SPINE_LIVE_PHOTO ?? "";
const enabled =
  process.env.FIRESTORE_EMULATOR_HOST === "127.0.0.1:8080" &&
  existsSync(python) &&
  existsSync(join(recorded, "build-manifest.json")) &&
  existsSync(photoPath);

const stub = `
import json, shutil, sys
from pathlib import Path
root, task, source = Path(sys.argv[2]), sys.argv[3], Path(sys.argv[5])
sys.stdin.read()
target = root / task / "stub-export"
shutil.copytree(source, target)
print(json.dumps({"status": "READY", "phase": "DONE", "bundle": "stub-export", "auto_publish": True}))
`;

describe.skipIf(!enabled)("live executor wiring with a recorded export", () => {
  it("prepares, runs the executor, auto-publishes and serves the bundle", async () => {
    const root = await mkdtemp(join(tmpdir(), "ai-city-stub-"));
    const db = new Firestore({ projectId: "demo-ai-city", preferRest: false });
    try {
      const store = new FirestoreVisitorStore(db, `stub-${randomUUID()}`);
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
      const liveScript = join(root, "stub-live.py");
      await writeFile(
        liveScript,
        stub.replace("Path(sys.argv[5])", `Path(${JSON.stringify(recorded)})`),
      );
      const execute = createToolLiveExecutor(
        {
          python,
          script: join(project, "scripts/prepare-spine-tool-task.py"),
          toolRoot: tool,
          liveScript,
          callCap: 12,
        },
        jobs,
        storage,
      );
      const summary = await pollLocalSpineTasks(jobs, storage, execute, 1);
      expect(summary.claimed).toBe(1);
      const owner = createHash("sha256").update(token).digest("hex");
      expect((await jobs.get(task, owner)).state).toBe("PUBLISHED");
      const bundle = await jobs.publishedBundle(task);
      if (!bundle) throw new Error("not published");
      const bytes = await readPublishedSpineAsset(jobs, task, bundle.skeleton, {
        read: (name, max) => storage.read(task, name.slice(name.lastIndexOf("/") + 1), max),
      });
      expect(bytes?.byteLength ?? 0).toBeGreaterThan(0);
    } finally {
      await db.terminate();
      await rm(root, { recursive: true, force: true });
    }
  }, 180_000);
});
