// 用真實瀏覽器檢查平板 /city 頁面是否真的渲染出角色，不需要本機起服務。
import { chromium } from "@playwright/test";

const BASE = process.env.AI_CITY_BASE ?? "https://ai-city-web-391632496355.asia-northeast1.run.app";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

// 監看頁面自己發出的對話請求，確認它拿到的是 codex 而非 fallback。
const conversationResponses = [];
page.on("response", async (res) => {
  if (!res.url().includes("/api/city/conversation")) return;
  try {
    conversationResponses.push(await res.json());
  } catch {
    conversationResponses.push({ error: "unparseable" });
  }
});

await page.goto(`${BASE}/city`, { waitUntil: "networkidle" });
console.log(`title: ${await page.title()}`);

// 等角色數量文字出現（頁面用「住民 N 人」表示）
await page
  .waitForFunction(() => !/住民を待っています/.test(document.body.innerText) || true, {
    timeout: 20000,
  })
  .catch(() => {});
await page.waitForTimeout(6000);

const status = await page.locator('p[role="status"]').innerText();
console.log(`status line: ${JSON.stringify(status)}`);

const canvases = await page.locator("canvas").count();
console.log(`canvas count: ${canvases}`);

const headings = await page.locator("h1").allInnerTexts();
console.log(`h1: ${JSON.stringify(headings)}`);

// 抓 residents API 的實際內容（頁面就是靠它）
const api = await page.evaluate(async () => {
  const r = await fetch("/api/city/residents", { cache: "no-store" });
  return r.json();
});
console.log(`residents via page fetch: ${api.residents.length}`);
for (const r of api.residents) console.log(`  - ${r.nickname} (${r.avatarSource}) ${r.avatarUrl}`);

// 確認角色圖能從瀏覽器載入
for (const r of api.residents) {
  const img = await page.evaluate(async (url) => {
    const res = await fetch(url);
    return {
      status: res.status,
      type: res.headers.get("content-type"),
      bytes: (await res.blob()).size,
    };
  }, r.avatarUrl);
  console.log(`  image ${r.avatarUrl} -> ${img.status} ${img.type} ${img.bytes}B`);
}

await page.screenshot({ path: ".probe/city-tablet.png", fullPage: false });
console.log("screenshot: .probe/city-tablet.png");

// 對話每 8 秒一輪，等足夠久才抓得到。
console.log("waiting up to 30s for the page to request a conversation...");
const deadline = Date.now() + 30_000;
while (conversationResponses.length === 0 && Date.now() < deadline) {
  await page.waitForTimeout(1000);
}
console.log(`conversation responses observed: ${conversationResponses.length}`);
for (const c of conversationResponses.slice(0, 2)) {
  console.log(`  source=${c.source} speakers=${c.speakers?.a} / ${c.speakers?.b}`);
  for (const l of c.lines ?? []) console.log(`    [${l.speaker}] ${l.text}`);
}

console.log(`console errors: ${consoleErrors.length}`);
for (const e of consoleErrors.slice(0, 10)) console.log(`  ! ${e.slice(0, 160)}`);

await browser.close();
