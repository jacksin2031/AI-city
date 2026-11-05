import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

test("a verified public Spine bundle plays in the tablet and a damaged asset falls back", async ({
  browser,
  request,
}) => {
  test.setTimeout(60000);
  const base = "/avatars/test/v1/";
  const pages = [
    "chibi-stickers.png",
    ...Array.from({ length: 10 }, (_, i) => `chibi-stickers_${i + 2}.png`),
  ];
  const source = join(process.cwd(), "apps/web/public/chibi-demo");
  const assets: Record<string, Buffer> = {
    "skeleton.json": await readFile(join(source, "chibi-stickers.json")),
    "skeleton.atlas": await readFile(join(source, "chibi-stickers.atlas")),
    "orientation-policy.json": Buffer.from(JSON.stringify({ skin: "spineboy", face_slots: [] })),
  };
  for (const page of pages) assets[page] = await readFile(join(source, page));
  const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  const manifest = Buffer.from(
    JSON.stringify({
      skin: "spineboy",
      runtime: { package: "@esotericsoftware/spine-canvas", version: "4.3.13" },
      runtime_guard_required: true,
      files: Object.fromEntries(Object.entries(assets).map(([name, bytes]) => [name, hash(bytes)])),
    }),
  );
  const descriptor = {
    runtime: "4.3",
    skeleton: `${base}skeleton.json`,
    atlas: `${base}skeleton.atlas`,
    pages: pages.map((page) => base + page),
    orientationPolicy: `${base}orientation-policy.json`,
    buildManifest: `${base}build-manifest.json`,
    sha256: hash(manifest),
  };
  const origin = "http://127.0.0.1:3000";
  const { key } = await (
    await request.post("/api/link/bootstrap", { data: {}, headers: { origin } })
  ).json();
  const manager = await browser.newContext();
  const display = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    reducedMotion: "reduce",
  });
  const page = await display.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let corrupt = false;
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
    await page.route("**/api/link/display", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      if (body.snapshot?.avatars?.[0]) {
        body.snapshot.mode = "LOCAL_PRIVATE_TEST";
        body.snapshot.avatars[0].assetStatus = "VERIFIED_SPINE";
        body.snapshot.avatars[0].manifest.spine = descriptor;
        delete body.snapshot.avatars[0].manifest.directions;
      }
      await route.fulfill({ response, json: body });
    });
    await page.route("**/avatars/test/v1/**", async (route) => {
      const name = new URL(route.request().url()).pathname.split("/").at(-1) ?? "";
      const body = name === "build-manifest.json" ? manifest : assets[name];
      if (!body) return route.fulfill({ status: 404 });
      return route.fulfill({
        status: 200,
        body: corrupt && name === pages[0] ? Buffer.from("damaged") : body,
        contentType: name.endsWith(".png") ? "image/png" : "application/octet-stream",
      });
    });
    await page.goto("/tablet");
    await page.getByLabel("8桁の接続コード").fill(pairing.code);
    await page.getByRole("button", { name: "街に接続", exact: true }).click();
    await expect(page.locator(".tablet-city")).toHaveAttribute("data-spine-bundles", "1", {
      timeout: 30000,
    });
    expect(errors).toEqual([]);
    corrupt = true;
    await page.reload();
    await expect(page.locator(".tablet-city")).toHaveAttribute("data-ready", "true", {
      timeout: 30000,
    });
    await expect(page.locator(".tablet-city")).toHaveAttribute("data-spine-bundles", "0");
    expect(errors).toEqual([]);
  } finally {
    await manager.request.post("/api/link/logout", { data: {}, headers: { origin } });
    await display.request.post("/api/link/logout", { data: {}, headers: { origin } });
    await manager.close();
    await display.close();
  }
});
