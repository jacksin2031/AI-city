import { expect, test } from "@playwright/test";

test("Spine runtime renders a synthetic skeleton in the city", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/spine-test");
  await expect(page.getByRole("status")).toHaveText("Spine 表示中", { timeout: 30000 });
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: testInfo.outputPath("spine-city.png"), fullPage: true });
  expect(errors).toEqual([]);
});
