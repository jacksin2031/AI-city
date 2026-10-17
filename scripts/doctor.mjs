import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const expected = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const [major, minor] = process.versions.node.split(".").map(Number);
let failed = false;
function report(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
  if (!ok) failed = true;
}
report("Node", major === 24 && minor >= 12, `${process.version}; expected Node 24.12+`);
const pnpmVersion = process.env.npm_config_user_agent?.match(/pnpm\/(\S+)/)?.[1];
report(
  "pnpm",
  pnpmVersion === expected.packageManager.split("@")[1],
  pnpmVersion || "run via pnpm doctor",
);
const localJava = join(
  process.cwd(),
  ".tools",
  "java",
  "bin",
  process.platform === "win32" ? "java.exe" : "java",
);
const java = spawnSync(existsSync(localJava) ? localJava : "java", ["-version"], {
  encoding: "utf8",
});
const javaVersion = (java.stderr || java.stdout || "").match(/version "(\d+)/)?.[1];
report(
  "Java",
  Number(javaVersion) >= 21,
  `${javaVersion || "not found"}; required for emulators. See docs/DEVELOPMENT.md`,
);
report(
  "Cloud config",
  JSON.parse(readFileSync(new URL("../infra/cloud.json", import.meta.url), "utf8")).projectId ===
    "ai-city-511822",
  "explicit project; no global gcloud changes required",
);
console.log(
  "Mock development needs no cloud login or API key. Cloud provisioning is a separate owner operation.",
);
process.exitCode = failed ? 1 : 0;
