import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const root = process.cwd();
const executable = process.platform === "win32" ? "java.exe" : "java";
const candidates = [
  process.env.AI_CITY_JAVA_HOME,
  join(root, ".tools", "java"),
  process.env.JAVA_HOME,
].filter(Boolean);
const javaHome = candidates.find((directory) => {
  const path = join(directory, "bin", executable);
  if (!existsSync(path)) return false;
  const check = spawnSync(path, ["-version"], { encoding: "utf8" });
  return Number((check.stderr || check.stdout || "").match(/version "(\d+)/)?.[1]) >= 21;
});
if (!javaHome) {
  const check = spawnSync("java", ["-version"], { encoding: "utf8" });
  if (
    Number((check.stderr || check.stdout || "").match(/version "(\d+)/)?.[1]) < 21 ||
    check.error
  ) {
    console.error(
      "Java 21+ is required. Use the Dev Container, or install a JDK in .tools/java. See docs/DEVELOPMENT.md.",
    );
    process.exit(1);
  }
}
const mode = process.argv[2];
if (!["start", "test"].includes(mode)) throw new Error("Expected start or test");
const cli = join(
  dirname(require.resolve("firebase-tools/package.json")),
  "lib",
  "bin",
  "firebase.js",
);
const args =
  mode === "test"
    ? [
        "emulators:exec",
        "--only",
        "firestore,storage",
        "--project",
        "demo-ai-city",
        "--config",
        "firebase.json",
        "pnpm exec vitest run --config vitest.rules.config.ts",
      ]
    : ["emulators:start", "--only", "auth,firestore,storage", "--project", "demo-ai-city"];
const env = {
  ...process.env,
  ...(javaHome
    ? {
        JAVA_HOME: javaHome,
        PATH: `${join(javaHome, "bin")}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`,
      }
    : {}),
};
const child = spawn(process.execPath, [cli, ...args], { cwd: root, env, stdio: "inherit" });
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
