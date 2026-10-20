import { expect, test } from "@playwright/test";

test("sample illustrations have profiles, four directions and preset actions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/city");
  await expect(page.locator("section.city canvas")).toHaveCount(1);
  await page.getByRole("button", { name: "そらのプロフィール", exact: true }).click();
  await expect(page.getByRole("heading", { name: "そら", exact: true })).toBeVisible();
  await expect(page.locator(".direction-previews img")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "動きを再開", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "手を振る", exact: true }).click();
  await expect(page.getByText("現在の動作：手を振る", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "話す", exact: true }).click();
  await expect(page.getByText("こんにちは。広場でひと休みしよう！", { exact: true })).toBeVisible();
  await page.screenshot({ path: "output/playwright/illustrated-city-desktop.png", fullPage: true });
});

test("phone confirmation enters the illustrated city, reconnects and withdrawal removes the character", async ({
  page,
  context,
}) => {
  const nickname = `仮の住民${Date.now()}`;
  await page.goto("/join");
  await page.getByLabel("架空のニックネーム").fill(nickname);
  await page.getByLabel("キャラクターのサンプル").selectOption("haru");
  await page.getByRole("button", { name: "サンプルを準備" }).click();
  await expect(page.getByRole("heading", { name: "サンプルを確認" })).toBeVisible();
  await expect(page.getByAltText("簡易イラストのプレビュー")).toBeVisible();
  const city = await context.newPage();
  await city.goto("/city?mode=participants");
  const residentButton = city.getByRole("button", {
    name: `${nickname}のプロフィール`,
    exact: true,
  });
  await expect(residentButton).toHaveCount(0);
  await page.getByLabel("アバターをローカル連携画面に表示する").check();
  await page.getByLabel("ニックネームを表示する").check();
  await page.getByRole("button", { name: "ローカル一覧に追加" }).click();
  await expect(residentButton).toBeVisible();
  await residentButton.click();
  await expect(city.getByText("性格：非公開", { exact: true })).toBeVisible();
  await city.screenshot({
    path: "output/playwright/illustrated-city-participant.png",
    fullPage: true,
  });
  await city.route("**/api/dev/city/**", (route) => route.abort("internetdisconnected"));
  await expect(residentButton).toHaveCount(0);
  await expect(city.getByRole("alert").filter({ hasText: "接続" })).toBeVisible();
  await city.unroute("**/api/dev/city/**");
  await expect(residentButton).toBeVisible();
  await city.reload();
  await expect(residentButton).toBeVisible();
  // Leave the request pending; the page must abort its own deadline.
  await city.route("**/api/dev/city/**", () => undefined);
  await expect(residentButton).toHaveCount(0, { timeout: 6500 });
  await expect(city.getByRole("alert").filter({ hasText: "接続" })).toBeVisible();
  await city.unroute("**/api/dev/city/**");
  await expect(residentButton).toBeVisible();
  await page.getByRole("button", { name: "一覧から削除" }).click();
  await expect(residentButton).toHaveCount(0);
  await expect(city.getByRole("heading", { name: nickname, exact: true })).toHaveCount(0);
});

test("the illustrated city fits mobile and keeps one canvas when switching modes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/city");
  await expect(page.locator("section.city canvas")).toHaveCount(1);
  await page.getByRole("button", { name: "はるのプロフィール", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "output/playwright/illustrated-city-mobile.png", fullPage: true });
  await page.getByRole("link", { name: "参加者の街", exact: true }).click();
  await expect(page).toHaveURL(/mode=participants/);
  await expect(page.locator("section.city canvas")).toHaveCount(1);
  await page.getByRole("link", { name: "イラストの見本", exact: true }).click();
  await expect(page.getByRole("button", { name: "そらのプロフィール", exact: true })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
});
