import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { LocalSpineStorage } from "../spine/local-storage";
import { createVisitorBoundary } from "./credentials";
import { handleVisitorRequest } from "./http";
import { VisitorService } from "./service";
import { MemoryVisitorStore } from "./test-store";

const origin = "http://127.0.0.1:3000";
const security = createVisitorBoundary("test-only-secret".repeat(4), "spine-http-test");
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "ai-city-spine-http-"));
  roots.push(root);
  const storage = await LocalSpineStorage.open(root);
  const service = new VisitorService(new MemoryVisitorStore());
  const { token } = await service.createOpenSession();
  const cookie = `ai-city-visitor=${security.signSession(token)}`;
  const image = await sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  const handle = (request: Request, enabled = true) =>
    handleVisitorRequest(
      request,
      service,
      true,
      undefined,
      security,
      true,
      enabled ? storage : null,
    );
  return { handle, cookie, image, storage };
}
function photo(image: Uint8Array, cookie: string, headers: Record<string, string> = {}) {
  return new Request(`${origin}/api/visitor/spine/jobs`, {
    method: "POST",
    headers: {
      host: "127.0.0.1:3000",
      origin,
      cookie,
      "content-type": "image/png",
      "x-spine-processing-consent": "1",
      "x-spine-publication-consent": "1",
      ...headers,
    },
    body: Uint8Array.from(image),
  });
}
function call(path: string, cookie: string, method: "GET" | "POST" = "GET") {
  return new Request(`${origin}/api/visitor/spine/jobs/${path}`, {
    method,
    headers: {
      host: "127.0.0.1:3000",
      origin,
      cookie,
      ...(method === "POST" ? { "content-type": "application/json" } : {}),
    },
    ...(method === "POST" ? { body: "{}" } : {}),
  });
}

describe("local-only photo HTTP admission", () => {
  it("requires opt-in, a session, consent, an accepted image and request origin", async () => {
    const f = await fixture();
    expect((await f.handle(photo(f.image, f.cookie), false)).status).toBe(404);
    expect((await f.handle(photo(f.image, ""))).status).toBe(401);
    expect(
      (await f.handle(photo(f.image, f.cookie, { "x-spine-publication-consent": "0" }))).status,
    ).toBe(400);
    expect(
      (await f.handle(photo(f.image, f.cookie, { origin: "http://evil.example" }))).status,
    ).toBe(403);
    expect((await f.handle(photo(Buffer.from("bad"), f.cookie))).status).toBe(400);
    expect((await f.handle(photo(f.image, f.cookie, { "content-length": "9000000" }))).status).toBe(
      413,
    );
  });
  it("queues, reads and withdraws only for the same visitor", async () => {
    const f = await fixture();
    const created = await f.handle(photo(f.image, f.cookie));
    expect(created.status).toBe(202);
    const value = await created.json();
    expect(value).toMatchObject({ mode: "LOCAL_PRIVATE_TEST", state: "QUEUED" });
    expect(await (await f.handle(call("current", f.cookie))).json()).toEqual({
      mode: "LOCAL_PRIVATE_TEST",
      job: { task: value.task, state: "QUEUED" },
    });
    expect((await f.handle(call(value.task, f.cookie))).status).toBe(200);
    const other = `ai-city-visitor=${security.signSession("a".repeat(64))}`;
    expect((await f.handle(call(value.task, other))).status).toBe(401);
    const withdrawn = await f.handle(call(`${value.task}/withdraw`, f.cookie, "POST"));
    expect(await withdrawn.json()).toMatchObject({ state: "WITHDRAWN", photoCleanup: "COMPLETE" });
    expect(await f.storage.read(value.task, "photo.png", 1024 * 1024)).toBeNull();
  });
});
