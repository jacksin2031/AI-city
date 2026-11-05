import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pollLocalSpineTasks } from "../apps/web/lib/spine/local-poller";
import { getLocalSpineStorage } from "../apps/web/lib/spine/local-runtime";
import { createToolPreflightExecutor } from "../apps/web/lib/spine/tool-preflight";
import { getSpineJobs } from "../apps/web/lib/visitor/runtime";

/** Explicitly started local worker. It prepares real tool tasks but never invokes a model. */
async function main() {
  if (process.argv.slice(2).some((arg) => arg !== "--once")) throw new Error("WORKER_ARGUMENTS");
  const jobs = getSpineJobs();
  const storage = await getLocalSpineStorage();
  if (!jobs || !storage) throw new Error("WORKER_NOT_CONFIGURED");
  const project = resolve(process.cwd());
  const toolRoot = join(project, "apps/web/app/city/spine-lab/SpineSkinTool_v1.0");
  const python =
    process.platform === "win32"
      ? join(toolRoot, "runtime/python/.venv/Scripts/python.exe")
      : join(toolRoot, "runtime/python/.venv/bin/python");
  const script = join(project, "scripts/prepare-spine-tool-task.py");
  if (!existsSync(python) || !existsSync(script)) throw new Error("TOOL_NOT_INSTALLED");
  const execute = createToolPreflightExecutor({ python, script, toolRoot }, jobs, storage);
  const stop = new AbortController();
  process.once("SIGINT", () => stop.abort());
  process.once("SIGTERM", () => stop.abort());
  do {
    const summary = await pollLocalSpineTasks(jobs, storage, execute, 1);
    if (summary.claimed || summary.cleaned) process.stdout.write(`${JSON.stringify(summary)}\n`);
    if (process.argv.includes("--once") || stop.signal.aborted) break;
    try {
      await delay(5000, undefined, { signal: stop.signal });
    } catch {
      if (!stop.signal.aborted) throw new Error("WORKER_WAIT_FAILED");
    }
  } while (!stop.signal.aborted);
}

main().catch(() => {
  process.stderr.write(
    "Spine preflight worker could not continue; check local configuration and task status.\n",
  );
  process.exitCode = 1;
});
