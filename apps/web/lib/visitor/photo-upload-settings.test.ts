import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { LocalParticipationService } from "../development/service";
import { DeviceLinkService } from "../link/service";
import { submitCloudPhoto } from "../spine/cloud-photo-intake";
import { HEARTBEAT_PATH, OFFLINE_AFTER_MS } from "../spine/heartbeat";
import { createVisitorBoundary } from "./credentials";
import { handlePersistentDeviceRequest } from "./device-http";
import { handleVisitorRequest } from "./http";
import { VisitorService } from "./service";
import type { VisitorStore } from "./store";
import { MemoryVisitorStore } from "./test-store";

const origin = "https://exhibit.example";
const security = createVisitorBoundary("test-only-secret".repeat(4), "photo-upload-settings-test");
const SETTINGS = "meta/photo-upload-settings";

async function image() {
  return sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } })
    .png()
    .toBuffer();
}
function cloudFixture() {
  const written = new Map<string, Uint8Array>();
  return {
    written,
    cloud: {
      photos: {
        write: async (task: string, bytes: Uint8Array) => {
          written.set(task, bytes);
          return "5";
        },
        read: async (task: string) => written.get(task) ?? null,
        remove: async (task: string) => {
          written.delete(task);
        },
      },
      assets: { removeTask: async () => {} },
    },
  };
}
const visitorRequest = (path: string, init: RequestInit = {}) =>
  new Request(`${origin}/api/visitor/${path}`, {
    ...init,
    headers: { host: "exhibit.example", origin, ...(init.headers as Record<string, string>) },
  });
const uploadRequest = (bytes: Uint8Array, cookie: string) =>
  visitorRequest("spine/jobs", {
    method: "POST",
    headers: {
      cookie,
      "content-type": "image/png",
      "x-spine-processing-consent": "1",
      "x-spine-model-upload-consent": "1",
      "x-spine-publication-consent": "1",
    },
    body: Uint8Array.from(bytes),
  });
const consent = {
  version: 2 as const,
  processing: true as const,
  externalModelUpload: true as const,
  automaticPublication: true as const,
};

describe("photo upload setting storage", () => {
  it("defaults to ON, persists across a cold start and treats unreadable data as OFF", async () => {
    const store = new MemoryVisitorStore();
    expect(await new VisitorService(store).photoUploadAllowed()).toBe(true);
    await new VisitorService(store).setPhotoUploadAllowed(false);
    // A fresh service instance models a Cloud Run cold start over the same Firestore data.
    expect(await new VisitorService(store).photoUploadAllowed()).toBe(false);
    await new VisitorService(store).setPhotoUploadAllowed(true);
    expect(await new VisitorService(store).photoUploadAllowed()).toBe(true);
    await store.run(async (tx) => tx.set(SETTINGS, { schemaVersion: 1, allowUpload: "yes" }));
    expect(await new VisitorService(store).photoUploadAllowed()).toBe(false);
  });
  it("fails closed when the settings read is unavailable", async () => {
    const broken: VisitorStore = {
      run: async () => {
        throw new Error("firestore down");
      },
      listJobs: async () => [],
    };
    await expect(new VisitorService(broken).photoUploadAllowed()).rejects.toThrow();
  });
});

describe("photo upload worker liveness gate", () => {
  it("closes on missing or stale heartbeat and reopens automatically on a fresh heartbeat", async () => {
    const store = new MemoryVisitorStore();
    const service = new VisitorService(store);
    const now = Date.now();
    expect(await service.photoUploadReady()).toBe(false);
    await store.run(async (tx) =>
      tx.set(HEARTBEAT_PATH, { seenAt: now - OFFLINE_AFTER_MS - 1, running: 0 }),
    );
    expect(await service.photoUploadReady()).toBe(false);
    await store.run(async (tx) => tx.set(HEARTBEAT_PATH, { seenAt: now, running: 0 }));
    expect(await service.photoUploadReady()).toBe(true);
    await service.setPhotoUploadAllowed(false);
    expect(await service.photoUploadReady()).toBe(false);
    await service.setPhotoUploadAllowed(true);
    expect(await service.photoUploadReady()).toBe(true);
  });

  it("refuses a reservation with an expired heartbeat even if the toggle is on", async () => {
    const store = new MemoryVisitorStore();
    const service = new VisitorService(store);
    const { token } = await service.createOpenSession();
    await expect(
      service.reserveCloudPhotoUpload(
        token,
        "spine-00000000-0000-4000-8000-000000000009",
        "a".repeat(64),
        consent,
      ),
    ).rejects.toMatchObject({ code: "PHOTO_UPLOAD_DISABLED", status: 403 });
    expect(store.dump().has("meta/cloud-photo-uploads")).toBe(false);
  });
});

describe("photo upload gate on admission", () => {
  it("rejects a new reservation when OFF, storing nothing, and admits again when ON", async () => {
    const store = new MemoryVisitorStore();
    const service = new VisitorService(store);
    await store.run(async (tx) => tx.set(HEARTBEAT_PATH, { seenAt: Date.now(), running: 0 }));
    const { token } = await service.createOpenSession();
    await service.setPhotoUploadAllowed(false);
    await expect(
      service.reserveCloudPhotoUpload(
        token,
        "spine-00000000-0000-4000-8000-000000000001",
        "a".repeat(64),
        consent,
      ),
    ).rejects.toMatchObject({ code: "PHOTO_UPLOAD_DISABLED", status: 403 });
    expect(store.dump().has("meta/cloud-photo-uploads")).toBe(false);
    await service.setPhotoUploadAllowed(true);
    await expect(
      service.reserveCloudPhotoUpload(
        token,
        "spine-00000000-0000-4000-8000-000000000002",
        "a".repeat(64),
        consent,
      ),
    ).resolves.toMatchObject({ state: "RESERVED" });
  });
  it("closes the race: switching OFF after the HTTP check still stops the photo write", async () => {
    const store = new MemoryVisitorStore();
    const service = new VisitorService(store);
    await store.run(async (tx) => tx.set(HEARTBEAT_PATH, { seenAt: Date.now(), running: 0 }));
    const { token } = await service.createOpenSession();
    const f = cloudFixture();
    // The HTTP pre-check has already passed; the admin flips the switch before the reservation.
    await service.setPhotoUploadAllowed(false);
    await expect(
      submitCloudPhoto(service, f.cloud.photos, token, await image(), consent),
    ).rejects.toMatchObject({ code: "PHOTO_UPLOAD_DISABLED" });
    expect(f.written.size).toBe(0);
  });
  it("never cancels work already admitted when switched OFF mid-flight", async () => {
    const store = new MemoryVisitorStore();
    const service = new VisitorService(store);
    await store.run(async (tx) => tx.set(HEARTBEAT_PATH, { seenAt: Date.now(), running: 0 }));
    const { token } = await service.createOpenSession();
    const f = cloudFixture();
    const bytes = await image();
    const job = await submitCloudPhoto(service, f.cloud.photos, token, bytes, consent);
    expect(job.state).toBe("QUEUED");
    await service.setPhotoUploadAllowed(false);
    expect((await service.spineJobStatus(token, job.task)).state).toBe("QUEUED");
    expect(f.written.has(job.task)).toBe(true);
    // The same participant can still finish: a withdraw is not an admission.
    expect(await service.currentSpineJob(token)).toMatchObject({ task: job.task });
  });
});

describe("visitor HTTP", () => {
  async function fixture() {
    const store = new MemoryVisitorStore();
    const service = new VisitorService(store);
    await store.run(async (tx) => tx.set(HEARTBEAT_PATH, { seenAt: Date.now(), running: 0 }));
    const { token } = await service.createOpenSession();
    const cookie = `ai-city-visitor=${security.signSession(token)}`;
    const f = cloudFixture();
    const handle = (request: Request, cloud = true) =>
      handleVisitorRequest(
        request,
        service,
        true,
        origin,
        security,
        true,
        null,
        cloud ? f.cloud : null,
      );
    return { service, cookie, handle, f, bytes: await image() };
  }
  it("publishes only one boolean, without a session, and never accepts writes", async () => {
    const t = await fixture();
    const on = await t.handle(visitorRequest("photo-upload-settings"));
    expect(on.status).toBe(200);
    expect(on.headers.get("cache-control")).toBe("no-store");
    expect(await on.json()).toEqual({ allowed: true });
    await t.service.setPhotoUploadAllowed(false);
    expect(await (await t.handle(visitorRequest("photo-upload-settings"))).json()).toEqual({
      allowed: false,
    });
    for (const method of ["POST", "PUT", "DELETE"]) {
      const write = await t.handle(
        visitorRequest("photo-upload-settings", {
          method,
          headers: { "content-type": "application/json" },
          body: method === "DELETE" ? undefined : JSON.stringify({ allowed: true }),
        }),
      );
      expect(write.status).toBe(404);
    }
    expect(await t.service.photoUploadAllowed()).toBe(false);
    expect((await t.handle(visitorRequest("photo-upload-settings?x=1"))).status).toBe(400);
  });
  it("is never allowed when the server has no real cloud intake", async () => {
    const t = await fixture();
    expect(await (await t.handle(visitorRequest("photo-upload-settings"), false)).json()).toEqual({
      allowed: false,
    });
  });
  it("fails closed with 503 when the setting cannot be read", async () => {
    const t = await fixture();
    const service = new VisitorService({
      run: async () => {
        throw new Error("firestore down");
      },
      listJobs: async () => [],
    });
    const response = await handleVisitorRequest(
      visitorRequest("photo-upload-settings"),
      service,
      true,
      origin,
      security,
      true,
      null,
      t.f.cloud,
    );
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain('"allowed":true');
  });
  it("rejects spine/jobs with a Japanese 403 when OFF and stores no photo", async () => {
    const t = await fixture();
    await t.service.setPhotoUploadAllowed(false);
    const response = await t.handle(uploadRequest(t.bytes, t.cookie));
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("PHOTO_UPLOAD_DISABLED");
    expect(body.error.message).toContain("写真の受付を停止");
    expect(t.f.written.size).toBe(0);
    expect(await t.service.currentSpineJob((await t.service.createOpenSession()).token)).toBeNull();
  });
  it("still demands consent and a session when OFF, and admits when switched back ON", async () => {
    const t = await fixture();
    await t.service.setPhotoUploadAllowed(false);
    expect((await t.handle(uploadRequest(t.bytes, ""))).status).toBe(401);
    await t.service.setPhotoUploadAllowed(true);
    const accepted = await t.handle(uploadRequest(t.bytes, t.cookie));
    expect(accepted.status).toBe(202);
    expect(t.f.written.size).toBe(1);
  });
  it("leaves a queued job and its status readable after OFF", async () => {
    const t = await fixture();
    const created = (await (await t.handle(uploadRequest(t.bytes, t.cookie))).json()) as {
      task: string;
    };
    await t.service.setPhotoUploadAllowed(false);
    const status = await t.handle(
      visitorRequest(`spine/jobs/${created.task}`, { headers: { cookie: t.cookie } }),
    );
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({ task: created.task, state: "QUEUED" });
    expect(t.f.written.has(created.task)).toBe(true);
  });
});

describe("admin endpoint /api/link/photo-upload-settings", () => {
  async function setup(available = true) {
    const store = new MemoryVisitorStore();
    await store.run(async (tx) => tx.set(HEARTBEAT_PATH, { seenAt: Date.now(), running: 0 }));
    const visitor = new VisitorService(store);
    const device = new DeviceLinkService(new LocalParticipationService(), "c".repeat(64));
    const admin = device.login("c".repeat(64));
    const display = device.pair(device.createPairing(admin).code);
    const call = (path: string, token?: string, body?: unknown, extra: HeadersInit = {}) =>
      handlePersistentDeviceRequest(
        new Request(`${origin}/api/link/${path}`, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            host: "exhibit.example",
            ...(token ? { cookie: `ai-city-link=${token}` } : {}),
            ...(body === undefined ? {} : { origin, "content-type": "application/json" }),
            ...extra,
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
        device,
        visitor,
        true,
        origin,
        false,
        security,
        undefined,
        () => available,
      );
    return { store, visitor, admin, display, call };
  }
  it("denies anonymous, tablet and visitor callers before any read or write", async () => {
    const t = await setup();
    const visitorCookie = `ai-city-visitor=${security.signSession("x".repeat(40))}`;
    for (const body of [undefined, { allowUpload: false }]) {
      expect((await t.call("photo-upload-settings", undefined, body)).status).toBe(401);
      expect((await t.call("photo-upload-settings", t.display, body)).status).toBe(403);
      expect(
        (
          await t.call("photo-upload-settings", undefined, body, {
            cookie: visitorCookie,
          })
        ).status,
      ).toBe(401);
    }
    expect(t.store.dump().size).toBe(1);
    expect(await t.visitor.photoUploadAllowed()).toBe(true);
  });
  it("reads and writes the stored value, reporting the actual state with no-store", async () => {
    const t = await setup();
    const read = await t.call("photo-upload-settings", t.admin);
    expect(read.status).toBe(200);
    expect(read.headers.get("cache-control")).toBe("no-store");
    expect(await read.json()).toEqual({ allowUpload: true, available: true, effective: true });
    const off = await t.call("photo-upload-settings", t.admin, { allowUpload: false });
    expect(await off.json()).toEqual({ allowUpload: false, available: true, effective: false });
    expect(await new VisitorService(t.store).photoUploadAllowed()).toBe(false);
    const on = await t.call("photo-upload-settings", t.admin, { allowUpload: true });
    expect(await on.json()).toEqual({ allowUpload: true, available: true, effective: true });
  });
  it("reports unavailable (never effective) without real cloud intake", async () => {
    const t = await setup(false);
    expect(await (await t.call("photo-upload-settings", t.admin)).json()).toEqual({
      allowUpload: true,
      available: false,
      effective: false,
    });
  });
  it("validates requests strictly and rejects cross-origin writes", async () => {
    const t = await setup();
    for (const bad of [
      {},
      { allowUpload: "false" },
      { allowUpload: 0 },
      { allowUpload: false, extra: 1 },
      [],
      null,
    ])
      expect((await t.call("photo-upload-settings", t.admin, bad)).status).toBe(400);
    expect((await t.call("photo-upload-settings?x=1", t.admin)).status).toBe(400);
    const cross = await t.call(
      "photo-upload-settings",
      t.admin,
      { allowUpload: false },
      { origin: "https://evil.example" },
    );
    expect(cross.status).not.toBe(200);
    expect(await t.visitor.photoUploadAllowed()).toBe(true);
  });
  it("does not leak secrets or internals in its response", async () => {
    const t = await setup();
    const text = await (await t.call("photo-upload-settings", t.admin)).text();
    expect(text).not.toContain(t.admin);
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(["allowUpload", "available", "effective"]);
  });
});
