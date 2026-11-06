import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { isAbsolute, join } from "node:path";
import type { SpineFailureCode } from "@ai-city/contracts/spine";
import { z } from "zod";
import type { SpineJobs } from "./jobs";
import type { LocalSpineStorage } from "./local-storage";
import { loadToolBundleCandidate } from "./tool-bundle";
import { prepareToolTask, type ToolPrepareConfig } from "./tool-prepare";
import type { ToolOutcome } from "./worker";

export type ToolLiveConfig = ToolPrepareConfig & { liveScript: string; callCap: number };

const resultSchema = z.object({
  status: z.string(),
  phase: z.string().optional(),
  bundle: z.string().nullable().optional(),
  hard_fail_codes: z.array(z.string()).optional(),
  error_code: z.string().nullable().optional(),
  auto_publish: z.boolean().optional(),
});

/** Environment the tool needs, without handing it unrelated secrets. */
function toolEnvironment(): NodeJS.ProcessEnv {
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
    "APPDATA",
    "LOCALAPPDATA",
    "AI_CITY_SPINE_BROWSER",
  ]) {
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }
  return env;
}

/** Collapse private Python diagnostics to a strictly enumerated operator-facing reason. */
export function classifyToolFailure(code: unknown): SpineFailureCode {
  if (code === "CODEX_CHATGPT_LOGIN_REQUIRED" || code === "CODEX_CLI_NOT_FOUND")
    return "MODEL_LOGIN_REQUIRED";
  if (code === "CODEX_SUBSCRIPTION_LIMIT_REACHED") return "MODEL_QUOTA_REACHED";
  if (code === "CODEX_EXEC_FAILED_NO_RETRY" || code === "CODEX_TIMEOUT_RESULT_UNKNOWN_NO_RETRY")
    return "MODEL_EXECUTION_FAILED";
  if (code === "TOOL_LIVE_INVALID") return "TOOL_LIVE_INVALID";
  if (code === "TOOL_LIVE_EXIT") return "TOOL_LIVE_EXIT";
  if (code === "TOOL_RUNTIME_FAILED") return "TOOL_RUNTIME_FAILED";
  return "TOOL_PIPELINE_FAILED";
}

/** Accept a structured Python failure even when the subprocess returned exit code 1. */
export function interpretToolOutput(output: string, code: number | null): unknown {
  let payload: unknown;
  try {
    payload = JSON.parse(output.trim().split("\n").at(-1) ?? "");
  } catch {
    throw new Error("TOOL_LIVE_INVALID");
  }
  if (code !== 0 && resultSchema.safeParse(payload).data?.status !== "FAILED")
    throw new Error("TOOL_LIVE_EXIT");
  return payload;
}

function runLive(
  config: ToolLiveConfig,
  root: string,
  task: string,
  sha: string,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      config.python,
      ["-B", config.liveScript, config.toolRoot, root, task, String(config.callCap)],
      {
        shell: false,
        windowsHide: true,
        env: toolEnvironment(),
        stdio: ["pipe", "pipe", "ignore"],
      },
    );
    let text = "";
    let failed = false;
    const timer = setTimeout(
      () => {
        failed = true;
        child.kill();
      },
      3 * 60 * 60 * 1000,
    );
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      text += chunk;
      if (text.length > 16 * 1024) {
        failed = true;
        child.kill();
      }
    });
    child.once("error", () => {
      failed = true;
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (failed) return reject(new Error("TOOL_LIVE_EXIT"));
      try {
        // Never echo stderr or private stdout to logs or HTTP responses.
        resolve(interpretToolOutput(text, code));
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.on("error", () => {
      failed = true;
    });
    child.stdin.end(sha);
  });
}

/**
 * Explicit live executor for a separately started worker. It CALLS EXTERNAL MODELS. A published
 * result needs a rendered, hard-check-clean candidate with no failing visual review; the tool's
 * human review is intentionally replaced by this automatic gate (operator decision, see docs).
 * Any failure after models may have been called is UNKNOWN and is never re-sent.
 */
export function createToolLiveExecutor(
  config: ToolLiveConfig,
  jobs: SpineJobs,
  storage: LocalSpineStorage,
) {
  if (
    ![config.python, config.script, config.toolRoot, config.liveScript].every(isAbsolute) ||
    !Number.isSafeInteger(config.callCap) ||
    config.callCap < 4 ||
    config.callCap > 20
  )
    throw new Error("TOOL_CONFIG_INVALID");
  return async (task: string, photo: Uint8Array, worker: string): Promise<ToolOutcome> => {
    try {
      await prepareToolTask(config, jobs, storage, task, worker, photo);
    } catch {
      return { status: "UNKNOWN", failureCode: "TOOL_PREPARATION_FAILED" };
    }
    const root = await storage.privateRootForWorker(task);
    const sha = createHash("sha256").update(photo).digest("hex");
    let result: z.infer<typeof resultSchema>;
    try {
      result = resultSchema.parse(await runLive(config, root, task, sha));
    } catch (error) {
      return {
        status: "UNKNOWN",
        failureCode: classifyToolFailure(error instanceof Error ? error.message : null),
      };
    }
    if (result.status === "FAILED" || result.status === "ERROR_OR_RESULT_UNKNOWN")
      return { status: "UNKNOWN", failureCode: classifyToolFailure(result.error_code) };
    // The tool output is untrusted and may contain private data; never log it.
    if (!result.bundle || !result.auto_publish) {
      process.stderr.write("Spine task held for review.\n");
      return { status: "REQUIRES_REVIEW" };
    }
    try {
      return {
        status: "APPROVED",
        candidate: await loadToolBundleCandidate(task, join(root, task, result.bundle), true),
      };
    } catch {
      return { status: "UNKNOWN", failureCode: "BUNDLE_INVALID" };
    }
  };
}
