import { expect, test } from "@playwright/test";

test("synthetic animated texture is drawn in the 3D city", async ({ page }, testInfo) => {
  await page.goto("/animation-test");
  await expect(page.getByRole("heading", { name: "合成アニメーション表示テスト" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("表示中", { timeout: 30000 });
  await expect(page.getByTestId("animation-name")).toContainText("movement/");
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.getByTestId("animation-name").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: testInfo.outputPath("city.png"), fullPage: true });
});
