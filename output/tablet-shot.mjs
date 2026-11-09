// Local visual check helper (not committed): pairs a tablet like tests/e2e/tablet-focus and
// screenshots the full-screen city, then a tapped profile card.
import { chromium, request as http } from "@playwright/test";

const origin = process.argv[2] ?? "http://127.0.0.1:3100";
const api = await http.newContext({ baseURL: origin });
const { key } = await (await api.post("/api/link/bootstrap", { data: {}, headers: { origin } })).json();
const browser = await chromium.launch({ channel: "chrome" });
const manager = await browser.newContext({ baseURL: origin });
await manager.request.post("/api/link/login", { data: { key }, headers: { origin } });
const initial = await (await manager.request.get("/api/link/admin")).json();
await manager.request.post("/api/link/control", {
  data: { expectedRevision: initial.control.revision, displayMode: "DEMO", motionEnabled: true },
  headers: { origin },
});
const pairing = await (await manager.request.post("/api/link/pairing", { data: {}, headers: { origin } })).json();
const display = await browser.newContext({ baseURL: origin, viewport: { width: 1280, height: 800 } });
const page = await display.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto("/tablet");
await page.getByLabel("8桁の接続コード").fill(pairing.code);
await page.getByRole("button", { name: "街に接続", exact: true }).click();
await page.locator("section.tablet-city[data-ready=true]").waitFor();
await page.waitForTimeout(3000);
await page.screenshot({ path: "output/playwright/tablet-full.png" });
await page.getByText("住民のプロフィールを選ぶ").click();
await page.getByRole("button", { name: "そらのプロフィール" }).click();
await page.waitForTimeout(1600);
await page.screenshot({ path: "output/playwright/tablet-card.png" });
console.log(JSON.stringify(errors));
await browser.close();
