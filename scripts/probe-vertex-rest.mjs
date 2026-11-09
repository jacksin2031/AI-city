// 角度二：不經 SDK，直接用 gcloud 拿到的 token 打 REST API。
import { execSync } from "node:child_process";

const token = execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
const project = "ai-city-511822";

const checks = [
  `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models`,
  `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/gemini-2.5-flash`,
  `https://aiplatform.googleapis.com/v1/projects/${project}/locations/us-central1/publishers/google/models/gemini-2.5-flash`,
];

for (const url of checks) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  console.log(`${r.status}  ${url.replace(project, "<proj>")}`);
  console.log(`     ${(await r.text()).slice(0, 200)}`);
}

const gen = await fetch(
  `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/gemini-2.5-flash:generateContent`,
  {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: "say OK" }] }] }),
  },
);
console.log(`generateContent -> ${gen.status}`);
console.log(`     ${(await gen.text()).slice(0, 300)}`);
