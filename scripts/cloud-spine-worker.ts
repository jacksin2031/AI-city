import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { isAbsolute, join, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { CloudAssetStorage } from "../apps/web/lib/spine/cloud-asset-storage";
import { CloudPhotoStorage } from "../apps/web/lib/spine/cloud-photo-storage";
import { pollCloudSpineTasks } from "../apps/web/lib/spine/cloud-worker";
import { buildTaskListing, PollReporter } from "../apps/web/lib/spine/cloud-worker-report";
import { HEARTBEAT_INTERVAL_MS, HEARTBEAT_PATH } from "../apps/web/lib/spine/heartbeat";
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
  const workersArg = args.find((arg) => arg.startsWith("--workers="));
  if (
    args.some(
      (arg) =>
        arg !== "--once" && arg !== "--live" && !arg.startsWith("--cap=") && arg !== workersArg,
    )
  )
    throw new Error("WORKER_ARGUMENTS");
  // Several tasks at once, in one process. Each task still has its own call cap; the model
  // provider's rate limits decide how many are useful, so the ceiling is deliberately low.
  const workers = workersArg ? Number(workersArg.slice(10)) : 1;
  if (!Number.isInteger(workers) || workers < 1 || workers > 4) throw new Error("WORKER_ARGUMENTS");
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

  // One process per scratch directory, as the worker design requires; a dead process's lock is taken over.
  await acquireLock(join(scratch, ".cloud-worker.lock"));
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
  const baseExecute = live
    ? createToolLiveExecutor({ python, script, toolRoot, liveScript, callCap }, jobs, storage)
    : createToolPreflightExecutor({ python, script, toolRoot }, jobs, storage);
  let running = 0;
  const execute: typeof baseExecute = async (...input) => {
    running += 1;
    try {
      return await baseExecute(...input);
    } finally {
      running -= 1;
    }
  };

  // Liveness for the admin monitor: independent of the poll so long tasks keep it fresh.
  // A failed write is only logged; it never reaches the polling loop.
  const beat = () =>
    db
      .doc(`visitorExhibitions/${namespace}/${HEARTBEAT_PATH}`)
      .set({ seenAt: Date.now(), running })
      .catch(() => process.stderr.write("heartbeat write failed\n"));
  void beat();
  const heartbeat = setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS);
  heartbeat.unref();

  // Job documents are named `spine-<task>`; only cloud-stored photos are of interest here.
  // Only the few fields that decide whether a job needs attention are fetched, so consent records,
  // owner and digest never leave Firestore for the listing. Queued jobs come first, oldest first,
  // and withdrawn jobs whose cleanup is finished are counted but not visited.
  const listTasks = async () => {
    const snapshot = await db
      .collection(`visitorExhibitions/${namespace}/jobs`)
      .where("photoStorage", "==", "CLOUD_PRIVATE")
      .select(
        "photoStorage",
        "state",
        "stateSince",
        "queuedAt",
        "cleanupPending",
        "toolCleanupPending",
      )
      .get();
    return buildTaskListing(
      snapshot.docs.map((doc: { id: string; data(): Record<string, unknown> }) => ({
        id: doc.id,
        data: doc.data(),
      })),
      Date.now(),
    );
  };

  const stop = new AbortController();
  process.once("SIGINT", () => stop.abort());
  process.once("SIGTERM", () => stop.abort());
  // Reason-coded counts only. Task IDs, owners, digests and photo data never reach this log.
  const reporter = new PollReporter();
  const inFlight = new Set<string>();
  const loop = async () => {
    do {
      try {
        const summary = await pollCloudSpineTasks(
          { jobs, storage, photos, assets, listTasks, execute },
          1,
          inFlight,
        );
        const line = reporter.line(summary);
        if (line) process.stdout.write(`${line}\n`);
      } catch (error) {
        // A failed listing (for example Firestore unavailable) must not end a long-running worker.
        if (args.includes("--once")) throw error;
        const message = error instanceof Error ? error.message : "";
        const code = /^[A-Z][A-Z0-9_]{2,40}$/.test(message) ? message : "UNCLASSIFIED";
        process.stdout.write(
          `${JSON.stringify({ at: new Date().toISOString(), pollError: code })}\n`,
        );
      }
      if (args.includes("--once") || stop.signal.aborted) break;
      try {
        await delay(5000, undefined, { signal: stop.signal });
      } catch {
        if (!stop.signal.aborted) throw new Error("WORKER_WAIT_FAILED");
      }
    } while (!stop.signal.aborted);
  };
  try {
    // One loop per requested worker. They share the in-flight set, so a person is never run twice.
    await Promise.all(Array.from({ length: workers }, () => loop()));
  } finally {
    clearInterval(heartbeat);
    await rm(join(scratch, ".cloud-worker.lock"), { force: true });
    await db.terminate();
  }
}

/** One owner per scratch directory; a lock left by a dead process is taken over. */
async function acquireLock(path: string) {
  try {
    await writeFile(path, String(process.pid), { flag: "wx" });
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const pid = Number((await readFile(path, "utf8").catch(() => "")).trim());
  let alive = false;
  if (Number.isInteger(pid) && pid > 0) {
    try {
      process.kill(pid, 0);
      alive = true;
    } catch {
      alive = false;
    }
  }
  if (alive) throw new Error("WORKER_ALREADY_RUNNING");
  await rm(path, { force: true });
  await writeFile(path, String(process.pid), { flag: "wx" });
}

main().catch((error) => {
  process.stderr.write(
    `Cloud Spine worker stopped: ${error instanceof Error ? error.message : "unknown"}\n`,
  );
  process.exitCode = 1;
});
