import { describe, expect, it } from "vitest";
import { LocalParticipationService } from "../development/service";
import { DeviceLinkService } from "../link/service";
import { handlePersistentDeviceRequest } from "./device-http";
import { VisitorService } from "./service";
import { MemoryVisitorStore } from "./test-store";

const base = "https://exhibit.example";
const key = "a".repeat(64);
const input = {
  requestId: "request-1",
  eventId: "fixture-event" as const,
  nickname: "テストそら",
  sampleId: "aoi" as const,
  answers: null,
  scenario: "SUCCESS" as const,
};
const consent = {
  avatarPublicConsent: true as const,
  consentVersion: 2 as const,
  publicationScope: "HOSTED_PREVIEW" as const,
  fields: { nickname: true, personality: true, interests: true },
};

function request(token?: string) {
  return new Request(`${base}/api/link/participant-counter-reset`, {
    method: "POST",
    headers: {
      host: "exhibit.example",
      origin: base,
      "content-type": "application/json",
      ...(token ? { cookie: `ai-city-link=${token}` } : {}),
    },
    body: "{}",
  });
}

describe("participant counter reset", () => {
  it("returns an explicit failure when the persistent visitor store is unavailable", async () => {
    const device = new DeviceLinkService(new LocalParticipationService(), key);
    const admin = device.login(key);
    const response = await handlePersistentDeviceRequest(request(admin), device, null, true, base);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: {
        code: "VISITORS_DISABLED",
        message: expect.stringContaining("永続参加機能"),
      },
    });
  });

  it("requires an administrator, retains residents, and counts later joins from zero", async () => {
    let now = Date.parse("2026-10-18T01:00:00Z");
    const store = new MemoryVisitorStore();
    const visitor = new VisitorService(store, () => now);
    const device = new DeviceLinkService(new LocalParticipationService(), key);
    const admin = device.login(key);

    const invitation = await visitor.createInvitation();
    const first = await visitor.createSession(undefined, invitation.code);
    const firstJob = await visitor.createJob(first.token, input);
    now += 1200;
    const ready = await visitor.getJob(first.token, firstJob.job.jobId);
    const published = await visitor.confirm(first.token, ready.job.jobId, consent);
    const residentId = published.resident?.residentId;
    expect(residentId).toBeDefined();
    expect(await visitor.joinedTotal()).toBe(1);

    const unauthorized = await handlePersistentDeviceRequest(
      request(),
      device,
      visitor,
      true,
      base,
    );
    expect(unauthorized.status).toBe(401);
    expect(await visitor.joinedTotal()).toBe(1);

    const response = await handlePersistentDeviceRequest(
      request(admin),
      device,
      visitor,
      true,
      base,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mode: "MOCK", totalParticipants: 0 });
    expect(await visitor.joinedTotal()).toBe(0);
    expect((await visitor.snapshot()).residents.map((resident) => resident.residentId)).toContain(
      residentId,
    );

    const nextInvitation = await visitor.createInvitation();
    const second = await visitor.createSession(undefined, nextInvitation.code);
    const secondJob = await visitor.createJob(second.token, {
      ...input,
      requestId: "request-2",
    });
    now += 1200;
    const secondReady = await visitor.getJob(second.token, secondJob.job.jobId);
    await visitor.confirm(second.token, secondReady.job.jobId, consent);
    expect(await visitor.joinedTotal()).toBe(1);
    expect((await visitor.snapshot()).residents).toHaveLength(2);
  });
});
