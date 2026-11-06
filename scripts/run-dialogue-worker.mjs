import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Runs the TypeScript worker through the repo's tsx. Cloud access uses the developer's own
// gcloud application-default credentials; no key file is read or written.
const project = fileURLToPath(new URL("..", import.meta.url));
const cli = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url));
const script = fileURLToPath(new URL("./dialogue-worker.ts", import.meta.url));
const child = spawn(process.execPath, [cli, script, ...process.argv.slice(2)], {
  cwd: project,
  stdio: "inherit",
  windowsHide: true,
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
child.on("error", () => {
  process.stderr.write("Unable to start the dialogue worker\n");
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
