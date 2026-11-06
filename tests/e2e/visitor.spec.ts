import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { isKnownCiDriverWarning } from "../helpers/browser-console";

const codeFree = process.env.AI_CITY_TEST_CODE_FREE === "1";

test("photo stays on the device and is cleared on withdrawal and leaving the step", async ({
  page,
}) => {
  test.skip(!codeFree, "Local photo flow uses code-free participation");
  const submissions: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") submissions.push(request.postData() ?? "");
  });
  await page.goto("/join");
  await page.getByLabel("ニックネーム", { exact: true }).fill("架空テスト");
  await page.getByRole("button", { name: "次へ", exact: true }).click();
  const input = page.getByLabel("写真を選ぶ", { exact: true });
  await expect(input).toBeDisabled();
  const consent = page.getByLabel("自分の写真をこの端末で一時表示することに同意します");
  await consent.check();
  await input.setInputFiles({
    name: "fictional.png",
    mimeType: "image/png",
    buffer: Buffer.from("not-a-png"),
  });
  await expect(page.getByRole("alert").filter({ hasText: "JPEG・PNG・WebP" })).toBeVisible();
  const image = {
    name: "fictional.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=",
      "base64",
    ),
  };
  await input.setInputFiles(image);
  const preview = page.getByRole("img", { name: "この端末だけの写真プレビュー" });
  await expect(preview).toBeVisible();
  await page.getByRole("button", { name: "写真のプレビューを削除" }).click();
  await expect(preview).toHaveCount(0);
  await input.setInputFiles(image);
  await expect(preview).toBeVisible();
  await consent.uncheck();
  await expect(preview).toHaveCount(0);
  await consent.check();
  await input.setInputFiles(image);
  await expect(preview).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await expect(preview).toHaveCount(0);
  await expect(consent).not.toBeChecked();
  await consent.check();
  await input.setInputFiles(image);
  await expect(preview).toBeVisible();
  await page.getByRole("button", { name: "写真を使わずにカスタマイズ" }).click();
  await expect(preview).toHaveCount(0);
  await page.getByRole("button", { name: "戻る" }).click();
  await expect(consent).not.toBeChecked();
  expect(submissions).toEqual([]);
});

async function prepareNewParticipant(page: Page, name: string, answer = false) {
  await page.getByLabel("ニックネーム", { exact: true }).fill(name);
  await page.getByRole("button", { name: "次へ", exact: true }).click();
  await page.getByRole("button", { name: "写真を使わずにカスタマイズ" }).click();
  await page.getByRole("radio", { name: "むらさき" }).check();
  await page.getByRole("radio", { name: "星" }).check();
  await page.getByRole("radio", { name: "はる" }).check();
  await page.getByRole("button", { name: "このキャラクターで進む" }).click();
  await expect(page.getByRole("radio")).toHaveCount(3);
  if (answer) {
    for (let i = 0; i < 6; i++) {
      await page.getByRole("radio").first().check();
      await page
        .getByRole("button", { name: i === 5 ? "プレビューへ" : "次へ", exact: true })
        .click();
    }
  } else await page.getByRole("button", { name: "質問をスキップ" }).click();
  await expect(page.getByRole("heading", { name: "公開する内容を確認" })).toBeVisible({
    timeout: 15000,
  });
}

test("code-free manager batch withdrawal persists for both owners", async ({
  browser,
  request,
}) => {
  test.skip(!codeFree, "Batch management is checked with the public code-free flow");
  test.setTimeout(60000);
  const origin = "http://127.0.0.1:3001";
  const { key } = await (
    await request.post("/api/link/bootstrap", { data: {}, headers: { origin } })
  ).json();
  const managerContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const visitors = [];
  const prefix = `一括確認${Date.now()}`;
  try {
    for (const suffix of ["あ", "い"]) {
      const context = await browser.newContext();
      visitors.push(context);
      const visitor = await context.newPage();
      await visitor.goto("/join");
      await prepareNewParticipant(visitor, prefix + suffix);
      await visitor.getByLabel("アバターをこの展示サイトに公開する", { exact: true }).check();
      await visitor.getByLabel("ニックネームを表示する", { exact: true }).check();
      await visitor
        .getByRole("button", { name: "確認した項目を公開して街に参加", exact: true })
        .click();
      await expect(visitor.getByRole("region", { name: "あなたのカード" })).toContainText(
        "むらさき・星",
      );
      await expect(visitor.getByRole("img", { name: /^性格六角形：/ })).toBeVisible();
      await expect(visitor.getByRole("button", { name: "カードを画像で保存" })).toBeVisible();
      await expect
        .poll(
          async () =>
            (await (await context.request.get("/api/visitor/jobs/current")).json()).publication,
        )
        .toBe("PUBLISHED");
    }
    const manager = await managerContext.newPage();
    await manager.goto("/admin");
    await manager.getByLabel("管理キー", { exact: true }).fill(key);
    await manager.getByRole("button", { name: "管理画面に接続", exact: true }).click();
    await manager.getByLabel("住民を検索", { exact: true }).fill(prefix);
    await expect(manager.locator("article.managed-resident")).toHaveCount(2);
    await manager.getByRole("button", { name: "表示中を選択", exact: true }).click();
    await manager.getByRole("button", { name: "選択した住民を削除", exact: true }).click();
    await manager.getByRole("button", { name: "選択した2人の削除を確定", exact: true }).click();
    await expect(
      manager.getByText("2人を公開一覧から削除しました。", { exact: true }),
    ).toBeVisible();
    for (const context of visitors) {
      const view = await (await context.request.get("/api/visitor/jobs/current")).json();
      expect(view.publication).toBe("REMOVED");
    }
    await manager.reload();
    await expect(manager.getByRole("button", { name: "展示を開始", exact: true })).toBeVisible();
    await expect(
      manager.locator("article.managed-resident").filter({ hasText: prefix }),
    ).toHaveCount(0);
  } finally {
    for (const context of visitors) {
      await context.request.post("/api/visitor/logout", { data: {}, headers: { origin } });
      await context.close();
    }
    await managerContext.request.post("/api/link/logout", { data: {}, headers: { origin } });
    await managerContext.close();
  }
});

test("AI questionnaire offers three choices and sends only the entertainment result", async ({
  page,
}) => {
  test.skip(!codeFree, "New participant flow uses code-free admission");
  await page.goto("/join");
  await page.getByLabel("ニックネーム", { exact: true }).fill("架空テスト");
  await page.getByRole("button", { name: "次へ", exact: true }).click();
  await page.getByRole("button", { name: "写真を使わずにカスタマイズ" }).click();
  await page.getByRole("button", { name: "このキャラクターで進む" }).click();
  let submittedAt = 0;
  const submitted = page.waitForRequest(
    (req) => req.url().endsWith("/api/visitor/jobs") && req.method() === "POST",
  );
  for (let i = 1; i <= 6; i++) {
    await expect(page.getByText(`質問 ${i} / 6`)).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(3);
    await page.getByRole("radio").first().check();
    if (i === 6) submittedAt = Date.now();
    await page
      .getByRole("button", { name: i === 6 ? "プレビューへ" : "次へ", exact: true })
      .click();
  }
  await expect(page.getByRole("status")).toContainText("準備しています");
  await expect(page.getByText("スマホのAIスタイル：ひらめき探検家（娯楽用）")).toBeVisible({
    timeout: 15000,
  });
  expect((await submitted).postDataJSON()).toMatchObject({
    aiStyle: "INSPIRED_EXPLORER",
    answers: null,
  });
  await page.reload();
  // A reload never reopens the earlier participation on its own: it is announced first, without
  // the earlier participant's name or card, and resumed by an explicit choice.
  const guard = page.getByTestId("existing-guard");
  await expect(guard).toBeVisible();
  await expect(guard).toContainText("街に公開されているキャラクターがあります");
  await expect(page.getByText("スマホのAIスタイル：ひらめき探検家（娯楽用）")).toHaveCount(0);
  await guard.getByRole("button", { name: "自分の参加を続ける" }).click();
  await expect(page.getByText("スマホのAIスタイル：ひらめき探検家（娯楽用）")).toBeVisible();
  expect(Date.now() - submittedAt).toBeGreaterThanOrEqual(3400);
  await page.getByRole("button", { name: "参加を中止して情報を削除" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("the three role entry points have no hyperlinks between them", async ({
  browser,
  page,
  request,
}) => {
  test.skip(!codeFree, "Separate public entry navigation is checked with code-free participation");
  await page.goto("/");
  await expect(
    page.locator('a[href="/admin"], a[href="/tablet"], a[href="/city"], a[href="/integration"]'),
  ).toHaveCount(0);
  await expect(page.locator('a[href="/join"]')).toHaveCount(1);
  await page.goto("/join");
  await expect(page.locator('a[href="/admin"], a[href="/tablet"]')).toHaveCount(0);
  const managerContext = await browser.newContext();
  const tabletContext = await browser.newContext();
  try {
    const manager = await managerContext.newPage();
    const tablet = await tabletContext.newPage();
    const key = (
      await (
        await request.post("/api/link/bootstrap", {
          data: {},
          headers: { origin: "http://127.0.0.1:3001" },
        })
      ).json()
    ).key;
    await manager.goto("/admin");
    await expect(manager.locator("a[href]")).toHaveCount(0);
    await manager.getByLabel("管理キー", { exact: true }).fill(key);
    await manager.getByRole("button", { name: "管理画面に接続", exact: true }).click();
    await expect(manager.getByRole("button", { name: "参加者の街", exact: true })).toBeVisible();
    await expect(manager.locator("a[href]")).toHaveCount(0);
    await tablet.goto("/tablet");
    await expect(tablet.locator("a[href]")).toHaveCount(0);
    await managerContext.request.post("/api/link/logout", {
      data: {},
      headers: { origin: "http://127.0.0.1:3001" },
    });
  } finally {
    await Promise.all([managerContext.close(), tabletContext.close()]);
  }
});

test("independent visitor resumes, shares only approved fields and withdraws from paired tablet", async ({
  browser,
  request,
}) => {
  test.setTimeout(90000);
  const origin = "http://127.0.0.1:3001";
  const bootstrap = await request.post("/api/link/bootstrap", { data: {}, headers: { origin } });
  expect(bootstrap.ok()).toBe(true);
  const { key } = await bootstrap.json();
  const visitorContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    locale: "ja-JP",
  });
  const otherContext = await browser.newContext({ locale: "ja-JP" });
  const managerContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    locale: "ja-JP",
  });
  const tabletContext = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    locale: "ja-JP",
    reducedMotion: "reduce",
  });
  const visitor = await visitorContext.newPage();
  const manager = await managerContext.newPage();
  const tablet = await tabletContext.newPage();
  const problems: string[] = [];
  for (const page of [visitor, manager, tablet]) {
    page.on("pageerror", (error) => problems.push(error.message));
    page.on("console", (message) => {
      if (message.type() !== "error" && message.type() !== "warning") return;
      if (isKnownCiDriverWarning(message.type(), message.text(), Boolean(process.env.CI))) return;
      if (
        /Failed to load resource: the server responded with a status of (401|403)/.test(
          message.text(),
        )
      )
        return;
      problems.push(message.text());
    });
  }
  try {
    await manager.goto("/admin");
    await manager.getByLabel("管理キー", { exact: true }).fill(key);
    const loggedIn = manager.waitForResponse(
      (response) =>
        response.url().endsWith("/api/link/login") && response.request().method() === "POST",
    );
    await manager.getByRole("button", { name: "管理画面に接続", exact: true }).click();
    expect((await loggedIn).status()).toBe(200);
    const adminProbe = await managerContext.request.get("/api/link/admin", { timeout: 15000 });
    expect(adminProbe.status(), JSON.stringify(await adminProbe.json())).toBe(200);
    await manager.getByRole("button", { name: "参加者の街", exact: true }).click();
    await manager.getByRole("button", { name: "タブレットの接続コードを発行" }).click();
    const code = await manager.getByTestId("pair-code").innerText();
    await tablet.goto("/tablet");
    await tablet.getByLabel("8桁の接続コード").fill(code);
    await tablet.getByRole("button", { name: "街に接続", exact: true }).click();
    await visitor.goto("/join");
    if (codeFree) {
      await expect(visitor.getByLabel("参加用コード", { exact: true })).toHaveCount(0);
      await expect(
        manager.getByRole("button", { name: "参加用コードを発行", exact: true }),
      ).toHaveCount(0);
      await expect(
        visitor.getByRole("heading", { name: "ニックネームを教えてください", exact: true }),
      ).toBeVisible();
      expect((await visitorContext.cookies()).some((c) => c.name === "ai-city-visitor")).toBe(
        false,
      );
      await visitor.screenshot({ path: "output/playwright/code-free-entry.png", fullPage: true });
    } else {
      await expect(visitor.getByText(/このブラウザーだけの参加情報/)).toBeVisible();
      const invited = manager.waitForResponse((response) =>
        response.url().endsWith("/api/link/visitor-invitation"),
      );
      await manager.getByRole("button", { name: "参加用コードを発行", exact: true }).click();
      const inviteResponse = await invited;
      expect(inviteResponse.status(), JSON.stringify(await inviteResponse.json())).toBe(200);
      const invitation = await manager
        .getByTestId("visitor-invitation")
        .innerText({ timeout: 10000 });
      await visitor.getByLabel("参加用コード", { exact: true }).fill(invitation);
      await visitor.getByRole("button", { name: "参加を始める", exact: true }).click();
    }
    if (codeFree) await prepareNewParticipant(visitor, "永続テスト・架空", true);
    else {
      await visitor.getByLabel("架空のニックネーム", { exact: true }).fill("永続テスト・架空");
      await visitor.getByRole("button", { name: "サンプルを準備", exact: true }).click();
    }
    await expect(
      visitor.getByRole("heading", {
        name: codeFree ? "公開する内容を確認" : "サンプルを確認",
        exact: true,
      }),
    ).toBeVisible();
    const current = await visitorContext.request.get("/api/visitor/jobs/current");
    const jobId = (await current.json()).job.jobId;
    await visitor.reload();
    if (codeFree) {
      // The earlier participation is announced first and resumed by an explicit choice.
      const guard = visitor.getByTestId("existing-guard");
      await expect(guard).toContainText("公開前の確認待ち");
      await guard.getByRole("button", { name: "自分の参加を続ける" }).click();
    }
    await expect(
      visitor.getByRole("heading", {
        name: codeFree ? "公開する内容を確認" : "サンプルを確認",
        exact: true,
      }),
    ).toBeVisible();
    const invitationResponse = codeFree
      ? null
      : await managerContext.request.post("/api/link/visitor-invitation", {
          data: {},
          headers: { origin },
        });
    const nextInvitation = invitationResponse ? (await invitationResponse.json()).code : undefined;
    await otherContext.request.post("/api/visitor/session", {
      data: codeFree ? {} : { invitation: nextInvitation },
      headers: { origin },
    });
    expect((await otherContext.request.get(`/api/visitor/jobs/${jobId}`)).status()).toBe(404);
    await expect
      .poll(
        async () =>
          (await (await tabletContext.request.get("/api/link/display")).json()).snapshot.residents
            .length,
      )
      .toBe(0);
    await visitor.getByLabel("アバターをこの展示サイトに公開する", { exact: true }).check();
    await visitor.getByLabel("ニックネームを表示する", { exact: true }).check();
    if (codeFree)
      await visitor.getByLabel("AIスタイル（遊びの性格）を表示する", { exact: true }).check();
    await visitor
      .getByRole("button", { name: "確認した項目を公開して街に参加", exact: true })
      .click();
    await expect(
      manager.getByRole("article").filter({ hasText: "永続テスト・架空" }),
    ).toBeVisible();
    await expect
      .poll(
        async () =>
          (await (await tabletContext.request.get("/api/link/display")).json()).snapshot.residents
            .length,
      )
      .toBe(1);
    const welcome = tablet.getByRole("region", {
      name: "ようこそ、永続テスト・架空さん！",
      exact: true,
    });
    await expect(welcome).toBeVisible();
    await welcome.getByRole("button", { name: "プロフィールを見る", exact: true }).click();
    const profile = tablet.getByRole("region", { name: "永続テスト・架空", exact: true });
    await expect(
      profile.getByText(codeFree ? "ひらめき探検家" : "非公開", { exact: true }),
    ).toBeVisible();
    await expect(profile.getByText("非公開・指定なし", { exact: true })).toBeVisible();
    await profile.getByRole("button", { name: "拡大を閉じる" }).click();
    await expect(profile).toHaveCount(0);
    await visitor.getByRole("button", { name: "平板で自分のキャラクターに注目" }).click();
    await expect(profile).toBeVisible();
    expect(Number(await profile.getAttribute("data-camera-zoom"))).toBeGreaterThan(1);
    await expect(
      visitor.getByRole("status").filter({ hasText: "平板でキャラクターを表示しました。" }),
    ).toBeVisible();
    const publicSnapshot = await (await tabletContext.request.get("/api/link/display")).json();
    expect(publicSnapshot.snapshot.residents[0]).toMatchObject({
      personalityLabel: codeFree ? "ひらめき探検家" : "非公開",
      interests: [],
    });
    expect(JSON.stringify(publicSnapshot)).not.toMatch(/ownerDigest|answers|recordedAt/);
    expect((await visitorContext.request.get("/api/link/admin")).status()).toBe(401);
    const cookie = (await visitorContext.cookies()).find((c) => c.name === "ai-city-visitor");
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Strict", path: "/api/visitor" });
    expect(await visitor.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await visitor.screenshot({ path: "output/playwright/persistent-visitor.png", fullPage: true });
    await tablet.screenshot({ path: "output/playwright/persistent-tablet.png", fullPage: true });
    if (codeFree) {
      const feedback = visitor.getByRole("dialog", { name: "アンケートのお願い" });
      await expect(feedback).toBeVisible({ timeout: 25000 });
      await expect(feedback.getByRole("link", { name: "アンケートに回答する" })).toHaveAttribute(
        "href",
        /docs\.google\.com\/forms\//,
      );
      await feedback.getByRole("button", { name: "あとで" }).click();
      // The confirmation is on the page itself: embedded mobile browsers suppress window.confirm.
      visitor.on("dialog", () => {
        throw new Error("window.confirm must not be used");
      });
      await visitor
        .getByRole("button", { name: "公開を取り消して、最初からやり直す", exact: true })
        .click();
      const confirm = visitor.getByRole("group", { name: "最初からやり直す確認" });
      await expect(confirm).toBeVisible();
      await confirm.getByRole("button", { name: "やめる", exact: true }).click();
      await expect(profile).toBeVisible();
      await visitor
        .getByRole("button", { name: "公開を取り消して、最初からやり直す", exact: true })
        .click();
      await visitor
        .getByRole("group", { name: "最初からやり直す確認" })
        .getByRole("button", { name: "取り消して最初からやり直す", exact: true })
        .click();
      await expect(visitor.getByLabel("ニックネーム", { exact: true })).toHaveValue("");
      await expect(profile).toHaveCount(0);
      await expect
        .poll(
          async () =>
            (await (await tabletContext.request.get("/api/link/display")).json()).snapshot.residents
              .length,
        )
        .toBe(0);
      expect((await visitorContext.cookies()).some((c) => c.name === "ai-city-visitor")).toBe(
        false,
      );
      expect(problems).toEqual([]);
      return;
    }
    await visitor
      .getByRole("button", { name: codeFree ? "公開を取り消す" : "一覧から削除", exact: true })
      .click();
    await expect(profile).toHaveCount(0);
    await expect
      .poll(
        async () =>
          (await (await tabletContext.request.get("/api/link/display")).json()).snapshot.residents
            .length,
      )
      .toBe(0);
    await visitor.reload();
    await expect(
      visitor.getByRole("heading", {
        name: codeFree ? "街から削除しました" : "削除しました",
        exact: true,
      }),
    ).toBeVisible();
    await visitor.getByRole("button", { name: "参加情報を削除して終了", exact: true }).click();
    await expect(visitor).toHaveURL(`${origin}/`);
    expect((await visitorContext.cookies()).some((c) => c.name === "ai-city-visitor")).toBe(false);
    expect(problems).toEqual([]);
  } catch (error) {
    const safe = (value: string) => value.replace(/[a-f0-9]{32,}/gi, "[redacted]");
    console.log(
      safe(
        JSON.stringify({
          manager: await manager
            .locator("body")
            .innerText({ timeout: 1000 })
            .catch(() => "unavailable"),
          problems,
        }),
      ),
    );
    throw error;
  } finally {
    await Promise.all([
      visitorContext.close(),
      otherContext.close(),
      managerContext.close(),
      tabletContext.close(),
    ]);
  }
});

test("actual Node restart preserves signed visitor identity and publication but requires device login again", async () => {
  test.setTimeout(90000);
  const app = fileURLToPath(new URL("../../apps/web/", import.meta.url));
  const require = createRequire(new URL("../../apps/web/package.json", import.meta.url));
  const origin = "http://127.0.0.1:3002";
  const namespace = `restart-${randomUUID()}`;
  let child: ChildProcess | null = null;
  async function start() {
    child = spawn(
      process.execPath,
      [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3002"],
      {
        cwd: app,
        stdio: "ignore",
        env: {
          ...process.env,
          AI_CITY_ENABLE_LOCAL_MOCK: "1",
          AI_CITY_LOOPBACK_PREVIEW: "1",
          AI_CITY_ENABLE_VISITORS: "1",
          AI_CITY_VISITOR_CODE_FREE: codeFree ? "1" : "0",
          AI_CITY_VISITOR_PROJECT_ID: "demo-ai-city",
          AI_CITY_VISITOR_NAMESPACE: namespace,
          AI_CITY_VISITOR_HMAC_KEY: "fixture-only-stable-visitor-key-for-restart",
          AI_CITY_ADMIN_KEY: "fixture-only-stable-admin-key-for-restart",
          FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
          GOOGLE_APPLICATION_CREDENTIALS: "/ai-city-emulator-must-not-use-adc.json",
        },
      },
    );
    for (let attempt = 0; attempt < 200; attempt++) {
      if (child.exitCode !== null) throw new Error("Local restart test server exited");
      try {
        if ((await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(500) })).ok) return;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Local restart test server failed readiness");
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const current = child;
    const exited = new Promise<void>((resolve) => current.once("exit", () => resolve()));
    current.kill();
    await exited;
    child = null;
  }
  const call = (path: string, cookie?: string, body?: unknown) =>
    fetch(`${origin}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body === undefined ? {} : { origin, "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10000),
    });
  async function login() {
    const response = await call("/api/link/login", undefined, {
      key: "fixture-only-stable-admin-key-for-restart",
    });
    expect(response.status).toBe(200);
    return response.headers
      .getSetCookie()
      .find((value) => value.startsWith("ai-city-link="))
      ?.split(";")[0];
  }
  try {
    await start();
    const admin = await login();
    const invitation = codeFree
      ? null
      : await (await call("/api/link/visitor-invitation", admin, {})).json();
    const session = await call(
      "/api/visitor/session",
      undefined,
      invitation ? { invitation: invitation.code } : {},
    );
    expect(session.status).toBe(200);
    const cookie = session.headers.getSetCookie()[0]?.split(";")[0];
    expect((await call("/api/visitor/jobs/current", cookie)).status).toBe(200);
    const created = await (
      await call("/api/visitor/jobs", cookie, {
        eventId: "fixture-event",
        requestId: "restart-job",
        nickname: "再起動テスト・架空",
        sampleId: "aoi",
        answers: null,
        scenario: "SUCCESS",
      })
    ).json();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await call(`/api/visitor/jobs/${created.job.jobId}`, cookie);
    expect(
      (
        await call(`/api/visitor/jobs/${created.job.jobId}/confirm`, cookie, {
          consentVersion: 2,
          publicationScope: "HOSTED_PREVIEW",
          avatarPublicConsent: true,
          fields: { nickname: true, personality: false, interests: false },
        })
      ).status,
    ).toBe(200);
    await stop();
    await start();
    const restored = await call("/api/visitor/jobs/current", cookie);
    expect(restored.status).toBe(200);
    expect((await restored.json()).publication).toBe("PUBLISHED");
    expect((await call("/api/link/admin", admin)).status).toBe(401);
    const nextAdmin = await login();
    expect(
      (await (await call("/api/link/admin", nextAdmin)).json()).snapshot.residents,
    ).toHaveLength(1);
    expect((await call(`/api/visitor/jobs/${created.job.jobId}/remove`, cookie, {})).status).toBe(
      200,
    );
    expect(
      (await (await call("/api/link/admin", nextAdmin)).json()).snapshot.residents,
    ).toHaveLength(0);
    await call("/api/visitor/logout", cookie, {});
  } finally {
    await stop();
  }
});
