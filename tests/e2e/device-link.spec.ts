import { expect, test } from "@playwright/test";
import { isKnownCiDriverWarning } from "../helpers/browser-console";

test("mobile manager pairs an isolated tablet, controls it and revokes its read-only session", async ({
  browser,
  request,
}) => {
  test.setTimeout(60000);
  const bootstrap = await request.post("/api/link/bootstrap", {
    data: {},
    headers: { origin: "http://127.0.0.1:3000" },
  });
  expect(bootstrap.ok()).toBe(true);
  const { key } = await bootstrap.json();
  const phoneContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    locale: "ja-JP",
  });
  const tabletContext = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    locale: "ja-JP",
    reducedMotion: "reduce",
  });
  const phone = await phoneContext.newPage();
  const tablet = await tabletContext.newPage();
  const problems: string[] = [];
  for (const target of [phone, tablet]) {
    target.on("pageerror", (error) => problems.push(error.message));
    target.on("console", (message) => {
      if (!["error", "warning"].includes(message.type())) return;
      if (isKnownCiDriverWarning(message.type(), message.text(), Boolean(process.env.CI))) return;
      // Anonymous login and the explicit permission probe intentionally return 401/403.
      if (
        /^Failed to load resource: the server responded with a status of (401|403) /.test(
          message.text(),
        )
      )
        return;
      problems.push(message.text());
    });
  }
  await phone.goto("/admin");
  await phone.getByLabel("管理キー", { exact: true }).fill(key);
  await phone.getByRole("button", { name: "管理画面に接続", exact: true }).click();
  await expect(phone.getByRole("heading", { name: "スマホで街を管理" })).toBeVisible();
  await tablet.goto("/tablet");
  await expect(tablet.getByRole("heading", { name: "タブレットを接続" })).toBeVisible();
  await phone.getByRole("button", { name: "タブレットの接続コードを発行" }).click();
  const code = await phone.getByTestId("pair-code").innerText();
  await tablet.getByLabel("8桁の接続コード").fill(code);
  await tablet.getByRole("button", { name: "街に接続" }).click();
  await expect(tablet.locator("section.tablet-city canvas")).toHaveCount(1);
  await expect(tablet.getByText("架空の住民・イラスト見本", { exact: true })).toBeVisible();
  expect(
    (
      await tabletContext.request.post("/api/link/control", {
        data: { expectedRevision: 0, displayMode: "LIVE" },
        headers: { origin: "http://127.0.0.1:3000" },
      })
    ).status(),
  ).toBe(403);
  await phone.getByRole("button", { name: "参加者の街", exact: true }).click();
  await expect(tablet.getByText("参加者の街", { exact: true })).toBeVisible();
  const visitorContext = await browser.newContext();
  const visitor = await visitorContext.newPage();
  const nickname = `管理撤回${Date.now()}`;
  await visitor.goto("/join");
  await visitor.getByLabel("架空のニックネーム").fill(nickname);
  await visitor.getByRole("button", { name: "サンプルを準備" }).click();
  await expect(visitor.getByRole("heading", { name: "サンプルを確認" })).toBeVisible();
  await visitor.getByLabel("アバターをローカル連携画面に表示する").check();
  await visitor.getByLabel("ニックネームを表示する").check();
  await visitor.getByRole("button", { name: "ローカル一覧に追加" }).click();
  const row = phone.locator("article.managed-resident").filter({ hasText: nickname });
  await expect(row).toBeVisible();
  await tablet.reload();
  await expect(tablet.locator("canvas")).toHaveCount(1);
  await row.getByRole("button", { name: "街から削除" }).click();
  await row.getByRole("button", { name: "削除を確定" }).click();
  await expect(row).toHaveCount(0);
  await visitor.reload();
  await expect(visitor.getByRole("heading", { name: "削除しました" })).toBeVisible();
  await visitorContext.close();
  await phone.getByRole("button", { name: "動きを止める", exact: true }).click();
  await expect(tablet.getByText("動きは停止中", { exact: true })).toBeVisible();
  await phone.getByRole("button", { name: "展示を休止", exact: true }).click();
  await expect(tablet.getByRole("heading", { name: "ただいま準備中です" })).toBeVisible();
  await expect(tablet.locator("canvas")).toHaveCount(0);
  await phone.getByRole("button", { name: "イラストの見本", exact: true }).click();
  await expect(tablet.locator("canvas")).toHaveCount(1);
  expect(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await tablet.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await phone.screenshot({ path: "output/playwright/mobile-admin.png", fullPage: true });
  await tablet.screenshot({ path: "output/playwright/paired-tablet.png", fullPage: true });
  await tablet.route("**/api/link/display", () => undefined);
  await expect(tablet.locator("canvas")).toHaveCount(0, { timeout: 6500 });
  await expect(tablet.getByText(/再接続しています/)).toBeVisible();
  await tablet.unroute("**/api/link/display");
  await expect(tablet.locator("canvas")).toHaveCount(1);
  await phone.getByText("接続を終了する", { exact: true }).click();
  await phone.getByRole("button", { name: "タブレットの接続をすべて解除" }).click();
  await expect(tablet.getByRole("heading", { name: "タブレットを接続" })).toBeVisible();
  await expect(tablet.locator("canvas")).toHaveCount(0);
  expect(problems).toEqual([]);
  await phoneContext.close();
  await tabletContext.close();
});
