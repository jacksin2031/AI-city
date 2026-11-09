import { expect, test } from "@playwright/test";

test("an older server-rendered tablet reloads after two matching newer revision polls", async ({
  page,
}) => {
  test.setTimeout(45_000);
  let polls = 0;
  let pageLoads = 0;
  page.on("load", () => {
    pageLoads += 1;
  });

  // E2E webServer starts with K_REVISION=ai-city-web-00041-old.
  // Fake only the later API response, never the original server-rendered page.
  await page.clock.install();
  await page.route("**/api/version", async (route) => {
    polls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Cache-Control": "no-store" },
      body: JSON.stringify({ version: "ai-city-web-00042-new" }),
    });
  });

  await page.goto("/tablet");
  await expect(page.getByRole("heading", { name: "タブレットを接続" })).toBeVisible();
  expect(await page.content()).toContain("ai-city-web-00041-old");
  await expect.poll(() => polls).toBeGreaterThanOrEqual(1);
  expect(pageLoads).toBe(1);

  // Advance one polling interval without waiting a wall-clock minute.
  await page.clock.fastForward(60_100);
  await expect.poll(() => polls).toBeGreaterThanOrEqual(2);
  await expect.poll(() => pageLoads).toBe(2);
  await expect(page.getByRole("heading", { name: "タブレットを接続" })).toBeVisible();
});
