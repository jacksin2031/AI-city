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

/** Forward only the environment the tool needs, including the VM's required egress proxy.
 * Proxy URLs can contain credentials: never print them, emit them in diagnostics, or pass them to the browser.
 */
export function toolEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: source.NODE_ENV };
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
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "no_proxy",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
    // Explicit operator opt-in. Both markers are required; release gate rejects Production.
    "AI_CITY_SPINE_PREVIEW_AUTO_PUBLISH",
    "AI_CITY_VISITOR_NAMESPACE",
  ]) {
    if (source[name] !== undefined) env[name] = source[name];
  }
  return env;
}

/** Report only a static, privacy-safe preparation stage. */
export function classifyPrepareFailure(error: unknown): SpineFailureCode {
  const phase = error instanceof Error && "phase" in error ? error.phase : null;
  switch (phase) {
    case "IMPORTS":
      return "PREPARE_RUNTIME_FAILED";
    case "PHOTO_VERIFY":
    case "PHOTO_IMPORT":
      return "PREPARE_PHOTO_FAILED";
    case "REFERENCE_VERIFY":
    case "REFERENCE_COPY":
      return "PREPARE_REFERENCE_FAILED";
    case "WORKSPACE":
      return "PREPARE_WORKSPACE_FAILED";
    case "FLOW_CREATE":
      return "PREPARE_FLOW_FAILED";
    case "RECEIPT":
      return "PREPARE_RECEIPT_FAILED";
    default:
      return "TOOL_PREPARATION_FAILED";
  }
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

/** Only an approved, finished pipeline may be published. An unfinished or blocked one is NOT reviewable. */
export function liveDisposition(
  status: string,
  hasBundle: boolean,
  autoPublish: boolean,
): "APPROVED" | "REQUIRES_REVIEW" | "UNKNOWN" {
  if (status === "REQUIRES_REVIEW" && hasBundle) return "REQUIRES_REVIEW";
  if (status !== "READY_FOR_REVIEWED_EXPORT" || !hasBundle) return "UNKNOWN";
  return autoPublish ? "APPROVED" : "REQUIRES_REVIEW";
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
    } catch (error) {
      return { status: "UNKNOWN", failureCode: classifyPrepareFailure(error) };
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
    // The tool output is untrusted. WAIT_RESULT, OUTPUT_BLOCKED, CONFIGURATION_BLOCKED,
    // CANCELLED and all other unfinished states must not be mislabelled as reviewable bundles.
    const disposition = liveDisposition(
      result.status,
      Boolean(result.bundle),
      result.auto_publish === true,
    );
    if (disposition === "UNKNOWN" || !result.bundle)
      return { status: "UNKNOWN", failureCode: classifyToolFailure(result.error_code) };
    if (disposition === "REQUIRES_REVIEW") return { status: "REQUIRES_REVIEW" };
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
