// Read-only probe: verify the worker's Firestore/GCS access without mutating anything.
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { Firestore } = require("@google-cloud/firestore");
const { Storage } = require("@google-cloud/storage");

const project = process.env.GOOGLE_CLOUD_PROJECT ?? "ai-city-511822";
const privateBucket = process.env.AI_CITY_PRIVATE_BUCKET ?? `${project}-private`;
const assetBucket = process.env.AI_CITY_ASSET_BUCKET ?? `${project}-assets`;

const firestore = new Firestore({ projectId: project });
const storage = new Storage({ projectId: project });

const jobs = await firestore.collection("jobs").limit(20).get();
console.log(`jobs: ${jobs.size}`);
for (const doc of jobs.docs) {
  const d = doc.data();
  console.log(`  - ${doc.id} state=${d.state} attempt=${d.attempt ?? 0} hasPhoto=${d.hasPhoto}`);
}

const residents = await firestore.collection("residents").limit(20).get();
console.log(`residents: ${residents.size}`);
for (const doc of residents.docs) {
  const d = doc.data();
  console.log(
    `  - ${doc.id} state=${d.avatarState} source=${d.avatarSource} visible=${d.visible} photo=${d.hasPhoto}`,
  );
}

const sessions = await firestore.collection("sessions").limit(20).get();
console.log(`sessions: ${sessions.size}`);

for (const [label, name] of [
  ["private", privateBucket],
  ["assets", assetBucket],
]) {
  const [files] = await storage.bucket(name).getFiles({ maxResults: 10 });
  console.log(`${label} bucket ${name}: ${files.length} file(s)`);
  for (const f of files) console.log(`  - ${f.name}`);
}
