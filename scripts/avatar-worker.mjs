// Local avatar worker. Cloud Run only enqueues jobs; this process (run on a trusted local machine
// with the developer's gcloud ADC) pulls QUEUED jobs from Firestore and generates the sprite with
// the local Codex CLI. Photos are sent to OpenAI through Codex — the consent text says so.
//
//   gcloud auth application-default login   (once)
//   AI_CITY_BACKEND=gcp node scripts/avatar-worker.mjs [--once]
import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { Firestore } = require("@google-cloud/firestore");
const { Storage } = require("@google-cloud/storage");
const sharp = require("sharp");

const project = process.env.GOOGLE_CLOUD_PROJECT ?? "ai-city-511822";
const privateBucket = process.env.AI_CITY_PRIVATE_BUCKET ?? `${project}-private`;
const assetBucket = process.env.AI_CITY_ASSET_BUCKET ?? `${project}-assets`;
const once = process.argv.includes("--once");
const MAX_ATTEMPTS = 2;
const CODEX_TIMEOUT_MS = 6 * 60_000;

const firestore = new Firestore({ projectId: project });
const storage = new Storage({ projectId: project });
const generatedRoot = join(homedir(), ".codex", "generated_images");

const colorNames = { green: "green", violet: "violet / purple", amber: "amber / yellow" };
const markNames = {
  none: "no emblem",
  star: "a small star emblem on the chest",
  heart: "a small heart emblem on the chest",
};

function buildPrompt(job, resident) {
  const base =
    "Generate ONE image: a single full-body chibi pixel-art game character, front view, standing, " +
    "centered, on a fully transparent background, with no text, no frame and no shadow plate. " +
    "Friendly, cheerful, safe-for-all-ages style, about 2.5 heads tall.";
  if (job.hasPhoto) {
    return (
      `${base} Use the attached photo ONLY as a reference for clothing colours, hairstyle and general ` +
      "visual impression. Do not identify the person, do not estimate age, gender or ethnicity, and do not " +
      "make a realistic portrait. Do not use any other tools; just generate the image."
    );
  }
  return (
    `${base} Main clothing colour: ${colorNames[resident.color] ?? "green"}; ${markNames[resident.mark] ?? markNames.none}. ` +
    "Do not use any other tools; just generate the image."
  );
}

async function newestPngSince(startMs, threadId) {
  // Prefer this run's own session directory so a concurrent Codex session cannot be picked up.
  const root = threadId ? join(generatedRoot, threadId) : generatedRoot;
  let best = null;
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith(".png")) {
        const { mtimeMs } = await stat(path);
        if (mtimeMs >= startMs && (!best || mtimeMs > best.mtimeMs)) best = { path, mtimeMs };
      }
    }
  };
  await walk(root);
  return best?.path ?? null;
}

function runCodex(cwd, prompt, imagePath) {
  return new Promise((resolve, reject) => {
    const args = ["exec", "--json", "--skip-git-repo-check", "-s", "workspace-write"];
    if (imagePath) args.push("-i", imagePath);
    args.push("-");
    const child = spawn("codex", args, { cwd, shell: true, stdio: ["pipe", "pipe", "ignore"] });
    let threadId = null;
    let buffered = "";
    child.stdout.on("data", (chunk) => {
      buffered += chunk;
      let newline = buffered.indexOf("\n");
      while (newline >= 0) {
        const line = buffered.slice(0, newline);
        buffered = buffered.slice(newline + 1);
        newline = buffered.indexOf("\n");
        try {
          const event = JSON.parse(line);
          if (event.type === "thread.started" && event.thread_id) threadId = event.thread_id;
        } catch {
          // not a JSON line
        }
      }
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("codex timeout"));
    }, CODEX_TIMEOUT_MS);
    child.on("error", reject);
    child.on("close", () => {
      clearTimeout(timer);
      resolve(threadId);
    });
    child.stdin.end(prompt);
  });
}

async function claim() {
  const snap = await firestore.collection("jobs").where("state", "==", "QUEUED").limit(1).get();
  const doc = snap.docs[0];
  if (!doc) return null;
  return firestore.runTransaction(async (tx) => {
    const fresh = await tx.get(doc.ref);
    const data = fresh.data();
    if (!data || data.state !== "QUEUED") return null;
    tx.update(doc.ref, {
      state: "RUNNING",
      attempt: (data.attempt ?? 0) + 1,
      startedAt: Date.now(),
    });
    return { ref: doc.ref, ...data, attempt: (data.attempt ?? 0) + 1 };
  });
}

async function process_(job) {
  const rid = job.residentId;
  const residentRef = firestore.collection("residents").doc(rid);
  const resident = (await residentRef.get()).data();
  if (!resident) throw new Error("resident missing");
  await residentRef.set({ avatarState: "RUNNING" }, { merge: true });
  const work = await mkdtemp(join(tmpdir(), "ai-city-"));
  try {
    let imagePath;
    if (job.hasPhoto) {
      const [bytes] = await storage.bucket(privateBucket).file(`photos/${job.sid}.jpg`).download();
      imagePath = join(work, "reference.jpg");
      await writeFile(imagePath, bytes);
    }
    const startedAt = Date.now() - 1000;
    const threadId = await runCodex(work, buildPrompt(job, resident), imagePath);
    const generated = await newestPngSince(startedAt, threadId);
    if (!generated) throw new Error("codex produced no image");
    const sprite = await sharp(generated)
      .trim()
      .resize({ height: 512, withoutEnlargement: true })
      .png()
      .toBuffer();
    // The participant may have withdrawn while the image was being generated.
    if ((await job.ref.get()).data()?.state === "CANCELLED")
      return console.log(`[worker] cancelled ${rid}`);
    await storage
      .bucket(assetBucket)
      .file(`avatars/${rid}.png`)
      .save(sprite, { contentType: "image/png", resumable: false });
    await residentRef.set(
      { avatarState: "READY", avatarSource: "generated", visible: true },
      { merge: true },
    );
    await job.ref.set({ state: "READY", finishedAt: Date.now() }, { merge: true });
    console.log(`[worker] READY ${rid}`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function finish(job, failed) {
  // The reference photo is deleted as soon as the job can no longer need it.
  if (job.hasPhoto && failed)
    await storage
      .bucket(privateBucket)
      .file(`photos/${job.sid}.jpg`)
      .delete({ ignoreNotFound: true });
}

async function cleanupPhoto(job) {
  if (job.hasPhoto)
    await storage
      .bucket(privateBucket)
      .file(`photos/${job.sid}.jpg`)
      .delete({ ignoreNotFound: true });
}

async function tick() {
  const job = await claim();
  if (!job) return false;
  console.log(`[worker] RUNNING ${job.residentId} attempt ${job.attempt}`);
  try {
    await process_(job);
    await cleanupPhoto(job);
  } catch (error) {
    // Log only the error class: messages may contain paths or data from the job.
    console.error(`[worker] failed ${job.residentId}: ${error?.name ?? "Error"}`);
    if (job.attempt >= MAX_ATTEMPTS) {
      await job.ref.set({ state: "FAILED" }, { merge: true });
      await firestore
        .collection("residents")
        .doc(job.residentId)
        .set({ avatarState: "FAILED" }, { merge: true });
      await finish(job, true);
    } else {
      await job.ref.set({ state: "QUEUED" }, { merge: true });
    }
  }
  return true;
}

console.log(`[worker] project=${project} private=${privateBucket} assets=${assetBucket}`);
do {
  const worked = await tick().catch((error) => {
    console.error(`[worker] loop error: ${error?.name ?? "Error"}`);
    return false;
  });
  if (once) break;
  if (!worked) await new Promise((resolve) => setTimeout(resolve, 5000));
} while (true);
