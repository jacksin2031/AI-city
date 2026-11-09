// Local visual check helper (not committed): one screenshot per tour stop.
import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://127.0.0.1:3100/city";
const stops = Number(process.argv[3] ?? 8);
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto(url);
await page.locator("canvas").waitFor();
await page.waitForTimeout(5000);
await page.locator("canvas").screenshot({ path: "output/playwright/tour-0.png" });
for (let i = 1; i < stops; i++) {
  await page.waitForTimeout(16200);
  await page.locator("canvas").screenshot({ path: `output/playwright/tour-${i}.png` });
}
console.log(JSON.stringify(errors));
await browser.close();
