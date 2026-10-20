import { expect, type Page, test } from "@playwright/test";
import { isKnownCiDriverWarning } from "../helpers/browser-console";

// CSP violations and uncaught errors surface as console errors / page errors in Chromium.
function collectProblems(page: Page) {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (isKnownCiDriverWarning(message.type(), message.text(), Boolean(process.env.CI))) {
      test
        .info()
        .annotations.push({ type: "CI WebGL driver warning", description: message.text() });
      return;
    }
    if (message.type() === "error" || message.type() === "warning")
      problems.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

for (const [path, heading] of [
  ["/", "あなたの分身を、この街へ。"],
  ["/join", "AIシティへの参加"],
  ["/city", "街の開発サンプル"],
  ["/integration", "ローカル連携サンプル"],
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

test("the city sample keeps exactly one Phaser canvas across navigation", async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto("/city");
  const canvas = page.locator("section.city canvas");
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toBeVisible();
  await expect(page.getByText("動作確認用です")).toBeVisible();

  await page.getByRole("link", { name: "戻る" }).click();
  await expect(page).toHaveURL("/");
  await page.getByRole("link", { name: "街のサンプルを見る" }).click();
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
  });
  expect(response.headers()["content-security-policy"]).toBe(
    "default-src 'none'; frame-ancestors 'none'",
  );
  expect(response.headers()["x-frame-options"]).toBe("DENY");
});
