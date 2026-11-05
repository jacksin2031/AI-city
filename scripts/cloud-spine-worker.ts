import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, join, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { CloudAssetStorage } from "../apps/web/lib/spine/cloud-asset-storage";
import { CloudPhotoStorage } from "../apps/web/lib/spine/cloud-photo-storage";
import { pollCloudSpineTasks } from "../apps/web/lib/spine/cloud-worker";
import { SpineJobs } from "../apps/web/lib/spine/jobs";
import { LocalSpineStorage } from "../apps/web/lib/spine/local-storage";
import { createToolLiveExecutor } from "../apps/web/lib/spine/tool-live";
import { createToolPreflightExecutor } from "../apps/web/lib/spine/tool-preflight";
import { FirestoreVisitorStore } from "../apps/web/lib/visitor/firestore";

/**
 * Cloud photo worker, started by hand on a trusted machine. It pulls queued photos from the
 * private bucket, runs the Spine tool locally and uploads the finished bundle.
 *
 * Default is preparation only (no model call). `--live --cap=N` CALLS EXTERNAL MODELS with real
 * participant photos and needs AI_CITY_SPINE_LIVE_CONFIRM=I_AUTHORIZE_REAL_MODEL_CALLS.
 * Credentials are the operator's own gcloud application-default login; no key is read or stored.
 */
const PROJECT = "ai-city-511822";
// Dependencies live in apps/web, not in the repository root.
const requireWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { Firestore } = requireWeb("@google-cloud/firestore");
const { GoogleAuth } = requireWeb("google-auth-library");

async function main() {
  const args = process.argv.slice(2);
  const live = args.includes("--live");
  const capArg = args.find((arg) => arg.startsWith("--cap="));
  if (args.some((arg) => arg !== "--once" && arg !== "--live" && !arg.startsWith("--cap=")))
    throw new Error("WORKER_ARGUMENTS");
  if (live && process.env.AI_CITY_SPINE_LIVE_CONFIRM !== "I_AUTHORIZE_REAL_MODEL_CALLS")
    throw new Error("LIVE_NOT_CONFIRMED");
  if (capArg && !live) throw new Error("WORKER_ARGUMENTS");
  const callCap = capArg ? Number(capArg.slice(6)) : 12;
  const namespace = process.env.AI_CITY_VISITOR_NAMESPACE;
  const bucket = process.env.AI_CITY_SPINE_PHOTO_BUCKET;
  const scratch = process.env.AI_CITY_SPINE_LOCAL_DIR;
  if (!namespace || !bucket || !scratch || !isAbsolute(scratch)) throw new Error("WORKER_CONFIG");
  const project = resolve(process.cwd());
  const fromProject = relative(project, scratch);
  if (!fromProject.startsWith("..") && !isAbsolute(fromProject))
    throw new Error("PRIVATE_ROOT_IN_PROJECT");

  const db = new Firestore({ projectId: PROJECT });
  const store = new FirestoreVisitorStore(db, namespace);
  const jobs = new SpineJobs(store);
  const storage = await LocalSpineStorage.open(scratch);
  const auth = new GoogleAuth({
    projectId: PROJECT,
    scopes: ["https://www.googleapis.com/auth/devstorage.read_write"],
  });
  const token = async () => (await auth.getAccessToken()) ?? null;
  const photos = new CloudPhotoStorage(bucket, token);
  const assets = new CloudAssetStorage(bucket, token);

  const toolRoot = join(project, "apps/web/app/city/spine-lab/SpineSkinTool_v1.0");
  const python =
    process.platform === "win32"
      ? join(toolRoot, "runtime/python/.venv/Scripts/python.exe")
      : join(toolRoot, "runtime/python/.venv/bin/python");
  const script = join(project, "scripts/prepare-spine-tool-task.py");
  const liveScript = join(project, "scripts/run-spine-live-task.py");
  if (!existsSync(python) || !existsSync(script)) throw new Error("TOOL_NOT_INSTALLED");
  const execute = live
    ? createToolLiveExecutor({ python, script, toolRoot, liveScript, callCap }, jobs, storage)
    : createToolPreflightExecutor({ python, script, toolRoot }, jobs, storage);

  // Job documents are named `spine-<task>`; only cloud-stored photos are of interest here.
  const listTasks = async () => {
    const snapshot = await db
      .collection(`visitorExhibitions/${namespace}/jobs`)
      .where("photoStorage", "==", "CLOUD_PRIVATE")
      .get();
    return snapshot.docs
      .map((doc) => doc.id.replace(/^spine-/, ""))
      .filter((task) => /^spine-[0-9a-f-]{36}$/.test(task));
  };

  const stop = new AbortController();
  process.once("SIGINT", () => stop.abort());
  process.once("SIGTERM", () => stop.abort());
  do {
    const summary = await pollCloudSpineTasks(
      { jobs, storage, photos, assets, listTasks, execute },
      1,
    );
    if (summary.claimed || summary.cleaned) process.stdout.write(`${JSON.stringify(summary)}\n`);
    if (args.includes("--once") || stop.signal.aborted) break;
    try {
      await delay(5000, undefined, { signal: stop.signal });
    } catch {
      if (!stop.signal.aborted) throw new Error("WORKER_WAIT_FAILED");
    }
  } while (!stop.signal.aborted);
  await db.terminate();
}

main().catch((error) => {
  process.stderr.write(
    `Cloud Spine worker stopped: ${error instanceof Error ? error.message : "unknown"}\n`,
  );
  process.exitCode = 1;
});
