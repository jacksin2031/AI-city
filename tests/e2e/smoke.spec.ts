import { expect, type Page, test } from "@playwright/test";

// CSP violations and uncaught errors surface as console errors / page errors in Chromium.
//
// Chromium's GPU driver also reports pure performance advisories ("GPU stall due to
// ReadPixels") through the same console channel when Phaser renders the WebGL city. Those
// describe the host GPU, not this application, so they are filtered BY EXACT PATTERN only:
// a real console error, a CSP violation, a page error, or any warning that is not a GL driver
// performance message still fails the test.
const DRIVER_PERF_WARNING = /^\[.WebGL-[^\]]+\]GL Driver Message \([^)]*Performance[^)]*\)/;

function isHostGpuAdvisory(type: string, text: string) {
  return type === "warning" && DRIVER_PERF_WARNING.test(text);
}

function collectProblems(page: Page) {
  const problems: string[] = [];
  page.on("console", (message) => {
    const type = message.type();
    const text = message.text();
    if (isHostGpuAdvisory(type, text)) return;
    if (type === "error" || type === "warning") problems.push(`${type}: ${text}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

for (const [path, heading] of [
  ["/", "バーチャル御茶ノ水～もうひとりの自分が暮らす街～"],
  ["/join", "バーチャル御茶ノ水への参加"],
  ["/city", "街の住民たち"],
] as const) {
  test(`${path} renders in Japanese under a nonce CSP without errors`, async ({ page }) => {
    const problems = collectProblems(page);
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);

    const policy = response?.headers()["content-security-policy"] ?? "";
    const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
    expect(nonce).toBeTruthy();
    expect(policy).not.toContain("unsafe-inline");
    expect(policy).not.toContain("unsafe-eval");
    // Every server-rendered script carries this request's nonce. Chunks loaded later (Phaser)
    // are trusted through 'strict-dynamic' and are not part of the HTML.
    const scripts = (await response?.text())?.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag).toContain(`nonce="${nonce}"`);

    await page.waitForLoadState("networkidle");
    expect(problems).toEqual([]);
  });
}

test("nonces differ per request", async ({ request }) => {
  const nonces = await Promise.all(
    [1, 2].map(async () => {
      const policy = (await request.get("/")).headers()["content-security-policy"];
      return policy.match(/'nonce-([^']+)'/)?.[1];
    }),
  );
  expect(nonces[0]).toBeTruthy();
  expect(nonces[0]).not.toBe(nonces[1]);
});

test("participants may continue without photo consent", async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto("/");
  // The participant pages and the venue city are separate interfaces.
  await expect(page.locator('a[href="/city"]')).toHaveCount(0);

  const join = page.getByRole("button", { name: "同意して参加する" });
  await expect(join).toBeDisabled();
  await expect(page.getByRole("checkbox")).toHaveCount(3);

  // The terms box only ticks after the terms sheet has been shown and confirmed.
  // The native inputs are visually hidden, so tap the visible labels like a participant would.
  const terms = page.getByRole("checkbox", { name: "注意事項・免責事項を確認しました" });
  await page.getByText("注意事項・免責事項を確認しました").click();
  await expect(terms).not.toBeChecked();
  const sheet = page.getByRole("dialog", { name: "注意事項・免責事項" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "確認しました" }).click();
  await expect(sheet).toBeHidden();
  await expect(terms).toBeChecked();

  await expect(join).toBeDisabled();
  await expect(
    page.getByRole("checkbox", { name: "写真のAI処理に同意します（写真を使う場合のみ）" }),
  ).not.toBeChecked();
  await page.getByText("アバターを街で公開することに同意します").click();
  await page.getByRole("button", { name: "同意して参加する" }).click();
  await expect(page).toHaveURL("/join");
  expect(problems).toEqual([]);
});

for (const path of ["/", "/join"]) {
  test(`${path} fits one phone screen without scrolling`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    // Measure the settled layout: let the finite entrance animations finish first.
    const overflow = await page.evaluate(async () => {
      const entrances = document
        .getAnimations()
        .filter(
          (animation) => animation.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY,
        );
      await Promise.all(entrances.map((animation) => animation.finished));
      return document.documentElement.scrollHeight - window.innerHeight;
    });
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("the city keeps exactly one Phaser canvas across navigation", async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto("/city");
  const canvas = page.locator("section.city canvas");
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toBeVisible();
  await expect(page.getByText("住民を待っています")).toBeVisible();
  await expect(page.locator('a[href="/"], a[href="/join"]')).toHaveCount(0);

  await page.goto("/");
  await page.goBack();
  await expect(page).toHaveURL("/city");
  await expect(canvas).toHaveCount(1);
  await expect(page.locator("canvas")).toHaveCount(1);
  expect(problems).toEqual([]);
});

test("health stays honest about the mock and denies document use", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(await response.json()).toEqual({
    status: "ok",
    mode: "mock",
    locale: "ja-JP",
    liveServicesConnected: false,
    chat: "fallback",
    avatars: "sample",
  });
  expect(response.headers()["content-security-policy"]).toBe(
    "default-src 'none'; frame-ancestors 'none'",
  );
  expect(response.headers()["x-frame-options"]).toBe("DENY");
});
