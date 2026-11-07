import { spawnSync } from "node:child_process";

/** Fail closed before a Worker advertises a heartbeat or accepts photos. Never invokes AI. */
export function classifyReferencePreflight(status: number | null, stdout: string): string {
  let body: unknown;
  try {
    body = JSON.parse(stdout.trim());
  } catch {
    return "REFERENCE_PREFLIGHT_INVALID";
  }
  if (!body || typeof body !== "object" || !("status" in body) || !("code" in body))
    return "REFERENCE_PREFLIGHT_INVALID";
  if (status === 0 && body.status === "READY" && body.code === "NONE") return "NONE";
  const allowed = new Set([
    "REFERENCE_MANIFEST_MISSING",
    "REFERENCE_MANIFEST_INVALID",
    "REFERENCE_LICENSE_MISSING",
    "REFERENCE_MANIFEST_PATH",
    "REFERENCE_FILE_MISSING",
    "REFERENCE_LINK",
    "REFERENCE_ASSET_CHANGED",
    "REFERENCE_RUNTIME_ERROR",
    "TOOL_ROOT_MISSING",
  ]);
  return typeof body.code === "string" && allowed.has(body.code)
    ? body.code
    : "REFERENCE_PREFLIGHT_INVALID";
}

export function checkWorkerSpineReferences(python: string, script: string) {
  // Deliberately exclude API keys/tokens and user-specific settings from the check process.
  const env: NodeJS.ProcessEnv = {};
  for (const key of [
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
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  const result = spawnSync(python, ["-B", script], {
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "ignore"],
    env,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 4096,
  });
  const code = result.error
    ? "REFERENCE_PREFLIGHT_INVALID"
    : classifyReferencePreflight(result.status, result.stdout);
  if (code !== "NONE") {
    // Log only a bounded static code, never stderr, filenames or private information.
    process.stdout.write(
      JSON.stringify({ preflight: "SPINE_REFERENCES_BLOCKED", reason: code }) + "\n",
    );
    throw new Error("SPINE_REFERENCES_NOT_READY");
  }
}
