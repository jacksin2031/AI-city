import { createHash } from "node:crypto";
import { CitySnapshotSchema } from "@ai-city/contracts/development";
import { beforeEach, describe, expect, it } from "vitest";
import { VisitorService } from "./service";
import type { StoredDocument, VisitorStore, VisitorTransaction } from "./store";
import { MemoryVisitorStore } from "./test-store";

class RecordingVisitorStore implements VisitorStore {
  readonly writes: string[] = [];

  constructor(
    private readonly inner: VisitorStore,
    private readonly rejectPath?: string,
  ) {}

  listJobs(limit: number) {
    return this.inner.listJobs(limit);
  }

  run<T>(action: (tx: VisitorTransaction) => Promise<T>): Promise<T> {
    return this.inner.run((tx) =>
      action({
        get: (path) => tx.get(path),
        set: (path, value: StoredDocument) => {
          this.writes.push(`set:${path}`);
          if (path === this.rejectPath) throw new Error(`unexpected write: ${path}`);
          tx.set(path, value);
        },
        delete: (path) => {
          this.writes.push(`delete:${path}`);
          if (path === this.rejectPath) throw new Error(`unexpected write: ${path}`);
          tx.delete(path);
        },
      }),
    );
  }
}

describe("persistent anonymous visitors", () => {
  let now: number;
  let store: MemoryVisitorStore;
  let service: VisitorService;
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

  beforeEach(() => {
    now = Date.parse("2026-10-18T01:00:00Z");
    store = new MemoryVisitorStore();
    service = new VisitorService(store, () => now);
  });

  async function ready(token: string, request = input, subject = service) {
    const created = await subject.createJob(token, request);
    now += 1200;
    return subject.getJob(token, created.job.jobId);
  }

  async function newSession(subject = service) {
    const invitation = await subject.createInvitation();
    return subject.createSession(undefined, invitation.code);
  }

  async function failure(action: Promise<unknown>, code: string, status: number) {
    await expect(action).rejects.toMatchObject({ code, status });
  }

  it("links an entertainment style to the character only when personality is published", async () => {
    const session = await newSession();
    const job = await ready(session.token, {
      ...input,
      aiStyle: "INSPIRED_EXPLORER",
    } as typeof input);
    expect(job.preview?.personalityLabel).toBe("ひらめき探検家");
    await service.confirm(session.token, job.job.jobId, {
      ...consent,
      fields: { ...consent.fields, personality: false },
    });
    expect((await service.snapshot()).residents[0]?.personalityLabel).toBe("非公開");
    const serialized = JSON.stringify(await service.snapshot());
    expect(serialized).not.toContain("INSPIRED_EXPLORER");
    expect(serialized).not.toContain("answers");

    const another = await newSession();
    const published = await ready(another.token, {
      ...input,
      requestId: "request-2",
      aiStyle: "INSPIRED_EXPLORER",
    } as typeof input);
    await service.confirm(another.token, published.job.jobId, consent);
    expect(
      (await service.snapshot()).residents.some(
        (resident) => resident.personalityLabel === "ひらめき探検家",
      ),
    ).toBe(true);
  });

  it("stages transaction writes, reads its own writes, and discards them on callback failure", async () => {
    await store.run(async (tx) => {
      tx.set("meta/state", { seq: 1 });
      expect(await tx.get("meta/state")).toEqual({ seq: 1 });
    });
    await expect(
      store.run(async (tx) => {
        tx.set("meta/state", { seq: 2 });
        tx.delete("sessions/deleted");
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await store.run((tx) => tx.get("meta/state"))).toEqual({ seq: 1 });
    expect(await store.run((tx) => tx.get("sessions/deleted"))).toBeNull();
  });

  it("persists the stream ID of an empty snapshot across service restarts", async () => {
    const first = await service.snapshot();
    const restarted = new VisitorService(store, () => now);
    expect((await restarted.snapshot()).streamId).toBe(first.streamId);
  });

  it("reads legacy state documents without an invitations field", async () => {
    await store.run(async (tx) => {
      tx.set("meta/state", {
        schemaVersion: 1,
        streamId: "legacy-stream",
        eventSeq: 0,
        activeSessions: {},
        residents: [],
      });
    });

    const invitation = await service.createInvitation();
    expect(invitation.code).toMatch(/^[a-f0-9]{32}$/);
    expect((await service.snapshot()).streamId).toBe("legacy-stream");
    expect(store.dump().get("meta/state")?.invitations).toMatchObject({
      [createHash("sha256").update(invitation.code).digest("hex")]: invitation.expiresAt,
    });
    expect(store.dump().get("meta/state")?.pendingSessions).toEqual({});
  });

  it("issues opaque 256-bit tokens, stores only SHA-256 digests, and reuses a live session", async () => {
    const invitation = await service.createInvitation();
    const created = await service.createSession(undefined, invitation.code);
    expect(created.token).toMatch(/^[a-f0-9]{64}$/);
    expect(created.expiresAt).toBe(now + 24 * 60 * 60 * 1000);

    const before = store.dump();
    const digest = createHash("sha256").update(created.token).digest("hex");
    expect(before.has(`sessions/${digest}`)).toBe(true);
    expect(JSON.stringify([...before])).not.toContain(created.token);
    expect(JSON.stringify([...before])).not.toContain(invitation.code);
    expect(JSON.stringify([...before])).not.toContain("token");

    const repeated = await service.createSession(created.token);
    expect(repeated).toEqual(created);
    expect(store.dump().size).toBe(before.size);
    const activeState = store.dump().get("meta/state");
    if (!activeState) throw new Error("Expected visitor metadata after reuse");
    expect((activeState.pendingSessions as Record<string, number>)[digest]).toBeUndefined();
  });

  it("recovers an owned job and public snapshot after a service restart", async () => {
    const session = await newSession();
    const job = await ready(session.token);
    const published = await service.confirm(session.token, job.job.jobId, consent);
    const restarted = new VisitorService(store, () => now);

    expect((await restarted.getJob(session.token, job.job.jobId)).job.state).toBe("READY");
    expect(await restarted.current(session.token)).toMatchObject({
      job: { jobId: job.job.jobId, state: "READY" },
      resident: { residentId: published.resident?.residentId },
    });
    const snapshot = await restarted.snapshot();
    expect(CitySnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(snapshot.residents).toHaveLength(1);
    expect(JSON.stringify(snapshot)).not.toContain(session.token);
    expect(JSON.stringify(snapshot)).not.toContain("answers");
    expect(JSON.stringify(snapshot)).not.toContain("ownerDigest");
    expect(snapshot.residents[0]?.nickname).toBe("テストそら");
  });

  it("isolates every job operation to the owning visitor", async () => {
    const owner = await newSession();
    const other = await newSession();
    const job = await service.createJob(owner.token, input);

    await failure(service.getJob(other.token, job.job.jobId), "JOB_NOT_FOUND", 404);
    await failure(service.cancel(other.token, job.job.jobId), "JOB_NOT_FOUND", 404);
    await failure(service.retry(other.token, job.job.jobId), "JOB_NOT_FOUND", 404);
    await failure(service.remove(other.token, job.job.jobId), "JOB_NOT_FOUND", 404);
    await failure(service.confirm(other.token, job.job.jobId, consent), "JOB_NOT_FOUND", 404);
  });

  it("rejects malformed tokens and keeps questionnaire data out of the public snapshot", async () => {
    await failure(service.current("forged"), "SESSION_REQUIRED", 401);
    const session = await newSession();
    const job = await ready(session.token);
    await service.confirm(session.token, job.job.jobId, {
      ...consent,
      fields: { nickname: false, personality: false, interests: false },
    });

    const snapshot = await service.snapshot();
    expect(snapshot.residents[0]).toMatchObject({
      nickname: "ゲスト",
      personalityLabel: "非公開",
      interests: [],
    });
    expect(JSON.stringify(snapshot)).not.toContain(session.token);
    expect(JSON.stringify(snapshot)).not.toContain("answers");
    expect(JSON.stringify(snapshot)).not.toContain("テストそら");
  });

  it("allows only SUCCESS and strict development request fields", async () => {
    const session = await newSession();
    await expect(
      service.createJob(session.token, { ...input, scenario: "ALWAYS_FAIL" } as never),
    ).rejects.toMatchObject({ code: "SCENARIO_NOT_ALLOWED", status: 400 });
    await expect(
      service.createJob(session.token, { ...input, privateNote: "no" } as never),
    ).rejects.toThrow();
    expect(
      store.dump().has(`jobs/${createHash("sha256").update(session.token).digest("hex")}`),
    ).toBe(false);
  });

  it("deduplicates concurrent identical requests and rejects conflicting idempotency reuse", async () => {
    const session = await newSession();
    const [first, second] = await Promise.all([
      service.createJob(session.token, input),
      service.createJob(session.token, input),
    ]);

    expect(first.job.jobId).toBe(second.job.jobId);
    expect(
      store.dump().has(`jobs/${createHash("sha256").update(session.token).digest("hex")}`),
    ).toBe(true);
    await failure(
      service.createJob(session.token, { ...input, nickname: "別の名前" }),
      "IDEMPOTENCY_CONFLICT",
      409,
    );
  });

  it("reuses one stored job slot after cancellation and never revives a retired job", async () => {
    const session = await newSession();
    const first = await service.createJob(session.token, input);
    await service.cancel(session.token, first.job.jobId);
    now += 5000;
    expect((await service.getJob(session.token, first.job.jobId)).job.state).toBe("CANCELLED");

    const second = await service.createJob(session.token, { ...input, requestId: "request-2" });
    expect(second.job.jobId).not.toBe(first.job.jobId);
    expect([...store.dump().keys()].filter((path) => path.startsWith("jobs/")).length).toBe(1);
    await failure(service.getJob(session.token, first.job.jobId), "JOB_NOT_FOUND", 404);
    await failure(service.confirm(session.token, first.job.jobId, consent), "JOB_NOT_FOUND", 404);
  });

  it("publishes once under concurrent confirmation and rejects changed consent", async () => {
    const session = await newSession();
    const job = await ready(session.token);
    const [first, repeated] = await Promise.all([
      service.confirm(session.token, job.job.jobId, consent),
      service.confirm(session.token, job.job.jobId, consent),
    ]);

    expect(repeated.resident?.residentId).toBe(first.resident?.residentId);
    expect((await service.snapshot()).residents).toHaveLength(1);
    await failure(
      service.confirm(session.token, job.job.jobId, {
        ...consent,
        fields: { nickname: false, personality: true, interests: true },
      }),
      "CONSENT_CONFLICT",
      409,
    );
    await failure(
      service.confirm(session.token, job.job.jobId, {
        ...consent,
        consentVersion: 1,
        publicationScope: undefined,
      }),
      "CONSENT_VERSION_REQUIRED",
      400,
    );
  });

  it("keeps a running join total that survives withdrawal and ignores repeated confirmation", async () => {
    expect(await service.joinedTotal()).toBe(0);
    const first = await newSession();
    const job = await ready(first.token);
    const published = await Promise.all([
      service.confirm(first.token, job.job.jobId, consent),
      service.confirm(first.token, job.job.jobId, consent),
    ]);
    const second = await newSession();
    const other = await ready(second.token, { ...input, requestId: "request-2" });
    await service.confirm(second.token, other.job.jobId, consent);
    expect(await service.joinedTotal()).toBe(2);
    await service.removeResident(published[0].resident?.residentId as string);
    expect((await service.snapshot()).residents).toHaveLength(1);
    expect(await service.joinedTotal()).toBe(2);
  });

  it("resets the running join total without removing residents and counts later joins from zero", async () => {
    const first = await newSession();
    const firstJob = await ready(first.token);
    const resident = (await service.confirm(first.token, firstJob.job.jobId, consent)).resident;
    expect(resident).not.toBeNull();

    expect(await service.resetJoinedTotal()).toBe(0);
    expect(await service.joinedTotal()).toBe(0);
    expect((await service.snapshot()).residents.map((entry) => entry.residentId)).toContain(
      resident?.residentId,
    );

    const second = await newSession();
    const secondJob = await ready(second.token, { ...input, requestId: "request-after-reset" });
    await service.confirm(second.token, secondJob.job.jobId, consent);
    expect(await service.joinedTotal()).toBe(1);
    expect((await service.snapshot()).residents).toHaveLength(2);
  });

  it("rejects a late confirmation after cancellation or withdrawal", async () => {
    const session = await newSession();
    const cancelled = await service.createJob(session.token, input);
    await service.cancel(session.token, cancelled.job.jobId);
    await failure(
      service.confirm(session.token, cancelled.job.jobId, consent),
      "JOB_NOT_READY",
      409,
    );

    const publishedJob = await ready(session.token, { ...input, requestId: "request-2" });
    await service.confirm(session.token, publishedJob.job.jobId, consent);
    await service.remove(session.token, publishedJob.job.jobId);
    await failure(
      service.confirm(session.token, publishedJob.job.jobId, consent),
      "JOB_NOT_READY",
      409,
    );
    expect((await service.snapshot()).residents).toEqual([]);
  });

  it("expires sessions permanently, hides residents, and rejects clock rollback revival", async () => {
    const session = await newSession();
    const job = await ready(session.token);
    await service.confirm(session.token, job.job.jobId, consent);
    now = session.expiresAt;
    const restarted = new VisitorService(store, () => now);

    await failure(restarted.current(session.token), "SESSION_REQUIRED", 401);
    const digest = createHash("sha256").update(session.token).digest("hex");
    expect(store.dump().has(`sessions/${digest}`)).toBe(false);
    expect(store.dump().has(`jobs/${digest}`)).toBe(false);
    expect((await restarted.snapshot()).residents).toEqual([]);
    now -= 1000;
    await failure(restarted.current(session.token), "SESSION_REQUIRED", 401);
    const freshInvitation = await restarted.createInvitation();
    expect((await restarted.createSession(session.token, freshInvitation.code)).token).not.toBe(
      session.token,
    );
    expect((await restarted.snapshot()).residents).toEqual([]);
  });

  it("releases an unconfirmed admission after the three-minute lease", async () => {
    const session = await newSession();
    const digest = createHash("sha256").update(session.token).digest("hex");
    const stateBefore = store.dump().get("meta/state");
    if (!stateBefore) throw new Error("Expected visitor metadata");
    const pendingBefore = stateBefore.pendingSessions as Record<string, number>;
    expect(pendingBefore[digest]).toBe(now + 3 * 60 * 1000);

    now += 3 * 60 * 1000;
    const restarted = new VisitorService(store, () => now);
    expect((await restarted.snapshot()).residents).toEqual([]);
    expect(store.dump().has(`sessions/${digest}`)).toBe(false);
    expect(store.dump().has(`jobs/${digest}`)).toBe(false);
    const stateAfter = store.dump().get("meta/state");
    if (!stateAfter) throw new Error("Expected visitor metadata after sweep");
    const activeAfter = stateAfter.activeSessions as Record<string, number>;
    const pendingAfter = stateAfter.pendingSessions as Record<string, number>;
    expect(activeAfter[digest]).toBeUndefined();
    expect(pendingAfter[digest]).toBeUndefined();

    now -= 1000;
    await failure(restarted.current(session.token), "SESSION_REQUIRED", 401);
    expect(store.dump().has(`sessions/${digest}`)).toBe(false);
  });

  it("acknowledges a delivered session without extending its original 24-hour expiry", async () => {
    const session = await newSession();
    const digest = createHash("sha256").update(session.token).digest("hex");
    expect(await service.current(session.token)).toBeNull();
    const stateAfterAck = store.dump().get("meta/state");
    if (!stateAfterAck) throw new Error("Expected visitor metadata after acknowledgement");
    const pendingAfterAck = stateAfterAck.pendingSessions as Record<string, number>;
    expect(pendingAfterAck[digest]).toBeUndefined();

    now += 3 * 60 * 1000;
    const restarted = new VisitorService(store, () => now);
    expect(await restarted.current(session.token)).toBeNull();
    expect(await restarted.createSession(session.token)).toEqual(session);

    now = session.expiresAt;
    await failure(restarted.current(session.token), "SESSION_REQUIRED", 401);
    now -= 1000;
    await failure(restarted.current(session.token), "SESSION_REQUIRED", 401);
  });

  it("finalizes other sessions that expired before reusing a still-live session", async () => {
    const expiring = await newSession();
    await service.current(expiring.token);
    now += 1000;
    const stillLive = await newSession();
    await service.current(stillLive.token);
    now = expiring.expiresAt;

    expect(await service.createSession(stillLive.token)).toEqual(stillLive);
    now -= 1000;
    await failure(service.current(expiring.token), "SESSION_REQUIRED", 401);
  });

  it("revokes public state and session access on logout", async () => {
    const session = await newSession();
    const job = await ready(session.token);
    await service.confirm(session.token, job.job.jobId, consent);
    await service.closeSession(session.token);

    expect((await service.snapshot()).residents).toEqual([]);
    await failure(service.current(session.token), "SESSION_REQUIRED", 401);
    expect([...store.dump().keys()].filter((path) => path.startsWith("jobs/")).length).toBe(0);
    expect([...store.dump().keys()].filter((path) => path.startsWith("sessions/")).length).toBe(0);
  });

  it("caps live sessions at 200", async () => {
    for (let index = 0; index < 200; index += 1) await newSession();
    const lastInvitation = await service.createInvitation();
    await failure(service.createSession(undefined, lastInvitation.code), "LOCAL_CAPACITY", 429);
    expect([...store.dump().keys()].filter((path) => path.startsWith("sessions/")).length).toBe(
      200,
    );
  });

  it("supports only the latest job slot while preserving a bounded number of request tombstones", async () => {
    const session = await newSession();
    let previous = await service.createJob(session.token, input);
    for (let index = 2; index <= 32; index += 1) {
      await service.cancel(session.token, previous.job.jobId);
      previous = await service.createJob(session.token, {
        ...input,
        requestId: `request-${index}`,
      });
    }
    expect([...store.dump().keys()].filter((path) => path.startsWith("jobs/")).length).toBe(1);
    await failure(
      service.createJob(session.token, { ...input, requestId: "request-33" }),
      "SESSION_JOB_LIMIT",
      429,
    );
  });

  it("requires an invitation before any store access and rejects unissued codes without writes", async () => {
    const tracked = new RecordingVisitorStore(store);
    const trackedService = new VisitorService(tracked, () => now);

    await failure(trackedService.createSession(), "INVITATION_REQUIRED", 401);
    await failure(trackedService.createSession(undefined, "bad"), "INVITATION_REQUIRED", 401);
    await failure(trackedService.createSession("a".repeat(64)), "INVITATION_REQUIRED", 401);
    expect(tracked.writes).toEqual([]);

    await service.snapshot();
    const expired = await newSession();
    now = expired.expiresAt;
    const before = store.dump();
    await failure(
      trackedService.createSession(undefined, "a".repeat(32)),
      "INVITATION_REQUIRED",
      401,
    );
    expect(tracked.writes).toEqual([]);
    expect([...store.dump()]).toEqual([...before]);
  });

  it("issues ten short-lived one-time invitations and stores only their digests", async () => {
    const codes: string[] = [];
    for (let index = 0; index < 10; index += 1) {
      const invitation = await service.createInvitation();
      expect(invitation.code).toMatch(/^[a-f0-9]{32}$/);
      expect(invitation.expiresAt).toBe(now + 3 * 60 * 1000);
      codes.push(invitation.code);
    }
    await failure(service.createInvitation(), "INVITATION_CAPACITY", 429);
    const serialized = JSON.stringify([...store.dump()]);
    for (const code of codes) expect(serialized).not.toContain(code);

    now += 3 * 60 * 1000;
    const fresh = await service.createInvitation();
    expect(fresh.code).toMatch(/^[a-f0-9]{32}$/);
  });

  it("consumes invitations once, rejects expiry without writes, and handles concurrent redemption", async () => {
    const oneUse = await service.createInvitation();
    const firstSession = await service.createSession(undefined, oneUse.code);
    await service.current(firstSession.token);
    const beforeSecondUse = store.dump();
    await failure(service.createSession(undefined, oneUse.code), "INVITATION_REQUIRED", 401);
    expect([...store.dump()]).toEqual([...beforeSecondUse]);

    const expires = await service.createInvitation();
    now = expires.expiresAt;
    const beforeExpiredUse = store.dump();
    await failure(service.createSession(undefined, expires.code), "INVITATION_REQUIRED", 401);
    expect([...store.dump()]).toEqual([...beforeExpiredUse]);

    now += 1;
    const concurrent = await service.createInvitation();
    const otherService = new VisitorService(store, () => now);
    const results = await Promise.allSettled([
      service.createSession(undefined, concurrent.code),
      otherService.createSession(undefined, concurrent.code),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await service.createSession(firstSession.token)).toEqual(firstSession);
    expect((await service.createSession(firstSession.token)).token).toBe(firstSession.token);
  });

  it("does not consume an invitation when the live-session capacity is full", async () => {
    let first: { token: string; expiresAt: number } | undefined;
    for (let index = 0; index < 200; index += 1) {
      const session = await newSession();
      first ??= session;
    }
    const invitation = await service.createInvitation();
    await failure(service.createSession(undefined, invitation.code), "LOCAL_CAPACITY", 429);
    expect(
      Object.keys((store.dump().get("meta/state")?.activeSessions as object) ?? {}),
    ).toHaveLength(200);
    if (!first) throw new Error("Expected a session to be created");
    await service.closeSession(first.token);
    expect((await service.createSession(undefined, invitation.code)).token).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });

  it("leaves every document untouched for unknown valid-format credentials", async () => {
    await service.snapshot();
    await newSession();
    now += 3 * 60 * 1000;
    const unknown = "a".repeat(64);
    const recorder = new RecordingVisitorStore(store);
    const guarded = new VisitorService(recorder, () => now);
    const before = [...store.dump()];
    await failure(guarded.createSession(unknown), "INVITATION_REQUIRED", 401);
    await failure(guarded.current(unknown), "SESSION_REQUIRED", 401);
    await failure(guarded.createJob(unknown, input), "SESSION_REQUIRED", 401);
    await failure(guarded.getJob(unknown, "job-unknown"), "SESSION_REQUIRED", 401);
    await failure(guarded.confirm(unknown, "job-unknown", consent), "SESSION_REQUIRED", 401);
    await failure(guarded.cancel(unknown, "job-unknown"), "SESSION_REQUIRED", 401);
    await failure(guarded.retry(unknown, "job-unknown"), "SESSION_REQUIRED", 401);
    await failure(guarded.remove(unknown, "job-unknown"), "SESSION_REQUIRED", 401);
    await guarded.closeSession(unknown);
    expect(recorder.writes).toEqual([]);
    expect([...store.dump()]).toEqual(before);
  });

  it("does not write global metadata when separate visitors create jobs", async () => {
    const first = await newSession();
    const second = await newSession();
    await service.current(first.token);
    await service.current(second.token);
    const guardedStore = new RecordingVisitorStore(store, "meta/state");
    const guardedService = new VisitorService(guardedStore, () => now);

    await guardedService.createJob(first.token, { ...input, requestId: "no-meta-write-1" });
    await guardedService.createJob(second.token, { ...input, requestId: "no-meta-write-2" });
    const firstDigest = createHash("sha256").update(first.token).digest("hex");
    const secondDigest = createHash("sha256").update(second.token).digest("hex");
    expect(guardedStore.writes).toEqual([
      `set:sessions/${firstDigest}`,
      `set:jobs/${firstDigest}`,
      `set:sessions/${secondDigest}`,
      `set:jobs/${secondDigest}`,
    ]);
  });
});
