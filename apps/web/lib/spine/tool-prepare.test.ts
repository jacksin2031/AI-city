import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { VisitorService } from "../visitor/service";
import { MemoryVisitorStore } from "../visitor/test-store";
import { SpineJobs } from "./jobs";
import { cleanupLocalTask } from "./local-cleanup";
import { pollLocalSpineTasks } from "./local-poller";
import { LocalSpineStorage } from "./local-storage";
import { submitSpinePhoto, withdrawSpinePhoto } from "./photo-intake";
import { inspectToolTask } from "./tool-inspect";
import { createToolPreflightExecutor } from "./tool-preflight";
import { prepareToolTask } from "./tool-prepare";
import { recoverToolPreflight } from "./tool-recovery";

const project = resolve(process.cwd());
const toolRoot = join(project, "apps/web/app/city/spine-lab/SpineSkinTool_v1.0");
const python =
  process.platform === "win32"
    ? join(toolRoot, "runtime/python/.venv/Scripts/python.exe")
    : join(toolRoot, "runtime/python/.venv/bin/python");

describe("real Spine tool task preparation", () => {
  it.skipIf(!existsSync(python))(
    "creates a private task and binds its flow without invoking a model",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "ai-city-tool-prepare-"));
      try {
        const storage = await LocalSpineStorage.open(root);
        const store = new MemoryVisitorStore();
        const service = new VisitorService(store);
        const jobs = new SpineJobs(store);
        const { token } = await service.createOpenSession();
        const image = await sharp({
          create: { width: 8, height: 8, channels: 3, background: "red" },
        })
          .png()
          .toBuffer();
        const { task } = await submitSpinePhoto(service, storage, token, image, {
          processing: true,
          externalModelUpload: true,
          automaticPublication: true,
          version: 2,
        });
        const owner = createHash("sha256").update(token).digest("hex");
        const photo = await storage.read(task, "photo.png", 1024 * 1024);
        if (!photo) throw new Error("PHOTO_MISSING");
        const config = {
          python,
          script: join(project, "scripts/prepare-spine-tool-task.py"),
          toolRoot,
        };
        const execute = createToolPreflightExecutor(config, jobs, storage);
        expect((await pollLocalSpineTasks(jobs, storage, execute)).claimed).toBe(1);
        const record = await jobs.get(task, owner);
        const flow = record.toolFlow;
        if (!flow) throw new Error("TOOL_FLOW_MISSING");
        expect(flow).toMatch(/^flow-[a-f0-9]{32}$/);
        expect(record.state).toBe("PREPARED");
        expect((await pollLocalSpineTasks(jobs, storage, execute)).claimed).toBe(0);
        await store.run(async (tx) => {
          const stored = await tx.get(`jobs/spine-${task}`);
          if (!stored) throw new Error("TASK_MISSING");
          tx.set(`jobs/spine-${task}`, { ...stored, state: "UNKNOWN" });
        });
        const recovery = {
          python,
          script: join(project, "scripts/recover-spine-tool-task.py"),
          toolRoot,
        };
        expect((await recoverToolPreflight(recovery, jobs, storage, task))?.state).toBe("PREPARED");
        await store.run(async (tx) => {
          const stored = await tx.get(`jobs/spine-${task}`);
          if (!stored) throw new Error("TASK_MISSING");
          tx.set(`jobs/spine-${task}`, { ...stored, state: "UNKNOWN" });
        });
        const receiptPath = join(root, task, "tool-workspace/integration-receipt.json");
        const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
        receipt.photo_sha256 = "0".repeat(64);
        await writeFile(receiptPath, JSON.stringify(receipt));
        await expect(recoverToolPreflight(recovery, jobs, storage, task)).rejects.toThrow();
        expect((await jobs.get(task, owner)).state).toBe("UNKNOWN");
        expect(
          await inspectToolTask(
            { python, script: join(project, "scripts/inspect-spine-tool.py"), toolRoot },
            storage,
            task,
            flow,
          ),
        ).toEqual({ status: "NOT_READY" });
        await expect(
          prepareToolTask(
            { python, script: join(project, "scripts/prepare-spine-tool-task.py"), toolRoot },
            jobs,
            storage,
            task,
            "worker1",
            photo,
          ),
        ).rejects.toThrow("TOOL_PREPARATION_FAILED");
        receipt.photo_sha256 = createHash("sha256").update(photo).digest("hex");
        await writeFile(receiptPath, JSON.stringify(receipt));
        expect((await recoverToolPreflight(recovery, jobs, storage, task))?.state).toBe("PREPARED");
        await withdrawSpinePhoto(service, storage, token, task);
        expect(await cleanupLocalTask(jobs, storage, task)).toBe("COMPLETE");
        await expect(readFile(receiptPath)).rejects.toMatchObject({ code: "ENOENT" });
        expect(await storage.read(task, "photo.png", 1024 * 1024)).toBeNull();
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    120_000,
  );
});
