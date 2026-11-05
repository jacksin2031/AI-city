import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { Firestore } from "@google-cloud/firestore";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { FirestoreVisitorStore } from "../visitor/firestore";
import { VisitorService } from "../visitor/service";
import { SpineJobs } from "./jobs";
import { LocalSpineStorage } from "./local-storage";
import { submitSpinePhoto } from "./photo-intake";

const project = resolve(process.cwd());
const tool = join(project, "apps/web/app/city/spine-lab/SpineSkinTool_v1.0");
const python =
  process.platform === "win32"
    ? join(tool, "runtime/python/.venv/Scripts/python.exe")
    : join(tool, "runtime/python/.venv/bin/python");
const enabled = process.env.FIRESTORE_EMULATOR_HOST === "127.0.0.1:8080" && existsSync(python);

describe.skipIf(!enabled)("separate tool worker with the local Firestore emulator", () => {
  it("claims a synthetic photo and creates one real, model-disabled tool flow", async () => {
    const root = await mkdtemp(join(tmpdir(), "ai-city-worker-emulator-"));
    const namespace = `test-${randomUUID()}`;
    const db = new Firestore({ projectId: "demo-ai-city", preferRest: false });
    try {
      const store = new FirestoreVisitorStore(db, namespace);
      const service = new VisitorService(store);
      const jobs = new SpineJobs(store);
      const storage = await LocalSpineStorage.open(root);
      const { token } = await service.createOpenSession();
      const photo = await sharp({ create: { width: 8, height: 8, channels: 3, background: "red" } })
        .png()
        .toBuffer();
      const { task } = await submitSpinePhoto(service, storage, token, photo, {
        processing: true,
        externalModelUpload: true,
        automaticPublication: true,
        version: 2,
      });
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
      const script = join(project, "scripts/run-spine-preflight.mjs");
      const first = await run(process.execPath, [script, "--once"], {
        cwd: project,
        env,
        windowsHide: true,
        timeout: 120_000,
        maxBuffer: 4096,
      });
      expect(first.stdout).toContain('"claimed":1');
      const owner = createHash("sha256").update(token).digest("hex");
      const record = await jobs.get(task, owner);
      expect(record.state).toBe("PREPARED");
      expect(record.toolFlow).toMatch(/^flow-[a-f0-9]{32}$/);
      const receipt = JSON.parse(
        await readFile(join(root, task, "tool-workspace/integration-receipt.json"), "utf8"),
      );
      expect(receipt.model_calls).toBe(0);
      expect(receipt.flow).toBe(record.toolFlow);
      const second = await run(process.execPath, [script, "--once"], {
        cwd: project,
        env,
        windowsHide: true,
        timeout: 120_000,
        maxBuffer: 4096,
      });
      expect(second.stdout).not.toContain('"claimed":1');
      expect((await jobs.get(task, owner)).toolFlow).toBe(record.toolFlow);
    } finally {
      await db.terminate();
      await rm(root, { recursive: true, force: true });
    }
  }, 180_000);
});
