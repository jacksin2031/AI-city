import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
export function validateRemoteEnvironment(env) {
  let origin;
  try {
    origin = new URL(env.AI_CITY_PUBLIC_ORIGIN);
  } catch {
    throw new Error("AI_CITY_PUBLIC_ORIGIN must be an exact HTTPS origin");
  }
  if (
    origin.protocol !== "https:" ||
    origin.origin !== env.AI_CITY_PUBLIC_ORIGIN ||
    origin.username ||
    origin.password ||
    ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
  )
    throw new Error(
      "AI_CITY_PUBLIC_ORIGIN must be an exact non-loopback HTTPS origin without a path",
    );
  if (
    !env.AI_CITY_ADMIN_KEY ||
    env.AI_CITY_ADMIN_KEY.length < 32 ||
    env.AI_CITY_ADMIN_KEY.length > 256
  )
    throw new Error(
      "Set AI_CITY_ADMIN_KEY to a unique 32–256 character secret; never put it in URLs or NEXT_PUBLIC variables",
    );
  if (env.AI_CITY_ENABLE_LOCAL_MOCK !== "1")
    throw new Error(
      "Explicit AI_CITY_ENABLE_LOCAL_MOCK=1 is required for this fictional-data preview",
    );
  const port = Number(env.PORT ?? "8080");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be 1–65535");
  return { origin: origin.origin, port };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const config = validateRemoteEnvironment(process.env);
    const cwd = fileURLToPath(new URL("../apps/web", import.meta.url));
    const next = fileURLToPath(
      new URL("../apps/web/node_modules/next/dist/bin/next", import.meta.url),
    );
    const child = spawn(
      process.execPath,
      [next, "start", "--hostname", "0.0.0.0", "--port", String(config.port)],
      { cwd, stdio: "inherit", env: { ...process.env, AI_CITY_LOOPBACK_PREVIEW: "0" } },
    );
    child.on("exit", (code) => process.exit(code ?? 1));
    child.on("error", () => {
      process.stderr.write("Unable to start the preview service\n");
      process.exit(1);
    });
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  } catch (failure) {
    process.stderr.write(`${failure.message}\n`);
    process.exit(1);
  }
}
