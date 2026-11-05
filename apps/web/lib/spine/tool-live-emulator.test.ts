import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { Firestore } from "@google-cloud/firestore";
import { describe, expect, it } from "vitest";
import { FirestoreVisitorStore } from "../visitor/firestore";
import { VisitorService } from "../visitor/service";
import { SpineJobs } from "./jobs";
import { LocalSpineStorage } from "./local-storage";
import { submitSpinePhoto } from "./photo-intake";
import { readPublishedSpineAsset } from "./published-assets";

const project = resolve(process.cwd());
const tool = join(project, "apps/web/app/city/spine-lab/SpineSkinTool_v1.0");
const python =
  process.platform === "win32"
    ? join(tool, "runtime/python/.venv/Scripts/python.exe")
    : join(tool, "runtime/python/.venv/bin/python");
const photoPath = process.env.AI_CITY_SPINE_LIVE_PHOTO ?? "";
// SPENDS REAL MODEL CALLS: opt in with the confirmation string and an operator-chosen photo.
const enabled =
  process.env.FIRESTORE_EMULATOR_HOST === "127.0.0.1:8080" &&
  process.env.AI_CITY_SPINE_LIVE_CONFIRM === "I_AUTHORIZE_REAL_MODEL_CALLS" &&
  existsSync(python) &&
  existsSync(photoPath);

describe.skipIf(!enabled)("live photo to published character with the local emulator", () => {
  it(
    "generates, auto-publishes and serves a verified Spine bundle",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "ai-city-live-"));
      const namespace = `live-${randomUUID()}`;
      const db = new Firestore({ projectId: "demo-ai-city", preferRest: false });
      try {
        const store = new FirestoreVisitorStore(db, namespace);
        const service = new VisitorService(store);
        const jobs = new SpineJobs(store);
        const storage = await LocalSpineStorage.open(root);
        const { token } = await service.createOpenSession();
        const { task } = await submitSpinePhoto(
          service,
          storage,
          token,
          await readFile(photoPath),
          {
            processing: true,
            externalModelUpload: true,
            automaticPublication: true,
            version: 2,
          },
        );
        const env: NodeJS.ProcessEnv = {
          ...process.env,
          AI_CITY_ENABLE_LOCAL_MOCK: "1",
          AI_CITY_ENABLE_VISITORS: "1",
          AI_CITY_VISITOR_PROJECT_ID: "demo-ai-city",
          AI_CITY_VISITOR_NAMESPACE: namespace,
          AI_CITY_VISITOR_HMAC_KEY: "synthetic-test-key".repeat(3),
          AI_CITY_SPINE_LOCAL_INTAKE: "1",
          AI_CITY_SPINE_LOCAL_DIR: root,
          AI_CITY_PUBLIC_ORIGIN: "",
          FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
        };
        delete env.GOOGLE_APPLICATION_CREDENTIALS;
        const run = promisify(execFile);
        const out = await run(
          process.execPath,
          [
            join(project, "scripts/run-spine-preflight.mjs"),
            "--once",
            "--live",
            `--cap=${process.env.AI_CITY_SPINE_LIVE_CAP ?? "12"}`,
          ],
          { cwd: project, env, windowsHide: true, timeout: 3 * 60 * 60 * 1000, maxBuffer: 8192 },
        );
        expect(out.stdout).toContain('"claimed":1');
        const owner = createHash("sha256").update(token).digest("hex");
        const record = await jobs.get(task, owner);
        expect(record.state).toBe("PUBLISHED");
        const bundle = await jobs.publishedBundle(task);
        expect(bundle).not.toBeNull();
        if (!bundle) return;
        const skeleton = await readPublishedSpineAsset(jobs, task, bundle.skeleton, {
          read: (path, max) => storage.read(task, path.slice(path.lastIndexOf("/") + 1), max),
        });
        expect(skeleton?.byteLength ?? 0).toBeGreaterThan(0);
        process.stdout.write(`LIVE_TASK=${task} PAGES=${bundle.pages.length}\n`);
      } finally {
        await db.terminate();
        if (process.env.AI_CITY_SPINE_LIVE_KEEP === "1")
          process.stdout.write(`KEPT=${root}
`);
        else await rm(root, { recursive: true, force: true });
      }
    },
    3 * 60 * 60 * 1000,
  );
});
