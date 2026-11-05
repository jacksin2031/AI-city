import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Starts the cloud Spine worker with the repo's tsx. Cloud access uses the operator's own gcloud
// application-default login; AI_CITY_VISITOR_NAMESPACE, AI_CITY_SPINE_PHOTO_BUCKET and
// AI_CITY_SPINE_LOCAL_DIR (absolute, outside the project) must be set by the operator.
const project = fileURLToPath(new URL("..", import.meta.url));
const cli = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url));
const script = fileURLToPath(new URL("./cloud-spine-worker.ts", import.meta.url));
const child = spawn(process.execPath, [cli, script, ...process.argv.slice(2)], {
  cwd: project,
  stdio: "inherit",
  windowsHide: true,
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
child.on("error", () => {
  process.stderr.write("Unable to start the cloud Spine worker\n");
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
