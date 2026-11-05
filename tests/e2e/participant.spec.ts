import { deflateSync } from "node:zlib";
import { expect, type Page, test } from "@playwright/test";

// Synthetic 16x16 PNG built here: no real person's photo is ever used in tests.
function syntheticPng() {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = (crcTable[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(16, 0);
  header.writeUInt32BE(16, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(16 * 3, 180)]);
  const raw = Buffer.concat(Array.from({ length: 16 }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const pngBuffer = syntheticPng();

async function consent(page: Page, options: { photo?: boolean } = {}) {
  await page.goto("/");
  // The native inputs are visually hidden: tap the visible labels like a participant would.
  await page.getByText("注意事項・免責事項を確認しました").click();
  await page.getByRole("button", { name: "確認しました" }).click();
  if (options.photo) await page.getByText(/写真のAI処理に同意/).click();
  await page.getByText("アバターを街で公開することに同意します").click();
  await page.getByRole("button", { name: "同意して参加する" }).click();
  await expect(page).toHaveURL(/\/join$/);
}

async function enterName(page: Page, name: string) {
  await page.getByRole("textbox", { name: "ニックネーム" }).fill(name);
  await page.getByRole("button", { name: "次へ" }).click();
}

async function answerAll(page: Page, choice: number) {
  for (let i = 1; i <= 6; i++) {
    await expect(page.getByText(`質問 ${i} / 6`)).toBeVisible();
    await page.getByRole("radio").nth(choice).check();
    await page.getByRole("button", { name: i === 6 ? "プレビューへ" : "次へ" }).click();
  }
}

test("joining without consent is refused and points back to the consent page", async ({ page }) => {
  await page.goto("/join");
  await expect(page.getByRole("heading", { name: "最初に同意が必要です" })).toBeVisible();
  const refused = await page.request.post("/api/join", { data: { nickname: "x", answers: null } });
  expect(refused.status()).toBe(401);
  const noConsent = await page.request.post("/api/session", {
    data: { terms: true, public: false },
  });
  expect(noConsent.status()).toBe(400);
});

test("photo upload requires photo consent and rejects non-images", async ({ page }) => {
  await consent(page);
  const denied = await page.request.post("/api/photo", {
    multipart: { photo: { name: "a.png", mimeType: "image/png", buffer: pngBuffer } },
  });
  expect(denied.status()).toBe(403);
  await page.context().clearCookies();
  await consent(page, { photo: true });
  const bad = await page.request.post("/api/photo", {
    multipart: {
      photo: { name: "a.png", mimeType: "image/png", buffer: Buffer.from("not an image") },
    },
  });
  expect(bad.status()).toBe(415);
});

test("full flow: consent, photo, questionnaire, character, tablet and conversation", async ({
  page,
  browser,
}) => {
  await consent(page, { photo: true });
  await enterName(page, "さくら 🌸");
  await page.locator('input[type="file"]').setInputFiles({
    name: "synthetic.png",
    mimeType: "image/png",
    buffer: pngBuffer,
  });
  await expect(page.getByText("写真を受け取りました。")).toBeVisible();
  await page.getByRole("button", { name: "次へ" }).click();
  await answerAll(page, 0);
  await expect(page.getByRole("status")).toContainText("キャラクターを作っています");
  await expect(page.getByRole("heading", { name: /ようこそ、さくら 🌸さん/ })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("AIスタイル：ひらめき探検家")).toBeVisible();
  const avatar = page.getByRole("img", { name: "さくら 🌸のキャラクター" });
  await expect(avatar).toBeVisible();
  expect(await avatar.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  // A second participant, so the tablet has two residents to converse.
  const other = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const otherPage = await other.newPage();
  await consent(otherPage);
  await enterName(otherPage, "ひろ");
  await otherPage.getByRole("button", { name: "色とマークを指定する" }).click();
  await otherPage.getByRole("button", { name: "このキャラクターで進む" }).click();
  await otherPage.getByRole("button", { name: "質問をスキップ" }).click();
  await expect(otherPage.getByRole("heading", { name: /ようこそ、ひろさん/ })).toBeVisible({
    timeout: 20_000,
  });
  await other.close();

  const tablet = await browser.newPage({ baseURL: test.info().project.use.baseURL });
  await tablet.goto("/city");
  await expect(tablet.getByRole("status")).toContainText(/住民 [2-9]/, { timeout: 15_000 });
  await expect(tablet.locator("section.city canvas")).toHaveCount(1);
  const listed = await tablet.request.get("/api/city/residents");
  const { residents } = (await listed.json()) as {
    residents: { residentId: string; nickname: string }[];
  };
  expect(residents.map((r) => r.nickname)).toEqual(expect.arrayContaining(["さくら 🌸", "ひろ"]));
  for (const resident of residents)
    expect(Object.keys(resident).sort()).toEqual([
      "avatarSource",
      "avatarUrl",
      "interests",
      "nickname",
      "personalityLabel",
      "residentId",
    ]);
  const pair = residents.slice(0, 2);
  const talk = await tablet.request.get(
    `/api/city/conversation?a=${pair[0]?.residentId}&b=${pair[1]?.residentId}`,
  );
  const conversation = (await talk.json()) as { lines: unknown[]; source: string };
  expect(conversation.lines.length).toBeGreaterThanOrEqual(2);
  expect(["gemini", "fallback"]).toContain(conversation.source);
  await expect(tablet.getByRole("status")).toContainText(/会話は/, { timeout: 25_000 });
  await tablet.close();
});

test("questionnaire answers produce the expected entertainment style", async ({ page }) => {
  await consent(page);
  await enterName(page, "テスト");
  await page.getByRole("button", { name: "色とマークを指定する" }).click();
  await page.getByRole("button", { name: "このキャラクターで進む" }).click();
  await answerAll(page, 1);
  await expect(page.getByText("AIスタイル：しっかりサポーター")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("img", { name: /^性格六角形：挑戦/ })).toBeVisible();
});

test("blank nicknames cannot continue; custom colour and mark persist when going back", async ({
  page,
}) => {
  await consent(page);
  const nickname = page.getByRole("textbox", { name: "ニックネーム" });
  await nickname.fill("   ");
  await expect(page.getByRole("button", { name: "次へ" })).toBeDisabled();
  await nickname.fill("さくら");
  await page.getByRole("button", { name: "次へ" }).click();
  await page.getByRole("button", { name: "色とマークを指定する" }).click();
  await page.getByRole("radio", { name: "むらさき" }).check();
  await page.getByRole("radio", { name: "星" }).check();
  await page.getByRole("button", { name: "このキャラクターで進む" }).click();
  await page.getByRole("button", { name: "戻る" }).click();
  await expect(page.getByRole("radio", { name: "むらさき" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "星" })).toBeChecked();
});

test("the final screen fits a phone viewport and the card can be saved as a PNG", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await consent(page);
  await enterName(page, "さくら 🌸");
  await page.getByRole("button", { name: "色とマークを指定する" }).click();
  await page.getByRole("button", { name: "このキャラクターで進む" }).click();
  await page.getByRole("button", { name: "質問をスキップ" }).click();
  await expect(page.getByRole("heading", { name: /ようこそ/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("region", { name: "あなたのカード" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "カードを画像で保存" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("ai-city-card.png");
});

test("a participant can withdraw: the resident and avatar disappear from the city", async ({
  page,
}) => {
  await consent(page);
  await enterName(page, "とりさげ");
  await page.getByRole("button", { name: "色とマークを指定する" }).click();
  await page.getByRole("button", { name: "このキャラクターで進む" }).click();
  await page.getByRole("button", { name: "質問をスキップ" }).click();
  await expect(page.getByRole("heading", { name: /ようこそ、とりさげさん/ })).toBeVisible({
    timeout: 20_000,
  });
  const before = (await (await page.request.get("/api/city/residents")).json()) as {
    residents: { nickname: string; avatarUrl: string }[];
  };
  const mine = before.residents.find((r) => r.nickname === "とりさげ");
  expect(mine).toBeTruthy();
  expect((await page.request.get(mine?.avatarUrl ?? "")).status()).toBe(200);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "キャラクターを非公開にして削除する" }).click();
  await expect(page).toHaveURL(/\/$/);
  const after = (await (await page.request.get("/api/city/residents")).json()) as {
    residents: { nickname: string }[];
  };
  expect(after.residents.map((r) => r.nickname)).not.toContain("とりさげ");
  expect((await page.request.get(mine?.avatarUrl ?? "")).status()).toBe(404);
});
