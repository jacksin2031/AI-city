import type { DeviceAdmin } from "@ai-city/contracts/device-link";
import { expect, test } from "@playwright/test";

test("a real canvas tap opens an enlarged public profile, respects reduced motion and closes with Escape", async ({
  browser,
  request,
}) => {
  // Loading and drawing the 3D city on a software GPU takes a while under parallel load.
  test.setTimeout(60000);
  const origin = "http://127.0.0.1:3000";
  const { key } = await (
    await request.post("/api/link/bootstrap", { data: {}, headers: { origin } })
  ).json();
  const manager = await browser.newContext();
  const display = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    reducedMotion: "reduce",
    hasTouch: true,
  });
  const page = await display.newPage();
  try {
    await manager.request.post("/api/link/login", { data: { key }, headers: { origin } });
    const initial = await (await manager.request.get("/api/link/admin")).json();
    await manager.request.post("/api/link/control", {
      data: {
        expectedRevision: initial.control.revision,
        displayMode: "DEMO",
        motionEnabled: true,
      },
      headers: { origin },
    });
    const pairing = await (
      await manager.request.post("/api/link/pairing", { data: {}, headers: { origin } })
    ).json();
    await page.goto("/tablet");
    await page.getByLabel("8桁の接続コード").fill(pairing.code);
    await page.getByRole("button", { name: "街に接続", exact: true }).click();
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveCount(1);
    await expect(page.locator("section.tablet-city")).toHaveAttribute("data-ready", "true", {
      timeout: 30_000,
    });
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas unavailable");
    // With motion reduced, そら and はる stand still in front of JR御茶ノ水駅 in the opening view.
    await page.touchscreen.tap(box.x + (689 / 960) * box.width, box.y + (343 / 600) * box.height);
    const profile = page.getByRole("region", { name: "そら", exact: true });
    await expect(profile).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".tablet-portrait")).toHaveCount(0);
    await expect(profile).toHaveAttribute("data-actor-x", "480");
    await expect(profile).toHaveAttribute("data-actor-y", "490");
    await expect(profile).toHaveAttribute("data-scale", "0.69");
    await expect(profile).toHaveAttribute("data-world-x", "-121.5");
    await expect(profile).toHaveAttribute("data-world-y", "38.5");
    await expect(profile).toHaveAttribute("data-camera-zoom", "5");
    await expect(profile.getByText(/性格/)).toBeVisible();
    await expect(profile).toHaveAttribute("data-animated", "false");
    await expect(profile.getByText("架空の住民・イラスト見本", { exact: true })).toBeVisible();
    const speech = await profile.boundingBox();
    expect(speech && speech.width * speech.height).toBeLessThan(box.width * box.height * 0.18);
    await page.screenshot({ path: "output/playwright/tablet-profile.png", fullPage: true });
    // The map is interactive: tapping its exposed background closes camera focus.
    // The 3D canvas can extend beyond the clipped viewport; tap its visible background.
    await page.touchscreen.tap(100, 650);
    await expect(profile).toHaveCount(0);
    await expect(page.locator(".tablet-scene-canvas")).toHaveAttribute("data-camera-zoom", "1");
    await page.touchscreen.tap(box.x + (519 / 960) * box.width, box.y + (330 / 600) * box.height);
    const other = page.getByRole("region", { name: "はる", exact: true });
    await expect(other).toBeVisible();
    await expect(other).toHaveAttribute("data-actor-x", "480");
    await expect(profile).toHaveCount(0);
    await page.setViewportSize({ width: 768, height: 1024 });
    const portraitMap = await canvas.boundingBox();
    const portraitSpeech = await other.boundingBox();
    if (!portraitMap || !portraitSpeech) throw new Error("Portrait scene unavailable");
    expect(portraitSpeech.x).toBeGreaterThanOrEqual(portraitMap.x);
    expect(portraitSpeech.y).toBeGreaterThanOrEqual(portraitMap.y);
    expect(portraitSpeech.x + portraitSpeech.width).toBeLessThanOrEqual(
      portraitMap.x + portraitMap.width,
    );
    await page.screenshot({
      path: "output/playwright/tablet-profile-portrait.png",
      fullPage: true,
    });
    // Long public names scroll inside the same bounded bubble; controls stay visible.
    const longName = "長い公開ニックネーム".repeat(8).slice(0, 80);
    await page.route("**/api/link/display", async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      payload.snapshot.eventSeq += 1000;
      payload.snapshot.residents = payload.snapshot.residents.map(
        (resident: { residentId: string; nickname: string }) =>
          resident.residentId === "fixture-haru" ? { ...resident, nickname: longName } : resident,
      );
      await route.fulfill({ response, json: payload });
    });
    const longProfile = page.getByRole("region", { name: longName, exact: true });
    await expect(longProfile).toBeVisible();
    await expect(
      longProfile.getByRole("button", { name: "拡大を閉じる", exact: true }),
    ).toBeVisible();
    expect(
      await longProfile
        .locator(".tablet-speech-content")
        .evaluate((element) => element.scrollHeight > element.clientHeight),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: "output/playwright/tablet-profile-long-name.png",
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(longProfile).toHaveCount(0);
    await page.unroute("**/api/link/display");
    await expect(other).toHaveCount(0);
    await expect(profile).toHaveCount(0);
    await expect(canvas).toHaveCount(1);
  } finally {
    await manager.request.post("/api/link/logout", { data: {}, headers: { origin } });
    await display.request.post("/api/link/logout", { data: {}, headers: { origin } });
    await manager.close();
    await display.close();
  }
});

test("new residents wave at their city position, profiles have priority and removal or disconnection clears focus", async ({
  browser,
  request,
}) => {
  test.setTimeout(90000);
  const origin = "http://127.0.0.1:3000";
  const postHeaders = { origin };
  const { key } = await (
    await request.post("/api/link/bootstrap", { data: {}, headers: postHeaders })
  ).json();
  const manager = await browser.newContext();
  const display = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    reducedMotion: "no-preference",
  });
  const page = await display.newPage();
  const visitors = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const prefix = `入場${Date.now()}`;
  let initial: DeviceAdmin | null = null;
  async function publish(suffix: string) {
    const context = await browser.newContext();
    visitors.push(context);
    const visitor = await context.newPage();
    await visitor.goto("/join");
    await visitor.getByLabel("架空のニックネーム").fill(prefix + suffix);
    await visitor.getByRole("button", { name: "サンプルを準備", exact: true }).click();
    await visitor.getByLabel("アバターをローカル連携画面に表示する").check();
    await visitor.getByLabel("ニックネームを表示する").check();
    await visitor.getByRole("button", { name: "ローカル一覧に追加", exact: true }).click();
    await expect(visitor.getByText("連携用の一覧に追加しました。", { exact: true })).toBeVisible();
    return visitor;
  }
  try {
    await manager.request.post("/api/link/login", { data: { key }, headers: postHeaders });
    initial = await (await manager.request.get("/api/link/admin")).json();
    await manager.request.post("/api/link/control", {
      data: {
        expectedRevision: initial.control.revision,
        displayMode: "LIVE",
        motionEnabled: true,
      },
      headers: postHeaders,
    });
    const pairing = await (
      await manager.request.post("/api/link/pairing", { data: {}, headers: postHeaders })
    ).json();
    await page.goto("/tablet");
    await page.getByLabel("8桁の接続コード").fill(pairing.code);
    await page.getByRole("button", { name: "街に接続", exact: true }).click();
    await expect(page.locator("section.tablet-city")).toHaveAttribute("data-ready", "true", {
      timeout: 30_000,
    });
    await expect(page.locator(".tablet-resident-speech")).toHaveCount(0);
    const first = await publish("あ");
    const welcomeA = page.getByRole("region", { name: `ようこそ、${prefix}あさん！`, exact: true });
    await expect(welcomeA).toBeVisible();
    const portrait = welcomeA;
    await expect(portrait).toHaveAttribute("data-pose", "wave");
    await expect(portrait).toHaveAttribute("data-camera-zoom", "1.4");
    // Welcomed where they stand in the city, not at a staging spot.
    await expect(portrait).toHaveAttribute("data-world-x", /^-?\d+(\.\d+)?$/);
    await expect(portrait).toHaveAttribute("data-world-y", /^-?\d+(\.\d+)?$/);
    // Observe a real frame change in one browser round trip, within the 3-second welcome.
    const changed = await portrait.evaluate(
      (image) =>
        new Promise<boolean>((resolve) => {
          const initialSource = image.getAttribute("data-frame");
          const observer = new MutationObserver(() => {
            if (image.getAttribute("data-frame") !== initialSource) {
              observer.disconnect();
              clearTimeout(timer);
              resolve(true);
            }
          });
          const timer = setTimeout(() => {
            observer.disconnect();
            resolve(false);
          }, 1000);
          observer.observe(image, { attributes: true, attributeFilter: ["data-frame"] });
        }),
    );
    expect(changed).toBe(true);
    await welcomeA
      .getByRole("button", { name: "プロフィールを見る", exact: true })
      .click({ timeout: 5000 });
    const profileA = page.getByRole("region", { name: `${prefix}あ`, exact: true });
    await expect(profileA).toBeVisible();
    await profileA.screenshot({ path: "output/playwright/tablet-live-profile.png" });
    await expect(profileA.getByText("非公開", { exact: true })).toBeVisible();
    await expect(profileA.getByText("非公開・指定なし", { exact: true })).toBeVisible();
    await publish("い");
    await page.waitForTimeout(3300);
    await expect(profileA).toBeVisible();
    const state = await (await manager.request.get("/api/link/admin")).json();
    await manager.request.post("/api/link/control", {
      data: { expectedRevision: state.control.revision, motionEnabled: false },
      headers: postHeaders,
    });
    await expect(profileA).toHaveAttribute("data-animated", "false");
    const stopped = await (await manager.request.get("/api/link/admin")).json();
    await manager.request.post("/api/link/control", {
      data: { expectedRevision: stopped.control.revision, motionEnabled: true },
      headers: postHeaders,
    });
    await expect(profileA).toHaveAttribute("data-animated", "true");
    // Set the preference while reading a persistent card, before the next short welcome.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(profileA).toHaveAttribute("data-animated", "false");
    await profileA.getByRole("button", { name: "拡大を閉じる", exact: true }).click();
    const welcomeB = page.getByRole("region", { name: `ようこそ、${prefix}いさん！`, exact: true });
    await expect(welcomeB).toBeVisible();
    await expect(welcomeB).toHaveAttribute("data-animated", "false");
    const still = await welcomeB.getAttribute("data-frame");
    await page.waitForTimeout(500);
    await expect(welcomeB).toHaveAttribute("data-frame", still ?? "");
    await expect(page.locator(".tablet-resident-speech")).toHaveCount(0, { timeout: 4500 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.reload();
    await expect(page.locator("section.tablet-city")).toHaveAttribute("data-ready", "true", {
      timeout: 30_000,
    });
    await expect(page.locator(".tablet-resident-speech")).toHaveCount(0);
    await page.getByText("住民のプロフィールを選ぶ", { exact: true }).click();
    await page.getByRole("button", { name: `${prefix}あのプロフィール`, exact: true }).click();
    await expect(profileA).toBeVisible();
    const stale = await (await display.request.get("/api/link/display")).json();
    await first.getByRole("button", { name: "一覧から削除", exact: true }).click();
    await expect(profileA).toHaveCount(0);
    const beforeCommand = await (await manager.request.get("/api/link/admin")).json();
    const command = await (
      await manager.request.post("/api/link/control", {
        data: { expectedRevision: beforeCommand.control.revision, motionEnabled: false },
        headers: postHeaders,
      })
    ).json();
    await page.route("**/api/link/display", (route) =>
      route.fulfill({
        headers: { "x-ai-city-test-case": "late-public-snapshot" },
        json: { ...stale, control: command.control },
      }),
    );
    const injected = await page.waitForResponse(
      (response) => response.headers()["x-ai-city-test-case"] === "late-public-snapshot",
    );
    expect((await injected.json()).snapshot.eventSeq).toBe(stale.snapshot.eventSeq);
    // The next poll starts only after the first marked response has been processed.
    await page.waitForResponse(
      (response) => response.headers()["x-ai-city-test-case"] === "late-public-snapshot",
    );
    await expect(
      page.getByRole("button", { name: `${prefix}いのプロフィール`, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: `${prefix}あのプロフィール`, exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".tablet-resident-speech")).toHaveCount(0);
    await page.screenshot({ path: "output/playwright/tablet-stale-snapshot.png", fullPage: true });
    await page.unroute("**/api/link/display");
    await page.getByRole("button", { name: `${prefix}いのプロフィール`, exact: true }).click();
    await expect(page.locator(".tablet-resident-speech")).toBeVisible();
    await publish("う");
    await expect(
      page.getByRole("button", { name: `${prefix}うのプロフィール`, exact: true }),
    ).toBeVisible();
    const beforePause = await (await manager.request.get("/api/link/admin")).json();
    await manager.request.post("/api/link/control", {
      data: { expectedRevision: beforePause.control.revision, displayMode: "MAINTENANCE" },
      headers: postHeaders,
    });
    await expect(
      page.getByRole("heading", { name: "ただいま準備中です", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".tablet-resident-speech")).toHaveCount(0);
    await expect(page.locator("canvas")).toHaveCount(0);
    const beforeResume = await (await manager.request.get("/api/link/admin")).json();
    await manager.request.post("/api/link/control", {
      data: { expectedRevision: beforeResume.control.revision, displayMode: "LIVE" },
      headers: postHeaders,
    });
    await expect(page.locator("section.tablet-city")).toHaveAttribute("data-ready", "true", {
      timeout: 30_000,
    });
    await expect(page.locator(".tablet-resident-speech")).toHaveCount(0);
    await page.getByText("住民のプロフィールを選ぶ", { exact: true }).click();
    await page.getByRole("button", { name: `${prefix}いのプロフィール`, exact: true }).click();
    await expect(page.locator(".tablet-resident-speech")).toBeVisible();
    await page.route("**/api/link/display", (route) => route.abort("internetdisconnected"));
    await expect(page.locator(".tablet-resident-speech")).toHaveCount(0);
    await expect(page.locator("canvas")).toHaveCount(0);
    await page.unroute("**/api/link/display");
    await expect(page.locator("canvas")).toHaveCount(1);
    await expect(page.locator(".tablet-resident-speech")).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    for (const context of visitors) {
      const response = await context.request.get("/api/dev/jobs/current");
      if (response.ok()) {
        const current = await response.json();
        if (current?.job?.jobId)
          await context.request.post(`/api/dev/jobs/${current.job.jobId}/remove`, {
            data: {},
            headers: postHeaders,
          });
      }
      await context.close();
    }
    if (initial) {
      const state = await (await manager.request.get("/api/link/admin")).json();
      await manager.request.post("/api/link/control", {
        data: {
          expectedRevision: state.control.revision,
          displayMode: initial.control.displayMode,
          motionEnabled: initial.control.motionEnabled,
        },
        headers: postHeaders,
      });
    }
    await manager.request.post("/api/link/logout", { data: {}, headers: postHeaders });
    await display.request.post("/api/link/logout", { data: {}, headers: postHeaders });
    await manager.close();
    await display.close();
  }
});
