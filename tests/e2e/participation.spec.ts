import { expect, test } from "@playwright/test";

test("a fictional participant can preview, choose public fields, recover and withdraw", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const nickname = `テスト${Date.now()}`;
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/join");
  await page.getByLabel("架空のニックネーム").fill(nickname);
  await page.getByRole("button", { name: "サンプルを準備" }).click();
  await expect(page.getByRole("heading", { name: "サンプルを確認" })).toBeVisible();
  await page.screenshot({ path: "output/playwright/a-local-preview-mobile.png", fullPage: true });
  await expect(page.getByRole("button", { name: "ローカル一覧に追加" })).toBeDisabled();
  const snapshotBefore = await (
    await page.request.get("/api/dev/city/snapshot?eventId=fixture-event")
  ).json();
  expect(
    snapshotBefore.residents.some(
      (resident: { nickname: string }) => resident.nickname === nickname,
    ),
  ).toBe(false);
  await page.getByLabel("アバターをローカル連携画面に表示する").check();
  await page.getByLabel("ニックネームを表示する").check();
  await page.getByRole("button", { name: "ローカル一覧に追加" }).click();
  await expect(page.getByText("連携用の一覧に追加しました。")).toBeVisible();
  await page.reload();
  await expect(page.getByText("連携用の一覧に追加しました。")).toBeVisible();
  const otherPage = await context.newPage();
  await otherPage.goto("/integration");
  await expect(otherPage.getByRole("heading", { name: nickname, exact: true })).toBeVisible();
  await expect(otherPage.getByText("性格：非公開", { exact: true })).toBeVisible();
  await otherPage.screenshot({ path: "output/playwright/b-integration.png", fullPage: true });
  await page.getByRole("button", { name: "一覧から削除" }).click();
  await expect(page.getByText("サンプルを削除しました。")).toBeVisible();
  await expect(otherPage.getByRole("heading", { name: nickname, exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a failed mock generation can retry once and a cancelled job stays cancelled after refresh", async ({
  page,
}) => {
  await page.goto("/join");
  await page.getByText("失敗・再試行の動作も試す").click();
  await page.getByLabel("動作サンプル").selectOption("FAIL_ONCE");
  await page.getByRole("button", { name: "サンプルを準備" }).click();
  await expect(page.getByText("準備に失敗しました。もう一度お試しください。")).toBeVisible();
  await page.getByRole("button", { name: "もう一度準備" }).click();
  await expect(page.getByRole("heading", { name: "サンプルを確認" })).toBeVisible();
  await page.getByRole("button", { name: "参加を中止" }).click();
  await page.reload();
  await expect(page.getByText("参加を中止しました。")).toBeVisible();
  await expect(page.getByRole("button", { name: "ローカル一覧に追加" })).toHaveCount(0);
});

test("mobile-width participation has no horizontal overflow or photo input", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/join");
  await expect(page.getByLabel("架空のニックネーム")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await page.getByLabel("六つの質問に答える").check();
  await expect(page.locator(".questions").getByRole("group")).toHaveCount(6);
  await page.screenshot({ path: "output/playwright/a-local-form-mobile.png", fullPage: true });
});

test("a lost local session recovers through the page action without a browser reload", async ({
  page,
  context,
}) => {
  await page.goto("/join");
  await page.getByRole("button", { name: "サンプルを準備" }).click();
  await expect(page.getByRole("heading", { name: "サンプルを確認" })).toBeVisible();
  await context.clearCookies();
  await page.getByRole("button", { name: "参加を中止" }).click();
  await expect(
    page.getByText("参加情報の有効期限が切れました。最初からお試しください。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "参加情報を読み直す" }).click();
  await expect(page.getByRole("heading", { name: "サンプルで参加の流れを試す" })).toBeVisible();
});
