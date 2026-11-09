import { expect, test } from "@playwright/test";

test("the official sample is rendered in the tablet demo city", async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(60000);
  const origin = "http://127.0.0.1:3001";
  const { key } = await (
    await request.post("/api/link/bootstrap", { data: {}, headers: { origin } })
  ).json();
  const manager = await browser.newContext();
  const display = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    reducedMotion: "reduce",
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
    await page.goto("/tablet");
    await page.getByLabel("8桁の接続コード").fill(pairing.code);
    await page.getByRole("button", { name: "街に接続", exact: true }).click();
    await expect(page.locator(".tablet-city")).toHaveAttribute("data-spine-sample", "ready", {
      timeout: 30000,
    });
    await expect(page.locator("canvas")).toHaveCount(1);
    await page.getByText("住民のプロフィールを選ぶ").click();
    await page.getByRole("button", { name: "そらのプロフィール" }).click();
    await expect(page.getByRole("region", { name: "そら", exact: true })).toBeVisible();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: testInfo.outputPath("official-sample-city.png") });
    expect(errors).toEqual([]);
    await page.route("**/chibi-demo/chibi-stickers.atlas", (route) => route.abort());
    await page.reload();
    await expect(page.locator(".tablet-city")).toHaveAttribute("data-spine-sample", "failed", {
      timeout: 30000,
    });
    await expect(page.getByRole("status")).toContainText("見本イラストを表示しています");
    await expect(page.locator("canvas")).toHaveCount(1);
  } finally {
    await manager.request.post("/api/link/logout", { data: {}, headers: { origin } });
    await display.request.post("/api/link/logout", { data: {}, headers: { origin } });
    await manager.close();
    await display.close();
  }
});
