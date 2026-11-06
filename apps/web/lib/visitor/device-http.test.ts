import { describe, expect, it } from "vitest";
import { LocalParticipationService } from "../development/service";
import { DeviceLinkService } from "../link/service";
import { makeCloudSpineJob } from "../spine/jobs";
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
      sampleId: "aoi",
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
    const reliableId = "55555555-5555-4555-8555-555555555555";
    await visitor.requestFocus(participant.token, reliableId);
    expect(
      (await handlePersistentDeviceRequest(request("focus-next"), device, visitor, true, base))
        .status,
    ).toBe(401);
    const nextFocus = await handlePersistentDeviceRequest(
      request("focus-next", display),
      device,
      visitor,
      true,
      base,
    );
    expect((await nextFocus.json()).focus).toEqual({
      requestId: reliableId,
      residentId: view.resident?.residentId,
    });
    expect(
      (
        await handlePersistentDeviceRequest(
          request("focus-ack", display, { requestId: reliableId, residentId: "other" }),
          device,
          visitor,
          true,
          base,
        )
      ).status,
    ).toBe(400);
    const ack = await handlePersistentDeviceRequest(
      request("focus-ack", display, { requestId: reliableId }),
      device,
      visitor,
      true,
      base,
    );
    expect((await ack.json()).status).toBe("APPLIED");
    expect((await visitor.focusStatus(participant.token, reliableId)).status).toBe("APPLIED");
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
    const replacement = device.pair(device.createPairing(admin).code);
    const reconnected = await handlePersistentDeviceRequest(
      request("display", replacement),
      device,
      visitor,
      true,
      base,
    );
    const reconnectedState = await reconnected.json();
    expect(
      reconnectedState.snapshot.residents.map(
        (resident: { residentId: string }) => resident.residentId,
      ),
    ).toContain(view.resident?.residentId);
    expect(reconnectedState.totalParticipants).toBe(1);
    // Recreating the process-local device controller simulates a service restart.
    // The persisted visitor data survives and is displayed after pairing again.
    const restarted = new DeviceLinkService(new LocalParticipationService(), "a".repeat(64));
    const restartedAdmin = restarted.login("a".repeat(64));
    const restartedDisplay = restarted.pair(restarted.createPairing(restartedAdmin).code);
    const afterRestart = await (
      await handlePersistentDeviceRequest(
        request("display", restartedDisplay),
        restarted,
        visitor,
        true,
        base,
      )
    ).json();
    expect(afterRestart.control.displayMode).toBe("LIVE");
    expect(
      afterRestart.snapshot.residents.map(
        (resident: { residentId: string }) => resident.residentId,
      ),
    ).toContain(view.resident?.residentId);
    expect(afterRestart.totalParticipants).toBe(1);
    expect(
      (
        await handlePersistentDeviceRequest(
          request("display", display),
          device,
          visitor,
          true,
          base,
        )
      ).status,
    ).toBe(401);
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
      request("focus", replacement),
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

describe("spine admin route", () => {
  const owner = "a".repeat(64);
  const uuid = (n: number) => `${n.toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`;
  const live = {
    processing: true,
    externalModelUpload: true,
    automaticPublication: true,
    version: 2,
    recordedAt: "2026-11-05T00:00:00.000Z",
  } as const;
  const bundle = {
    runtime: "4.3" as const,
    skeleton: "/avatars/person/v1/skeleton.json",
    atlas: "/avatars/person/v1/skeleton.atlas",
    pages: ["/avatars/person/v1/page.png"],
    orientationPolicy: "/avatars/person/v1/orientation-policy.json",
    buildManifest: "/avatars/person/v1/build-manifest.json",
    sha256: "e".repeat(64),
  };
  const adjustment = { version: 1, parts: { hair: { dx: 0.1, dy: 0, scale: 1.2 } } };
  const failed = `spine-${uuid(0xa1)}`;
  const queued = `spine-${uuid(0xa2)}`;
  const published = `spine-${uuid(0xa3)}`;
  const missing = `spine-${uuid(0xff)}`;
  const adj = (parts: unknown) => ({
    action: "adjust",
    task: published,
    adjustment: { version: 1, parts },
  });

  async function setup() {
    const store = new MemoryVisitorStore();
    const visitor = new VisitorService(store, () => 5_000);
    const device = new DeviceLinkService(new LocalParticipationService(), "a".repeat(64));
    const admin = device.login("a".repeat(64));
    const display = device.pair(device.createPairing(admin).code);
    const job = makeCloudSpineJob(owner, "c".repeat(64), live, 99_999_999, "5", 1_000);
    await store.run(async (tx) => {
      tx.set(`jobs/spine-${failed}`, { ...job, state: "FAILED", worker: "w1" });
      tx.set(`jobs/spine-${queued}`, job);
      tx.set(`jobs/spine-${published}`, { ...job, state: "PUBLISHED", worker: "w1", bundle });
    });
    let photo: "present" | "gone" | "unavailable" = "present";
    const photos = {
      exists: async () => {
        if (photo === "unavailable") throw new Error("CLOUD_PHOTO_UNAVAILABLE");
        return photo === "present";
      },
    };
    const call = (req: Request) =>
      handlePersistentDeviceRequest(req, device, visitor, true, base, false, null, () => photos);
    const post = async (body: unknown, token = admin) => {
      const response = await call(request("spine-admin", token, body));
      return { response, json: (await response.json()) as Record<string, any> };
    };
    const log = async () =>
      (await store.run((tx) => tx.get("meta/spine-repair-log")))?.entries as
        | Record<string, unknown>[]
        | undefined;
    return {
      store,
      admin,
      display,
      call,
      post,
      log,
      setPhoto: (value: typeof photo) => {
        photo = value;
      },
    };
  }

  it("rejects missing, DISPLAY, cross-origin and query-string requests without touching data", async () => {
    const t = await setup();
    const before = JSON.stringify([...t.store.dump()]);
    expect((await t.call(request("spine-admin"))).status).toBe(401);
    expect((await t.call(request("spine-admin", t.display))).status).toBe(403);
    expect(
      (await t.call(request("spine-admin", t.display, { action: "cancel", task: failed }))).status,
    ).toBe(403);
    const cross = new Request(`${base}/api/link/spine-admin`, {
      method: "POST",
      headers: {
        host: "exhibit.example",
        origin: "https://evil.example",
        cookie: `ai-city-link=${t.admin}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "cancel", task: failed }),
    });
    expect((await t.call(cross)).status).toBe(403);
    expect((await t.call(request("spine-admin?x=1", t.admin))).status).toBe(400);
    expect(JSON.stringify([...t.store.dump()])).toBe(before);
  });

  it("returns 503 VISITORS_DISABLED when visitor storage is off", async () => {
    const device = new DeviceLinkService(new LocalParticipationService(), "a".repeat(64));
    const admin = device.login("a".repeat(64));
    for (const body of [undefined, { action: "cancel", task: failed }]) {
      const response = await handlePersistentDeviceRequest(
        request("spine-admin", admin, body),
        device,
        null,
        true,
        base,
      );
      expect(response.status).toBe(503);
      expect((await response.json()).error.code).toBe("VISITORS_DISABLED");
    }
  });

  it("GET returns the view with no private field, path or photo string", async () => {
    const t = await setup();
    const response = await t.call(request("spine-admin", t.admin));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = JSON.stringify(await response.json());
    for (const forbidden of [
      "owner",
      "photoSha256",
      "photoGeneration",
      "consent",
      "photo",
      "gs://",
    ])
      expect(text).not.toContain(forbidden);
    expect(text).toContain(failed);
  });

  it("validates input: confirmCost, unknown preset, adjustment range, NaN and unknown part", async () => {
    const t = await setup();
    const before = JSON.stringify([...t.store.dump()]);
    const bad = [
      { action: "requeue", task: failed },
      { action: "requeue", task: failed, confirmCost: false },
      { action: "preset", task: failed, presetId: "nobody" },
      { action: "preset", task: failed, presetId: "__proto__" },
      adj({ hair: { dx: 0.5, dy: 0, scale: 1 } }),
      adj({ hair: { dx: 0, dy: 0, scale: 9 } }),
      adj({ wings: { dx: 0, dy: 0, scale: 1 } }),
      adj({ hair: { dx: null, dy: 0, scale: 1 } }),
      { action: "nope", task: failed },
      { action: "cancel", task: "spine-nope" },
    ];
    for (const body of bad) {
      const { response, json } = await t.post(body);
      expect(response.status).toBe(400);
      expect(json.error.code).toBe("INVALID_REQUEST");
    }
    expect(JSON.stringify([...t.store.dump()])).toBe(before);
  });

  it("applies each successful action with exactly one repair entry of {at, action, code}", async () => {
    const t = await setup();
    let result = await t.post({ action: "requeue", task: failed, confirmCost: true });
    expect(result.response.status).toBe(200);
    expect(result.json.repairs).toEqual([
      { at: "1970-01-01T00:00:05.000Z", action: "requeue", code: "000000a1" },
    ]);
    result = await t.post({ action: "adjust", task: published, adjustment });
    expect(result.response.status).toBe(200);
    expect(result.json.tasks.find((x: any) => x.task === published).preview.adjustment).toEqual(
      adjustment,
    );
    result = await t.post({ action: "resetAdjust", task: published });
    expect(result.json.tasks.find((x: any) => x.task === published).preview.adjustment).toBeNull();
    result = await t.post({ action: "cancel", task: queued });
    expect(result.response.status).toBe(200);
    expect(result.json.repairs.map((r: any) => r.action)).toEqual([
      "requeue",
      "adjust",
      "resetAdjust",
      "cancel",
    ]);
    for (const entry of result.json.repairs)
      expect(Object.keys(entry).sort()).toEqual(["action", "at", "code"]);
    expect(await t.log()).toHaveLength(4);
  });

  it("writes the preset repair entry together with the replacement", async () => {
    const t = await setup();
    await t.store.run(async (tx) => {
      tx.set(`sessions/${owner}`, {
        expiresAt: 99_999_999,
        currentJob: null,
        jobsCreated: 0,
        requestTombstones: [],
      });
      tx.set("meta/state", {
        schemaVersion: 1,
        streamId: "stream-1",
        eventSeq: 4,
        joinedTotal: 1,
        activeSessions: { [owner]: 99_999_999 },
        pendingSessions: {},
        invitations: {},
        residents: [],
        spineResidents: [{ task: failed, owner, expiresAt: 99_999_999 }],
      });
    });
    const { response, json } = await t.post({ action: "preset", task: failed, presetId: "aoi" });
    expect(response.status).toBe(200);
    expect(json.repairs).toEqual([
      { at: "1970-01-01T00:00:05.000Z", action: "preset", code: "000000a1" },
    ]);
  });

  it("maps failures to safe Japanese responses and writes no repair entry", async () => {
    const t = await setup();
    const expectFail = async (body: unknown, status: number, code: string) => {
      const { response, json } = await t.post(body);
      expect(response.status).toBe(status);
      expect(json.error.code).toBe(code);
      expect(json.error.message).toMatch(/[぀-ヿ]/);
      expect(JSON.stringify(json.error.message)).not.toMatch(/spine-|Error|Zod/);
    };
    await expectFail({ action: "adjust", task: failed, adjustment }, 409, "INVALID_TRANSITION");
    await expectFail({ action: "adjust", task: missing, adjustment }, 404, "JOB_NOT_FOUND");
    await expectFail({ action: "resetAdjust", task: missing }, 404, "JOB_NOT_FOUND");
    await expectFail({ action: "cancel", task: missing }, 404, "JOB_NOT_FOUND");
    t.setPhoto("gone");
    await expectFail({ action: "requeue", task: failed, confirmCost: true }, 409, "PHOTO_GONE");
    t.setPhoto("unavailable");
    await expectFail(
      { action: "requeue", task: failed, confirmCost: true },
      503,
      "CLOUD_PHOTO_UNAVAILABLE",
    );
    t.setPhoto("present");
    await expectFail(
      { action: "requeue", task: queued, confirmCost: true },
      409,
      "INVALID_TRANSITION",
    );
    expect((await t.post({ action: "cancel", task: queued })).response.status).toBe(200);
    await expectFail({ action: "cancel", task: queued }, 409, "INVALID_TRANSITION");
    expect(await t.log()).toHaveLength(1);
  });

  it("keeps only the newest 50 repair entries", async () => {
    const t = await setup();
    const seeded = Array.from({ length: 50 }, (_, i) => ({
      at: new Date(i * 1000).toISOString(),
      action: "cancel",
      code: (i + 16).toString(16).padStart(8, "0"),
    }));
    await t.store.run(async (tx) => tx.set("meta/spine-repair-log", { entries: seeded }));
    expect((await t.post({ action: "resetAdjust", task: published })).response.status).toBe(200);
    const entries = (await t.log()) ?? [];
    expect(entries).toHaveLength(50);
    expect(entries[0]).toEqual(seeded[1]);
    expect(entries[49]).toMatchObject({ action: "resetAdjust", code: "000000a3" });
  });

  it("resolves the photo dependency lazily: a throwing getter only affects requeue", async () => {
    const t = await setup();
    let calls = 0;
    const getter = () => {
      calls++;
      throw new Error("SPINE_CLOUD_INTAKE_CONFIG");
    };
    const device = new DeviceLinkService(new LocalParticipationService(), "a".repeat(64));
    const admin = device.login("a".repeat(64));
    const visitor = new VisitorService(t.store, () => 5_000);
    const run = (req: Request) =>
      handlePersistentDeviceRequest(req, device, visitor, true, base, false, null, getter);
    const display = device.pair(device.createPairing(admin).code);
    expect((await run(request("display", display))).status).toBe(200);
    expect((await run(request("admin", admin))).status).toBe(200);
    expect((await run(request("pairing", admin, {}))).status).toBe(200);
    expect((await run(request("spine-admin", admin))).status).toBe(200);
    expect(
      (await run(request("spine-admin", admin, { action: "cancel", task: queued }))).status,
    ).toBe(200);
    expect(calls).toBe(0);
    const before = JSON.stringify([...t.store.dump()]);
    const response = await run(
      request("spine-admin", admin, { action: "requeue", task: failed, confirmCost: true }),
    );
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("CLOUD_PHOTO_UNAVAILABLE");
    expect(calls).toBe(1);
    expect(JSON.stringify([...t.store.dump()])).toBe(before);
  });
});
