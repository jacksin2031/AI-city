import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("..", import.meta.url));
const web = fileURLToPath(new URL("../apps/web", import.meta.url));
const requireWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
const requireNext = createRequire(requireWeb.resolve("next/package.json"));
const { loadEnvConfig } = requireNext("@next/env");
loadEnvConfig(web);
if (process.env.AI_CITY_PUBLIC_ORIGIN)
  throw new Error("Local Spine worker cannot use a public origin");
const cli = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url));
const script = fileURLToPath(new URL("./spine-preflight-worker.ts", import.meta.url));
const child = spawn(process.execPath, [cli, script, ...process.argv.slice(2)], {
  cwd: project,
  stdio: "inherit",
  windowsHide: true,
  env: { ...process.env, AI_CITY_LOOPBACK_PREVIEW: "1" },
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
child.on("error", () => {
  process.stderr.write("Unable to start the local Spine worker\n");
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
