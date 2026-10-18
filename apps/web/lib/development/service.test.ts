import { beforeEach, describe, expect, it } from "vitest";
import { LocalParticipationService } from "./service";

describe("local participation and city integration", () => {
  let now: number;
  let service: LocalParticipationService;
  const input = {
    requestId: "request-1",
    eventId: "fixture-event" as const,
    nickname: "テストそら",
    sampleId: "sora" as const,
    answers: null,
    scenario: "SUCCESS" as const,
  };
  const consent = {
    avatarPublicConsent: true as const,
    consentVersion: 1 as const,
    fields: { nickname: true, personality: true, interests: true },
  };
  beforeEach(() => {
    now = Date.parse("2026-10-18T01:00:00Z");
    service = new LocalParticipationService(() => now);
  });

  function ready(session: string) {
    const view = service.createJob(session, input);
    now += 1200;
    return service.getJob(session, view.job.jobId);
  }

  it("keeps generation private until explicit confirmation and publishes exactly once", () => {
    const session = service.createSession();
    const view = ready(session);
    expect(view.job.state).toBe("READY");
    expect(service.snapshot().residents).toEqual([]);
    const published = service.confirm(session, view.job.jobId, consent);
    const repeated = service.confirm(session, view.job.jobId, consent);
    expect(repeated.resident?.residentId).toBe(published.resident?.residentId);
    expect(service.snapshot().residents).toHaveLength(1);
    expect(
      service.events(service.snapshot().streamId, 0).events.map((event) => event.type),
    ).toEqual(["RESIDENT_JOINED"]);
  });

  it("reuses identical create requests but rejects conflicting reuse and a second active job", () => {
    const session = service.createSession();
    const job = service.createJob(session, input);
    expect(service.createJob(session, input).job.jobId).toBe(job.job.jobId);
    expect(() => service.createJob(session, { ...input, nickname: "別の名前" })).toThrow(
      "IDEMPOTENCY_CONFLICT",
    );
    expect(() => service.createJob(session, { ...input, requestId: "request-2" })).toThrow(
      "ACTIVE_JOB_EXISTS",
    );
  });

  it("rejects another session's job, forged session and confirmation before READY", () => {
    const session = service.createSession();
    const job = service.createJob(session, input);
    expect(() => service.getJob(service.createSession(), job.job.jobId)).toThrow("JOB_NOT_FOUND");
    expect(() => service.createJob("forged", input)).toThrow("SESSION_REQUIRED");
    expect(() => service.confirm(session, job.job.jobId, consent)).toThrow("JOB_NOT_READY");
  });

  it("honours public field choices without leaking questionnaire or session data", () => {
    const session = service.createSession();
    const view = ready(session);
    service.confirm(session, view.job.jobId, {
      ...consent,
      fields: { nickname: false, personality: false, interests: false },
    });
    const resident = service.snapshot().residents[0];
    expect(resident?.nickname).toBe("ゲスト");
    expect(resident?.personalityLabel).toBe("非公開");
    expect(resident?.interests).toEqual([]);
    const publicJson = JSON.stringify(service.snapshot());
    expect(publicJson).not.toContain(session);
    expect(publicJson).not.toContain("テストそら");
    expect(publicJson).not.toContain("answers");
  });

  it("cancels pending work and prevents delayed completion or republishing after removal", () => {
    const session = service.createSession();
    const job = service.createJob(session, input);
    service.cancel(session, job.job.jobId);
    now += 5000;
    expect(service.getJob(session, job.job.jobId).job.state).toBe("CANCELLED");
    expect(() => service.confirm(session, job.job.jobId, consent)).toThrow("JOB_NOT_READY");
    const second = service.createJob(session, { ...input, requestId: "request-2" });
    now += 1200;
    service.confirm(session, second.job.jobId, consent);
    service.remove(session, second.job.jobId);
    service.remove(session, second.job.jobId);
    expect(service.snapshot().residents).toEqual([]);
    expect(
      service
        .events(service.snapshot().streamId, 0)
        .events.map((event) => [event.type, event.version]),
    ).toEqual([
      ["RESIDENT_JOINED", 1],
      ["RESIDENT_REMOVED", 2],
    ]);
    expect(() => service.confirm(session, second.job.jobId, consent)).toThrow("JOB_NOT_READY");
  });

  it("bounds retries, exposes a retryable failure and respects the original deadline", () => {
    const session = service.createSession();
    const job = service.createJob(session, { ...input, scenario: "FAIL_ONCE" });
    now += 1200;
    expect(service.getJob(session, job.job.jobId).job.errorCode).toBe("GENERATION_FAILED");
    service.retry(session, job.job.jobId);
    now += 1200;
    expect(service.getJob(session, job.job.jobId).job).toMatchObject({
      state: "READY",
      attempt: 2,
    });
    const other = service.createSession();
    const timeout = service.createJob(other, { ...input, scenario: "TIMEOUT" });
    now += 31_000;
    expect(service.getJob(other, timeout.job.jobId).job.errorCode).toBe("DEADLINE_EXCEEDED");
    expect(() => service.retry(other, timeout.job.jobId)).toThrow("RETRY_EXHAUSTED");
  });

  it("detects server restarts and invalid cursors instead of silently missing events", () => {
    expect(() => service.events("old-stream", 0)).toThrow("STREAM_RESET");
    expect(() => service.events(service.snapshot().streamId, 1)).toThrow("CURSOR_AHEAD");
  });

  it("removes published mock residents when the local session expires", () => {
    const session = service.createSession();
    const job = ready(session);
    service.confirm(session, job.job.jobId, consent);
    now += 3_600_000;
    expect(service.snapshot().residents).toEqual([]);
    expect(() => service.current(session)).toThrow("SESSION_REQUIRED");
    expect(service.events(service.streamId, 1).events[0]?.type).toBe("RESIDENT_REMOVED");
  });

  it("never starts a third generation attempt", () => {
    const session = service.createSession();
    const job = service.createJob(session, { ...input, scenario: "ALWAYS_FAIL" });
    now += 1200;
    service.retry(session, job.job.jobId);
    now += 1200;
    expect(service.getJob(session, job.job.jobId).job.attempt).toBe(2);
    expect(() => service.retry(session, job.job.jobId)).toThrow("RETRY_EXHAUSTED");
  });
});
