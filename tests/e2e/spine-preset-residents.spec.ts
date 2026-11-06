import { expect, test } from "@playwright/test";

test("a manager can add and remove multiple official samples in the live city", async ({
  browser,
  request,
  baseURL,
}, testInfo) => {
  const origin = new URL(baseURL as string).origin;
  const bootstrap = await request.post("/api/link/bootstrap", { data: {}, headers: { origin } });
  expect(bootstrap.ok()).toBe(true);
  const { key } = await bootstrap.json();
  const manager = await browser.newContext();
  const tablet = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await tablet.newPage();
  try {
    await manager.request.post("/api/link/login", { data: { key }, headers: { origin } });
    const code = await (
      await manager.request.post("/api/link/pairing", { data: {}, headers: { origin } })
    ).json();
    await page.goto("/tablet?tools=1");
    await page.getByLabel("8桁の接続コード").fill(code.code);
    await page.getByRole("button", { name: "街に接続" }).click();
    const adminPage = await manager.newPage();
    await adminPage.goto("/admin");
    const add = adminPage.getByRole("button", { name: "見本・あおいを街に追加" });
    await add.click();
    await expect(page.locator(".tablet-city")).toHaveAttribute("data-spine-sample", "ready", {
      timeout: 30000,
    });
    await add.click();
    await expect
      .poll(
        async () => (await (await manager.request.get("/api/link/admin")).json()).presetIds.length,
      )
      .toBe(2);
    await expect(page.getByLabel("参加状況").getByText("街にいる人物").locator("..")).toContainText(
      "2人",
    );
    await page.screenshot({ path: testInfo.outputPath("official-residents.png") });
    await expect(page.getByLabel("参加状況").getByText("参加人数").locator("..")).toContainText(
      "0人",
    );
    await expect
      .poll(
        async () =>
          (await (await tablet.request.get("/api/link/display")).json()).snapshot.residents.filter(
            (resident: { residentId: string }) => resident.residentId.startsWith("preset-aoi"),
          ).length,
      )
      .toBe(2);
    await adminPage.getByRole("button", { name: "見本・あおいを街から外す" }).click();
    await expect
      .poll(
        async () => (await (await manager.request.get("/api/link/admin")).json()).presetIds.length,
      )
      .toBe(1);
  } finally {
    await manager.close();
    await tablet.close();
  }
});
