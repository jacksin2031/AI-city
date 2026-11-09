// Local visual check helper (not committed): default view plus a zoomed-out overview.
import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://127.0.0.1:3100/city";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 2000, height: 1300 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
await page.goto(url);
const canvas = page.locator("canvas");
await canvas.waitFor();
await page.waitForTimeout(6000);
await canvas.screenshot({ path: "output/playwright/iso-default.png" });
const box = await canvas.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 100);
await page.waitForTimeout(800);
await canvas.screenshot({ path: "output/playwright/iso-overview.png" });
console.log(JSON.stringify(errors));
await browser.close();
