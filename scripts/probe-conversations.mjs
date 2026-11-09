import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { Firestore } = require("@google-cloud/firestore");
const db = new Firestore({ projectId: "ai-city-511822" });

const snap = await db.collection("conversations").get();
console.log(`conversations: ${snap.size}`);
for (const doc of snap.docs) {
  const d = doc.data();
  console.log(`  key=${doc.id}`);
  console.log(`  source=${d.source} order=${d.order}`);
  for (const l of d.lines ?? []) console.log(`    [${l.speaker}] ${l.text}`);
}
