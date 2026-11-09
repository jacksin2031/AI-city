// Local visual check helper (not committed): renders every chibi pose on one sheet.
import { chromium } from "@playwright/test";

const { characterDataUrl } = await import("../packages/city/src/illustrations.ts");
const cells = [];
for (const version of ["fixture-sora-v1", "fixture-haru-v1", "placeholder-guest"])
  for (const direction of ["front", "right", "back", "left"])
    for (const action of ["idle", "walk", "talk", "wave", "sit"])
      cells.push(`<img src="${characterDataUrl(version, direction, action, 1, 3)}" width="144" height="192">`);
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1500, height: 2400 } });
await page.setContent(`<body style="margin:0;background:#cfe3c1;display:grid;grid-template-columns:repeat(10,144px);gap:4px">${cells.join("")}</body>`);
await page.waitForTimeout(500);
await page.screenshot({ path: "output/playwright/characters.png", fullPage: true });
await browser.close();
