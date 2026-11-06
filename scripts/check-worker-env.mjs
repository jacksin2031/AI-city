// Read-only check that this PC can run the AI City workers. It never logs in, installs anything,
// calls the network, or prints a credential: it only looks for files and tool versions.
//
//   node scripts/check-worker-env.mjs
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
let failed = false;
function report(name, ok, detail, fix) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${detail}`);
  if (!ok) {
    failed = true;
    if (fix) console.log(`      -> ${fix}`);
  }
}
// `shell` is only for gcloud, whose Windows launcher is a .cmd file; every argument is a constant.
function run(command, args, shell = false) {
  // A single command string, so Node's DEP0190 (args array + shell) never applies.
  const result = shell
    ? spawnSync([command, ...args].join(" "), { encoding: "utf8", windowsHide: true, shell: true })
    : spawnSync(command, args, { encoding: "utf8", windowsHide: true });
  return { ok: result.status === 0, out: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() };
}

// 1. Node: the repository pins a major version.
const [major, minor] = process.versions.node.split(".").map(Number);
report(
  "Node.js",
  major === 24 && minor >= 12,
  process.version,
  "Install Node.js 24.12 or newer (24.x) from nodejs.org",
);

// 2. Project dependencies: the workers load packages installed under apps/web.
const requireFromWeb = createRequire(join(root, "apps", "web", "package.json"));
for (const name of ["@google-cloud/firestore", "sharp"]) {
  let found = true;
  try {
    requireFromWeb.resolve(name);
  } catch {
    found = false;
  }
  report(`package ${name}`, found, found ? "installed" : "missing", "Run: pnpm install");
}
report(
  "tsx (runs the TypeScript workers)",
  existsSync(join(root, "node_modules", "tsx", "dist", "cli.mjs")),
  "node_modules/tsx",
  "Run: pnpm install",
);

// 3. Spine tool chain bundled with the repository (needed by the cloud Spine worker only).
const toolchain = join(
  root,
  "apps",
  "web",
  "app",
  "city",
  "spine-lab",
  "SpineSkinTool_v1.0",
  "runtime",
  "bin",
  "toolchain",
);
report(
  "Spine tool chain (uv + node)",
  existsSync(join(toolchain, "uv")) && existsSync(join(toolchain, "node")),
  toolchain,
  "Copy the whole project folder, including apps/web/app/city/spine-lab, to this PC",
);

// 4. Codex CLI, logged in. Only the login status line is read.
const codex =
  process.env.AI_CITY_CODEX_BIN ??
  (process.platform === "win32"
    ? join(homedir(), "AppData", "Local", "Programs", "OpenAI", "Codex", "bin", "codex.exe")
    : "codex");
const codexExists = process.platform !== "win32" || existsSync(codex);
report(
  "Codex CLI",
  codexExists,
  codexExists ? codex : `not found at ${codex}`,
  "Install the Codex app/CLI, or set AI_CITY_CODEX_BIN to the full path of codex",
);
if (codexExists) {
  const status = run(codex, ["login", "status"]);
  report(
    "Codex login",
    status.ok && /logged in/i.test(status.out),
    status.ok ? status.out.split("\n")[0] : "could not read login status",
    "Run: codex login",
  );
}

// 5. Google Cloud: the gcloud CLI and the application-default credentials file.
const gcloud = run("gcloud", ["--version"], process.platform === "win32");
report(
  "Google Cloud CLI",
  gcloud.ok,
  gcloud.ok ? gcloud.out.split("\n")[0] : "not found",
  "Install the Google Cloud CLI from cloud.google.com/sdk",
);
const adc =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ??
  (process.platform === "win32"
    ? join(process.env.APPDATA ?? "", "gcloud", "application_default_credentials.json")
    : join(homedir(), ".config", "gcloud", "application_default_credentials.json"));
report(
  "Google application-default login",
  existsSync(adc),
  existsSync(adc) ? "credentials file present (contents not read)" : "no credentials file",
  "Run: gcloud auth application-default login",
);

console.log(
  failed
    ? "\nNot ready. Fix the FAIL items above, then run this check again."
    : "\nReady. Start a worker with scripts\\run-cloud-spine-worker.bat or scripts\\run-dialogue-worker.bat.",
);
process.exitCode = failed ? 1 : 0;
