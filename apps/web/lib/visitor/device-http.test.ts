import { describe, expect, it } from "vitest";
import { LocalParticipationService } from "../development/service";
import { DeviceLinkService } from "../link/service";
import { createVisitorBoundary } from "./credentials";
import { handlePersistentDeviceRequest } from "./device-http";
import { handleVisitorRequest } from "./http";
import { VisitorService } from "./service";
import { MemoryVisitorStore } from "./test-store";

const base = "https://exhibit.example";
function request(path: string, token?: string, body?: unknown) {
  return new Request(`${base}/api/link/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      host: "exhibit.example",
      ...(token ? { cookie: `ai-city-link=${token}` } : {}),
      ...(body === undefined ? {} : { origin: base, "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
describe("persistent snapshot device authorization", () => {
  it("returns no focus for an authorized display when visitors are disabled", async () => {
    const device = new DeviceLinkService(new LocalParticipationService(), "a".repeat(64));
    const admin = device.login("a".repeat(64));
    const display = device.pair(device.createPairing(admin).code);
    const result = await handlePersistentDeviceRequest(
      request("focus", display),
      device,
      null,
      true,
      base,
    );
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ mode: "MOCK", focus: null });
    expect(
      (await handlePersistentDeviceRequest(request("focus"), device, null, true, base)).status,
    ).toBe(401);
  });
  it("issues a signed invitation through the actual administrator request path", async () => {
    const visitor = new VisitorService(new MemoryVisitorStore());
    const device = new DeviceLinkService(new LocalParticipationService(), "a".repeat(64));
    const security = createVisitorBoundary("fixture-only-stable-key".repeat(3), "test");
    const response = await handlePersistentDeviceRequest(
      request("visitor-invitation", device.login("a".repeat(64)), {}),
      device,
      visitor,
      true,
      base,
      false,
      security,
    );
    expect(response.status).toBe(200);
    const invitation = await response.json();
    expect(security.readInvitation(invitation.code)).toMatch(/^[a-f0-9]{32}$/);
  });
  it("does not read/write visitor storage for unauthenticated devices or allow DISPLAY removal", async () => {
    const store = new MemoryVisitorStore();
    const visitor = new VisitorService(store);
    const device = new DeviceLinkService(new LocalParticipationService(), "a".repeat(64));
    expect(
      (await handlePersistentDeviceRequest(request("admin"), device, visitor, true, base)).status,
    ).toBe(401);
    expect(store.dump().size).toBe(0);
    const admin = device.login("a".repeat(64));
    const display = device.pair(device.createPairing(admin).code);
    expect(
      (
        await handlePersistentDeviceRequest(
          request("remove", display, { residentId: "resident-other" }),
          device,
          visitor,
          true,
          base,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handlePersistentDeviceRequest(
          request("visitor-invitation", display, {}),
          device,
          visitor,
          true,
          base,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handlePersistentDeviceRequest(
          request("visitor-invitation", undefined, {}),
          device,
          visitor,
          true,
          base,
        )
      ).status,
    ).toBe(401);
    const participant = await visitor.createSession(
      undefined,
      (await visitor.createInvitation()).code,
    );
    expect(
      (
        await handlePersistentDeviceRequest(
          request("remove", participant.token, { residentId: "resident-other" }),
          device,
          visitor,
          true,
          base,
        )
      ).status,
    ).toBe(401);
  });
  it("validates the removal schema before mutating data", async () => {
    const visitor = new VisitorService(new MemoryVisitorStore());
    const device = new DeviceLinkService(new LocalParticipationService(), "a".repeat(64));
    const admin = device.login("a".repeat(64));
    const response = await handlePersistentDeviceRequest(
      request("remove", admin, { residentId: "resident-test", role: "ADMIN" }),
      device,
      visitor,
      true,
      base,
    );
    expect(response.status).toBe(400);
  });
  it("delivers persisted approved fields and makes admin removal durable", async () => {
    let now = Date.now();
    const store = new MemoryVisitorStore();
    const visitor = new VisitorService(store, () => now);
    const device = new DeviceLinkService(new LocalParticipationService(), "a".repeat(64));
    const participant = await visitor.createSession(
      undefined,
      (await visitor.createInvitation()).code,
    );
    const job = await visitor.createJob(participant.token, {
      eventId: "fixture-event",
      requestId: "device-job",
      nickname: "架空",
      sampleId: "sora",
      answers: null,
      scenario: "SUCCESS",
    });
    now += 1200;
    await visitor.getJob(participant.token, job.job.jobId);
    const view = await visitor.confirm(participant.token, job.job.jobId, {
      consentVersion: 2,
      publicationScope: "HOSTED_PREVIEW",
      avatarPublicConsent: true,
      fields: { nickname: true, personality: false, interests: false },
    });
    const admin = device.login("a".repeat(64));
    const display = device.pair(device.createPairing(admin).code);
    device.update(admin, { expectedRevision: 0, displayMode: "LIVE" });
    const security = createVisitorBoundary("fixture-only-stable-key".repeat(3), "focus-test");
    const visitorCookie = security.signSession(participant.token);
    const focusRequest = (body: unknown) =>
      new Request(`${base}/api/visitor/focus`, {
        method: "POST",
        headers: {
          host: "exhibit.example",
          origin: base,
          "content-type": "application/json",
          cookie: `ai-city-visitor=${visitorCookie}`,
        },
        body: JSON.stringify(body),
      });
    expect(
      (
        await handleVisitorRequest(
          focusRequest({ residentId: "other" }),
          visitor,
          true,
          base,
          security,
        )
      ).status,
    ).toBe(400);
    expect(
      (await handleVisitorRequest(focusRequest({}), visitor, true, base, security)).status,
    ).toBe(200);
    expect(
      (await handlePersistentDeviceRequest(request("focus"), device, visitor, true, base)).status,
    ).toBe(401);
    const focused = await handlePersistentDeviceRequest(
      request("focus", display),
      device,
      visitor,
      true,
      base,
    );
    expect((await focused.json()).focus.residentId).toBe(view.resident?.residentId);
    const shown = await handlePersistentDeviceRequest(
      request("display", display),
      device,
      visitor,
      true,
      base,
    );
    expect((await shown.json()).snapshot.residents).toHaveLength(1);
    expect(
      (
        await handlePersistentDeviceRequest(
          request("remove", admin, { residentId: view.resident?.residentId }),
          device,
          visitor,
          true,
          base,
        )
      ).status,
    ).toBe(200);
    expect((await new VisitorService(store, () => now).snapshot()).residents).toHaveLength(0);
    const removed = await handlePersistentDeviceRequest(
      request("focus", display),
      device,
      visitor,
      true,
      base,
    );
    expect((await removed.json()).focus).toBeNull();
    expect(
      (await handleVisitorRequest(focusRequest({}), visitor, true, base, security)).status,
    ).toBe(409);
  });
});

it("keeps presets on the persistent display without writing visitor records", async () => {
  const store = new MemoryVisitorStore();
  const visitor = new VisitorService(store);
  const device = new DeviceLinkService(new LocalParticipationService(), "a".repeat(64));
  const admin = device.login("a".repeat(64));
  const display = device.pair(device.createPairing(admin).code);
  device.update(admin, { expectedRevision: 0, displayMode: "LIVE" });
  const before = await (
    await handlePersistentDeviceRequest(request("display", display), device, visitor, true, base)
  ).json();
  const add = await handlePersistentDeviceRequest(
    request("preset", admin, { expectedRevision: 1, presetId: "aoi", enabled: true }),
    device,
    visitor,
    true,
    base,
  );
  expect(add.status).toBe(200);
  const managed = await add.json();
  expect(managed.presetIds).toEqual(["aoi"]);
  expect(managed.snapshot.residents).toEqual([]);
  const after = await (
    await handlePersistentDeviceRequest(request("display", display), device, visitor, true, base)
  ).json();
  expect(
    after.snapshot.residents.map((resident: { residentId: string }) => resident.residentId),
  ).toEqual(["preset-aoi"]);
  expect(after.snapshot.streamId).toBe(before.snapshot.streamId);
  expect(after.snapshot.eventSeq).toBeGreaterThan(before.snapshot.eventSeq);
  expect((await visitor.snapshot()).residents).toEqual([]);
});
