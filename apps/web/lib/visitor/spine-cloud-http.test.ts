import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { createVisitorBoundary } from "./credentials";
import { handleVisitorRequest } from "./http";
import { VisitorService } from "./service";
import { MemoryVisitorStore } from "./test-store";

const origin = "http://127.0.0.1:3000";
const security = createVisitorBoundary("test-only-secret".repeat(4), "spine-cloud-http-test");

async function fixture() {
  const service = new VisitorService(new MemoryVisitorStore());
  const { token } = await service.createOpenSession();
  const cookie = `ai-city-visitor=${security.signSession(token)}`;
  const image = await sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  const photos = new Map<string, Uint8Array>();
  const removed: string[] = [];
  const cloud = {
    photos: {
      write: async (task: string, bytes: Uint8Array) => {
        photos.set(task, bytes);
        return "5";
      },
      read: async (task: string) => photos.get(task) ?? null,
      remove: async (task: string) => {
        photos.delete(task);
        removed.push(task);
      },
    },
    assets: { removeTask: async () => {} },
  };
  const handle = (request: Request, withCloud = true) =>
    handleVisitorRequest(
      request,
      service,
      true,
      undefined,
      security,
      true,
      null,
      withCloud ? cloud : null,
    );
  return { handle, cookie, image, photos, removed };
}
const upload = (image: Uint8Array, cookie: string, consent = "1") =>
  new Request(`${origin}/api/visitor/spine/jobs`, {
    method: "POST",
    headers: {
      host: "127.0.0.1:3000",
      origin,
      cookie,
      "content-type": "image/png",
      "x-spine-processing-consent": "1",
      "x-spine-model-upload-consent": consent,
      "x-spine-publication-consent": "1",
    },
    body: Uint8Array.from(image),
  });
const post = (path: string, cookie: string) =>
  new Request(`${origin}/api/visitor/spine/jobs/${path}`, {
    method: "POST",
    headers: {
      host: "127.0.0.1:3000",
      origin,
      cookie,
      "content-type": "application/json",
    },
    body: "{}",
  });

describe("hosted photo intake over HTTP", () => {
  it("is unavailable unless the cloud adapter is configured", async () => {
    const f = await fixture();
    expect((await f.handle(upload(f.image, f.cookie), false)).status).toBe(404);
    expect(f.photos.size).toBe(0);
  });
  it("needs all consents and a session before anything reaches the bucket", async () => {
    const f = await fixture();
    expect((await f.handle(upload(f.image, f.cookie, "0"))).status).toBe(400);
    expect((await f.handle(upload(f.image, ""))).status).toBe(401);
    expect(f.photos.size).toBe(0);
  });
  it("stores a normalized photo privately, queues one job and refuses a second", async () => {
    const f = await fixture();
    const created = await f.handle(upload(f.image, f.cookie));
    expect(created.status).toBe(202);
    const body = (await created.json()) as { task: string; state: string };
    expect(body.state).toBe("QUEUED");
    expect(f.photos.has(body.task)).toBe(true);
    expect((await f.handle(upload(f.image, f.cookie))).status).toBe(409);
    expect(JSON.stringify(body)).not.toContain("photo");
  });
  it("withdraws a queued job and removes the cloud photo", async () => {
    const f = await fixture();
    const body = (await (await f.handle(upload(f.image, f.cookie))).json()) as { task: string };
    const result = await f.handle(post(`${body.task}/withdraw`, f.cookie));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ state: "WITHDRAWN" });
    expect(f.photos.has(body.task)).toBe(false);
    expect(f.removed).toContain(body.task);
  });
});
