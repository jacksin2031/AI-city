import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Firestore } from "@google-cloud/firestore";
import { createCloudPhotoStorage } from "../lib/spine/cloud-photo-auth";
import { pollCloudPreflightTasks } from "../lib/spine/cloud-preflight-poller";
import { cloudWorkerConfig, openCloudWorkerStorage } from "../lib/spine/cloud-worker-config";
import { SpineJobs } from "../lib/spine/jobs";
import { createToolPreflightExecutor } from "../lib/spine/tool-preflight";
import { FirestoreVisitorStore } from "../lib/visitor/firestore";

/** Explicit operator command. Preflight only: it never invokes a model or publishes. */
async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--once")) throw new Error("WORKER_ARGUMENTS");
  const config = cloudWorkerConfig(process.env);
  if (!config) throw new Error("WORKER_DISABLED");
  const project = resolve(process.cwd());
  const script = resolve(project, "scripts/prepare-spine-tool-task.py");
  const toolRoot = resolve(project, "apps/web/app/city/spine-lab/SpineSkinTool_v1.0");
  if (!existsSync(config.python) || !existsSync(script)) throw new Error("TOOL_NOT_INSTALLED");
  const local = await openCloudWorkerStorage(config.directory, project);
  const cloud = createCloudPhotoStorage(config.projectId, config.bucket);
  const db = new Firestore({ projectId: config.projectId, preferRest: true });
  const jobs = new SpineJobs(new FirestoreVisitorStore(db, config.namespace));
  const preflight = createToolPreflightExecutor(
    { python: config.python, script, toolRoot },
    jobs,
    local,
  );
  const stop = new AbortController();
  process.once("SIGINT", () => stop.abort());
  process.once("SIGTERM", () => stop.abort());
  try {
    do {
      const summary = await pollCloudPreflightTasks(jobs, cloud, local, preflight, 1);
      if (summary.claimed) process.stdout.write(`${JSON.stringify(summary)}\n`);
      if (args.includes("--once") || stop.signal.aborted) break;
      try {
        await delay(5000, undefined, { signal: stop.signal });
      } catch {
        if (!stop.signal.aborted) throw new Error("WORKER_WAIT_FAILED");
      }
    } while (!stop.signal.aborted);
  } finally {
    await db.terminate();
  }
}

main().catch(() => {
  process.stderr.write("Cloud preflight worker stopped; inspect configuration and task state.\n");
  process.exitCode = 1;
});
