import { expect, test } from "@playwright/test";

test("mobile manager starts and pauses atomically, refreshes and confirms display revocation", async ({
  page,
  request,
}) => {
  const bootstrap = await request.post("/api/link/bootstrap", {
    data: {},
    headers: { origin: "http://127.0.0.1:3000" },
  });
  const { key } = await bootstrap.json();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/admin");
  await page.getByLabel("管理キー", { exact: true }).fill(key);
  await page.getByRole("button", { name: "管理画面に接続", exact: true }).click();
  await page.getByRole("button", { name: "展示を開始", exact: true }).click();
  await expect
    .poll(async () => (await (await page.request.get("/api/link/admin")).json()).control)
    .toMatchObject({ displayMode: "LIVE", motionEnabled: true });
  await expect(page.getByText("参加者の街で展示を開始しました。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "休場する", exact: true }).click();
  await expect
    .poll(async () => (await (await page.request.get("/api/link/admin")).json()).control)
    .toMatchObject({ displayMode: "MAINTENANCE", motionEnabled: false });
  await page.getByRole("button", { name: "今すぐ同期", exact: true }).click();
  await expect(page.getByText("現在の状態を確認しました。", { exact: true })).toBeVisible();
  await expect(page.getByText(/最終通信：/)).toBeVisible();
  await page.getByText("接続を終了する", { exact: true }).click();
  await page.getByRole("button", { name: "タブレットの接続をすべて解除", exact: true }).click();
  await expect(page.getByRole("button", { name: "解除を確定", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "解除をやめる", exact: true }).click();
  await expect(page.getByRole("button", { name: "解除を確定", exact: true })).toHaveCount(0);
  await page.route("**/api/link/pairing", async (route) => {
    const response = await route.fetch();
    const value = await response.json();
    // Shorten only the UI clock fixture. Server-side expiry has service coverage.
    await route.fulfill({
      response,
      json: { ...value, expiresAt: new Date(Date.now() + 2000).toISOString() },
    });
  });
  await page.getByRole("button", { name: "タブレットの接続コードを発行" }).click();
  await expect(page.getByTestId("pair-countdown")).toBeVisible();
  await expect(
    page.getByText("コードの有効期限が切れました。新しいコードを発行してください。", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByTestId("pair-code")).toHaveCount(0);
  await page.unroute("**/api/link/pairing");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('a[href="/join"],a[href="/tablet"]')).toHaveCount(0);
  await page.screenshot({ path: "output/playwright/admin-controls-mobile.png", fullPage: true });
  const state = await (await page.request.get("/api/link/admin")).json();
  await page.request.post("/api/link/control", {
    data: { expectedRevision: state.control.revision, displayMode: "DEMO", motionEnabled: true },
    headers: { origin: "http://127.0.0.1:3000" },
  });
  await page.request.post("/api/link/logout", {
    data: {},
    headers: { origin: "http://127.0.0.1:3000" },
  });
});

test("resident search, sorting and selection survive partial withdrawal without false success", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const origin = "http://127.0.0.1:3000";
  const { key } = await (
    await request.post("/api/link/bootstrap", { data: {}, headers: { origin } })
  ).json();
  const prefix = `選択${Date.now()}`;
  const contexts = [];
  try {
    for (const suffix of ["い", "あ"]) {
      const context = await browser.newContext();
      contexts.push(context);
      const visitor = await context.newPage();
      await visitor.goto("/join");
      await visitor.getByLabel("架空のニックネーム").fill(prefix + suffix);
      await visitor.getByRole("button", { name: "サンプルを準備" }).click();
      await visitor.getByLabel("アバターをローカル連携画面に表示する").check();
      await visitor.getByLabel("ニックネームを表示する").check();
      await visitor.getByRole("button", { name: "ローカル一覧に追加" }).click();
      await expect(
        visitor.getByText("連携用の一覧に追加しました。", { exact: true }),
      ).toBeVisible();
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/admin");
    await page.getByLabel("管理キー", { exact: true }).fill(key);
    await page.getByRole("button", { name: "管理画面に接続", exact: true }).click();
    await page.getByLabel("住民を検索", { exact: true }).fill(prefix);
    const rows = page.locator("article.managed-resident");
    await expect(rows).toHaveCount(2);
    await page.getByRole("combobox", { name: "並び順", exact: true }).selectOption("NAME");
    await expect(rows.first().locator("strong")).toHaveText(`${prefix}あ`);
    await page.getByRole("combobox", { name: "並び順", exact: true }).selectOption("JOINED");
    await expect(rows.first().locator("strong")).toHaveText(`${prefix}い`);
    await page.getByRole("button", { name: "表示中を選択", exact: true }).click();
    await page.getByLabel("住民を検索", { exact: true }).fill(`${prefix}い`);
    await expect(rows).toHaveCount(1);
    await page.getByRole("button", { name: "選択した住民を削除", exact: true }).click();
    const confirmation = page.getByRole("group", { name: "選択した住民の削除確認", exact: true });
    await expect(confirmation.getByRole("listitem")).toHaveText([`${prefix}い`, `${prefix}あ`]);
    await page.getByRole("button", { name: "削除をやめる", exact: true }).click();
    await page.getByLabel("住民を検索", { exact: true }).fill(prefix);
    await expect(rows).toHaveCount(2);
    await expect(page.getByText(/選択 2人/)).toBeVisible();
    let calls = 0;
    await page.route("**/api/link/remove", async (route) => {
      calls++;
      if (calls === 2) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            mode: "MOCK",
            error: { code: "STORE_UNAVAILABLE", message: "接続を確認してください。" },
          }),
        });
      } else await route.continue();
    });
    await page.getByRole("button", { name: "選択した住民を削除", exact: true }).click();
    await page.getByRole("button", { name: "選択した2人の削除を確定", exact: true }).click();
    await expect(page.getByText("1人を公開一覧から削除しました。", { exact: true })).toBeVisible();
    const failure = page
      .getByRole("alert")
      .filter({ hasText: "残り1人の削除は完了を確認できませんでした。" });
    await expect(failure).toBeVisible();
    await expect(rows).toHaveCount(1);
    await expect(page.getByText(/選択 1人/)).toBeVisible();
    // A successful background poll must not erase an unconfirmed destructive action.
    await page.waitForTimeout(1500);
    await expect(failure).toBeVisible();
    expect(calls).toBe(2);
    await page.screenshot({
      path: "output/playwright/admin-partial-removal-mobile.png",
      fullPage: true,
    });
    await page.unroute("**/api/link/remove");
    await page.getByRole("button", { name: "選択した住民を削除", exact: true }).click();
    await page.getByRole("button", { name: "選択した1人の削除を確定", exact: true }).click();
    await expect(rows).toHaveCount(0);
    await expect(failure).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
    await page.request.post("/api/link/logout", { data: {}, headers: { origin } });
  } finally {
    for (const context of contexts) {
      const response = await context.request.get("/api/dev/jobs/current");
      if (response.ok()) {
        const current = await response.json();
        if (current?.job?.jobId)
          await context.request.post(`/api/dev/jobs/${current.job.jobId}/remove`, {
            data: {},
            headers: { origin },
          });
      }
      await context.close();
    }
  }
});
