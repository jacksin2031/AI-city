import { realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, sep } from "node:path";
import { LocalSpineStorage } from "./local-storage";

/** Disabled by default: this adapter is for an isolated loopback emulator only. */
export async function getLocalSpineStorage(): Promise<LocalSpineStorage | null> {
  if (process.env.AI_CITY_SPINE_LOCAL_INTAKE !== "1") return null;
  if (
    process.env.AI_CITY_LOOPBACK_PREVIEW !== "1" ||
    process.env.AI_CITY_PUBLIC_ORIGIN ||
    !/^(localhost|127\.0\.0\.1):\d{1,5}$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? "") ||
    process.env.AI_CITY_VISITOR_PROJECT_ID !== "demo-ai-city"
  )
    throw new Error("SPINE_LOCAL_ONLY");
  const directory = process.env.AI_CITY_SPINE_LOCAL_DIR;
  if (!directory || !isAbsolute(directory)) throw new Error("PRIVATE_ROOT_INVALID");
  const root = await realpath(directory);
  const cwd = await realpath(process.cwd());
  const project =
    basename(cwd) === "web" && basename(dirname(cwd)) === "apps" ? dirname(dirname(cwd)) : cwd;
  const fromProject = relative(project, root);
  if (
    !fromProject ||
    (fromProject !== ".." && !fromProject.startsWith(`..${sep}`) && !isAbsolute(fromProject))
  )
    throw new Error("PRIVATE_ROOT_IN_PROJECT");
  return LocalSpineStorage.open(directory);
}
