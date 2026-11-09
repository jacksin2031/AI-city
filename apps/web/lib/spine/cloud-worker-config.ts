import { realpath } from "node:fs/promises";
import { isAbsolute, parse, relative, sep } from "node:path";
import { LocalSpineStorage } from "./local-storage";

export function cloudWorkerConfig(env: Record<string, string | undefined>) {
  if (env.AI_CITY_SPINE_CLOUD_PREFLIGHT !== "1") return null;
  const projectId = env.AI_CITY_VISITOR_PROJECT_ID;
  const namespace = env.AI_CITY_VISITOR_NAMESPACE;
  const bucket = env.AI_CITY_SPINE_PHOTO_BUCKET;
  const directory = env.AI_CITY_SPINE_CLOUD_WORK_DIR;
  const python = env.AI_CITY_SPINE_TOOL_PYTHON;
  if (
    projectId !== "ai-city-511822" ||
    !namespace ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(namespace) ||
    !bucket ||
    !/^[a-z0-9][a-z0-9.-]{1,220}[a-z0-9]$/.test(bucket) ||
    ["ai-city-511822-private", "ai-city-511822-assets", "ai-city-511822-preview-builds"].includes(
      bucket,
    ) ||
    !directory ||
    !isAbsolute(directory) ||
    !python ||
    !isAbsolute(python) ||
    env.FIRESTORE_EMULATOR_HOST ||
    env.STORAGE_EMULATOR_HOST
  )
    throw new Error("CLOUD_WORKER_CONFIG_INVALID");
  return { projectId, namespace, bucket, directory, python };
}

function contains(parent: string, child: string) {
  const path = relative(parent, child);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

/** The operator must separately ensure private OS permissions on this dedicated directory. */
export async function openCloudWorkerStorage(directory: string, projectDirectory: string) {
  const storage = await LocalSpineStorage.open(directory);
  const root = await realpath(directory);
  const project = await realpath(projectDirectory);
  if (root === parse(root).root || contains(root, project) || contains(project, root))
    throw new Error("PRIVATE_ROOT_INVALID");
  return storage;
}
