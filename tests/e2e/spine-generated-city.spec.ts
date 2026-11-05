import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { loadToolBundleCandidate } from "../../apps/web/lib/spine/tool-bundle";

// Opt-in: shows an already generated, published tool export in the tablet city. No model calls.
const directory = process.env.AI_CITY_SPINE_PUBLISHED_DIR ?? "";
test.skip(!existsSync(join(directory, "build-manifest.json")), "no generated export configured");

test("a generated participant character is drawn in the tablet city", async ({
  browser,
  request,
}) => {
  test.setTimeout(90000);
  const candidate = await loadToolBundleCandidate("spine-generated-demo", directory, true);
  const { descriptor, manifest, assets } = candidate;
  const origin = "http://127.0.0.1:3000";
  const { key } = await (
    await request.post("/api/link/bootstrap", { data: {}, headers: { origin } })
  ).json();
  const manager = await browser.newContext();
  const display = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    reducedMotion: "no-preference",
  });
  const page = await display.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await manager.request.post("/api/link/login", { data: { key }, headers: { origin } });
    const initial = await (await manager.request.get("/api/link/admin")).json();
    await manager.request.post("/api/link/control", {
      data: {
        expectedRevision: initial.control.revision,
        displayMode: "DEMO",
        motionEnabled: true,
      },
      headers: { origin },
    });
    const pairing = await (
      await manager.request.post("/api/link/pairing", { data: {}, headers: { origin } })
    ).json();
    await page.route("**/api/link/display", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      if (body.snapshot?.avatars?.[0]) {
        body.snapshot.mode = "LOCAL_PRIVATE_TEST";
        body.snapshot.avatars[0].assetStatus = "VERIFIED_SPINE";
        body.snapshot.avatars[0].manifest.spine = descriptor;
        delete body.snapshot.avatars[0].manifest.directions;
      }
      await route.fulfill({ response, json: body });
    });
    await page.route("**/avatars/spine-generated-demo/**", async (route) => {
      const name = new URL(route.request().url()).pathname.split("/").at(-1) ?? "";
      const body = name === "build-manifest.json" ? manifest : assets[name];
      if (!body) return route.fulfill({ status: 404 });
      return route.fulfill({
        status: 200,
        body: Buffer.from(body),
        contentType: name.endsWith(".png") ? "image/png" : "application/octet-stream",
      });
    });
    await page.goto("/tablet");
    await page.getByLabel("8桁の接続コード").fill(pairing.code);
    await page.getByRole("button", { name: "街に接続", exact: true }).click();
    await expect(page.locator(".tablet-city")).toHaveAttribute("data-spine-bundles", "1", {
      timeout: 60000,
    });
    await page.waitForTimeout(2500);
    await mkdir("output/playwright", { recursive: true });
    await page.screenshot({ path: "output/playwright/generated-character-tablet.png" });
    await page.getByText("住民のプロフィールを選ぶ").click();
    await page
      .getByRole("button", { name: /のプロフィール$/ })
      .first()
      .click();
    await page.waitForTimeout(3500);
    await page.screenshot({ path: "output/playwright/generated-character-tablet-focus.png" });
    expect(errors).toEqual([]);
  } finally {
    await manager.request.post("/api/link/logout", { data: {}, headers: { origin } });
    await display.request.post("/api/link/logout", { data: {}, headers: { origin } });
    await manager.close();
    await display.close();
  }
});
