import { expect, type Page, test } from "@playwright/test";

const failedTask = "spine-11111111-1111-4111-8111-111111111111";
const publishedTask = "spine-22222222-2222-4222-8222-222222222222";
const dir = "/avatars/fixture/v1";
const view = {
  worker: { online: false, lastSeenAt: new Date(Date.now() - 3_600_000).toISOString() },
  queued: 1,
  running: 0,
  truncated: false,
  repairs: [],
  tasks: [
    {
      task: failedTask,
      code: "aaaa1111",
      state: "FAILED",
      stateSince: new Date(Date.now() - 300_000).toISOString(),
      needsAttention: true,
      preview: null,
    },
    {
      task: publishedTask,
      code: "bbbb2222",
      state: "PUBLISHED",
      stateSince: new Date(Date.now() - 7_200_000).toISOString(),
      needsAttention: false,
      preview: {
        bundle: {
          runtime: "4.3",
          skeleton: `${dir}/skeleton.json`,
          atlas: `${dir}/skeleton.atlas`,
          pages: [`${dir}/page.png`],
          orientationPolicy: `${dir}/orientation-policy.json`,
          buildManifest: `${dir}/build-manifest.json`,
          sha256: "0".repeat(64),
        },
        adjustment: null,
      },
    },
  ],
};

async function openAdmin(
  page: Page,
  request: Parameters<Parameters<typeof test>[2]>[0]["request"],
) {
  const bootstrap = await request.post("/api/link/bootstrap", {
    data: {},
    headers: { origin: "http://127.0.0.1:3000" },
  });
  const { key } = await bootstrap.json();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin");
  await page.getByLabel("管理キー", { exact: true }).fill(key);
  await page.getByRole("button", { name: "管理画面に接続", exact: true }).click();
}

test("phone admin photo panel: offline worker, cost confirmation and no horizontal scroll", async ({
  page,
  request,
}) => {
  const posts: unknown[] = [];
  await page.route("**/api/link/spine-admin", async (route) => {
    if (route.request().method() === "POST") posts.push(route.request().postDataJSON());
    await route.fulfill({ json: view });
  });
  await openAdmin(page, request);
  await expect(page.getByText(/Worker 停止？ 最終確認/)).toBeVisible();
  await expect(page.locator(".spine-worker")).toHaveCSS("color", "rgb(138, 28, 28)");
  const rows = page.locator(".spine-row");
  await expect(rows.first()).toContainText("aaaa1111");
  await expect(rows.nth(1)).toContainText("bbbb2222");
  expect(
    await page.evaluate(() => {
      const root = document.scrollingElement;
      return root ? root.scrollWidth <= root.clientWidth : false;
    }),
  ).toBe(true);

  await rows.first().click();
  await page.getByRole("button", { name: "取り消す", exact: true }).click();
  await expect(page.getByText(/元に戻せません/)).toBeVisible();
  expect(posts).toHaveLength(0);
  await page.getByRole("button", { name: "やめる", exact: true }).click();
  expect(posts).toHaveLength(0);
  await page.getByRole("button", { name: "作り直す", exact: true }).click();
  await expect(page.getByText("外部のAIサービスを再び使用し、費用がかかります")).toBeVisible();
  await page.getByRole("button", { name: "やめる", exact: true }).click();
  expect(posts).toHaveLength(0);

  await page.getByRole("button", { name: "作り直す", exact: true }).click();
  await page.getByRole("button", { name: "費用を了承して作り直す", exact: true }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({ action: "requeue", task: failedTask, confirmCost: true });
  await page.getByRole("button", { name: "取り消す", exact: true }).click();
  await page.getByRole("button", { name: "取り消しを確定", exact: true }).click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1]).toMatchObject({ action: "cancel", task: failedTask });
});

test("phone admin photo panel shows 未接続 when visitors are disabled", async ({
  page,
  request,
}) => {
  await page.route("**/api/link/spine-admin", (route) =>
    route.fulfill({
      status: 503,
      json: { mode: "MOCK", error: { code: "VISITORS_DISABLED", message: "参加機能は無効です。" } },
    }),
  );
  await openAdmin(page, request);
  await expect(page.getByText("未接続", { exact: true })).toBeVisible();
  await expect(page.locator(".spine-row")).toHaveCount(0);
});

test("a failed poll keeps loaded data and the open detail, with a warning", async ({
  page,
  request,
}) => {
  let failing = false;
  await page.route("**/api/link/spine-admin", async (route) => {
    if (failing)
      await route.fulfill({
        status: 500,
        json: { mode: "MOCK", error: { code: "INTERNAL_ERROR", message: "失敗" } },
      });
    else await route.fulfill({ json: view });
  });
  await openAdmin(page, request);
  await page.locator(".spine-row").nth(1).click();
  await expect(page.getByRole("button", { name: "保存", exact: true })).toBeVisible();
  failing = true;
  await expect(page.getByText("最新の状態を取得できません。再試行しています")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("button", { name: "保存", exact: true })).toBeVisible();
  await expect(page.getByText("未接続", { exact: true })).toHaveCount(0);
});
