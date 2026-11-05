import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";
import { z } from "zod";
import type { SpineJobs } from "./jobs";
import type { LocalSpineStorage } from "./local-storage";

const resultSchema = z.strictObject({
  status: z.literal("PREPARED"),
  flow: z.string().regex(/^flow-[a-f0-9]{32}$/),
  model_calls: z.literal(0),
});
export type ToolPrepareConfig = { python: string; script: string; toolRoot: string };

export async function runToolHelper(
  python: string,
  args: string[],
  input: string,
): Promise<string> {
  const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV };
  for (const name of [
    "PATH",
    "Path",
    "SYSTEMROOT",
    "SystemRoot",
    "WINDIR",
    "TEMP",
    "TMP",
    "HOME",
    "USERPROFILE",
  ]) {
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }
  return new Promise<string>((resolve, reject) => {
    const child = spawn(python, ["-B", ...args], {
      shell: false,
      windowsHide: true,
      env,
      stdio: ["pipe", "pipe", "ignore"],
    });
    let text = "";
    let failed = false;
    const timer = setTimeout(() => {
      failed = true;
      child.kill();
    }, 120_000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      text += chunk;
      if (text.length > 1024) {
        failed = true;
        child.kill();
      }
    });
    child.once("error", () => {
      failed = true;
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (failed || code !== 0) reject(new Error("TOOL_PREPARATION_FAILED"));
      else resolve(text);
    });
    child.stdin.on("error", () => {
      failed = true;
    });
    child.stdin.end(input);
  });
}

/** Prepares and binds a real isolated tool flow; never calls a model. */
export async function prepareToolTask(
  config: ToolPrepareConfig,
  jobs: SpineJobs,
  storage: LocalSpineStorage,
  task: string,
  worker: string,
  photo: Uint8Array,
): Promise<string> {
  if (![config.python, config.script, config.toolRoot].every(isAbsolute))
    throw new Error("TOOL_CONFIG_INVALID");
  const root = await storage.privateRootForWorker(task);
  const sha = createHash("sha256").update(photo).digest("hex");
  const result = await runToolHelper(
    config.python,
    [config.script, config.toolRoot, root, task],
    sha,
  );
  let parsed: z.infer<typeof resultSchema>;
  try {
    parsed = resultSchema.parse(JSON.parse(result));
  } catch {
    throw new Error("TOOL_PREPARATION_INVALID");
  }
  await jobs.bindToolFlow(task, worker, parsed.flow, sha);
  return parsed.flow;
}
