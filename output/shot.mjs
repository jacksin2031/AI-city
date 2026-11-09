// Local visual check helper (not committed): screenshots the city canvas at full resolution.
import { chromium } from "@playwright/test";

const [url = "http://127.0.0.1:3100/city", out = "output/playwright/ochanomizu.png", wait = "4000"] =
  process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));
await page.goto(url);
await page.locator("canvas").waitFor();
await page.waitForTimeout(Number(wait));
await page.locator("canvas").screenshot({ path: out });
console.log(JSON.stringify(errors));
await browser.close();
