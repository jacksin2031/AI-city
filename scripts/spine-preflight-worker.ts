import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pollLocalSpineTasks } from "../apps/web/lib/spine/local-poller";
import { getLocalSpineStorage } from "../apps/web/lib/spine/local-runtime";
import { createToolLiveExecutor } from "../apps/web/lib/spine/tool-live";
import { createToolPreflightExecutor } from "../apps/web/lib/spine/tool-preflight";
import { getSpineJobs } from "../apps/web/lib/visitor/runtime";

/**
 * Explicitly started local worker. By default it only prepares tool tasks and never invokes a model.
 * `--live --cap=N` additionally runs the tool and auto-publishes; it CALLS EXTERNAL MODELS and needs
 * AI_CITY_SPINE_LIVE_CONFIRM=I_AUTHORIZE_REAL_MODEL_CALLS in the environment.
 */
async function main() {
  const args = process.argv.slice(2);
  const live = args.includes("--live");
  const capArg = args.find((arg) => arg.startsWith("--cap="));
  if (args.some((arg) => arg !== "--once" && arg !== "--live" && !arg.startsWith("--cap=")))
    throw new Error("WORKER_ARGUMENTS");
  if (live && process.env.AI_CITY_SPINE_LIVE_CONFIRM !== "I_AUTHORIZE_REAL_MODEL_CALLS")
    throw new Error("LIVE_NOT_CONFIRMED");
  if (capArg && !live) throw new Error("WORKER_ARGUMENTS");
  const callCap = capArg ? Number(capArg.slice(6)) : 12;
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
  const liveScript = join(project, "scripts/run-spine-live-task.py");
  const execute = live
    ? createToolLiveExecutor({ python, script, toolRoot, liveScript, callCap }, jobs, storage)
    : createToolPreflightExecutor({ python, script, toolRoot }, jobs, storage);
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
