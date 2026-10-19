import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.env.AI_CITY_PUBLIC_ORIGIN)
  throw new Error("Use start:remote for the configured HTTPS service");
const cwd = fileURLToPath(new URL("../apps/web", import.meta.url));
const next = fileURLToPath(new URL("../apps/web/node_modules/next/dist/bin/next", import.meta.url));
const child = spawn(
  process.execPath,
  [next, process.argv[2] === "dev" ? "dev" : "start", "--hostname", "127.0.0.1"],
  { cwd, stdio: "inherit", env: { ...process.env, AI_CITY_LOOPBACK_PREVIEW: "1" } },
);
child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", () => {
  process.stderr.write("Unable to start the local preview\n");
  process.exit(1);
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
