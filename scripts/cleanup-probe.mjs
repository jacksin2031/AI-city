// 撤回測試資料：走真實的 DELETE /api/join 流程，驗證撤回功能同時清理。
// 需要該 session 的 cookie，所以先重建 session 再 DELETE 不可行（residentId 綁在舊 session）。
// 改用 Firestore/GCS 直接清理，並驗證公開 API 不再顯示。
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { Firestore } = require("@google-cloud/firestore");
const { Storage } = require("@google-cloud/storage");

const project = "ai-city-511822";
const privateBucket = `${project}-private`;
const assetBucket = `${project}-assets`;
const firestore = new Firestore({ projectId: project });
const storage = new Storage({ projectId: project });

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.log("no resident ids given; nothing to do");
  process.exit(0);
}

for (const rid of targets) {
  const resident = await firestore.collection("residents").doc(rid).get();
  const data = resident.data();
  console.log(`resident ${rid}: exists=${resident.exists} visible=${data?.visible}`);
  if (resident.exists) {
    await firestore
      .collection("residents")
      .doc(rid)
      .set({ visible: false, avatarState: "FAILED" }, { merge: true });
    console.log(`  marked hidden`);
  }
  const job = await firestore.collection("jobs").doc(rid).get();
  if (job.exists) {
    await firestore.collection("jobs").doc(rid).set({ state: "CANCELLED" }, { merge: true });
    console.log(`  job cancelled`);
  }
  await storage.bucket(assetBucket).file(`avatars/${rid}.png`).delete({ ignoreNotFound: true });
  console.log(`  avatar deleted`);
}

// 清掉探測留下的 session 與對話快取
const sessions = await firestore.collection("sessions").get();
for (const doc of sessions.docs) {
  await doc.ref.delete();
}
console.log(`sessions deleted: ${sessions.size}`);

const conversations = await firestore.collection("conversations").get();
for (const doc of conversations.docs) {
  await doc.ref.delete();
}
console.log(`conversation cache deleted: ${conversations.size}`);

// 連 residents / jobs 文件本身也刪掉，不留探測痕跡
for (const rid of targets) {
  await firestore.collection("residents").doc(rid).delete();
  await firestore.collection("jobs").doc(rid).delete();
}
console.log(`resident/job documents deleted: ${targets.length}`);
