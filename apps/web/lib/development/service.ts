import { createHash, randomUUID } from "node:crypto";
import type { CityEvent, GenerationJob, PublicResident } from "@ai-city/contracts";
import {
  CityEventPageSchema,
  CitySnapshotSchema,
  type CreateJobRequest,
  CreateJobRequestSchema,
  type DevelopmentAvatar,
  developmentAvatars,
  developmentEventId,
  type ParticipationView,
  ParticipationViewSchema,
  type PublishRequest,
  PublishRequestSchema,
} from "@ai-city/contracts/development";

export class DevelopmentServiceError extends Error {
  constructor(
    public code: string,
    public status = 409,
  ) {
    super(code);
  }
}
type RecordState = {
  session: string;
  input: CreateJobRequest;
  fingerprint: string;
  job: GenerationJob;
  attemptStartedAt: number;
  deadline: number;
  publication: ParticipationView["publication"];
  resident: PublicResident | null;
  consent: (PublishRequest & { recordedAt: string }) | null;
};

// Deliberately single-process and fictional. This is not a cloud queue or Firebase Auth.
export class LocalParticipationService {
  readonly streamId = randomUUID();
  private sessions = new Map<string, { createdAt: number; currentJob: string | null }>();
  private jobs = new Map<string, RecordState>();
  private cityEvents: CityEvent[] = [];
  constructor(private now: () => number = Date.now) {}

  private expire() {
    for (const [token, session] of this.sessions) {
      if (this.now() - session.createdAt < 3_600_000) continue;
      for (const record of this.jobs.values()) {
        if (record.session !== token) continue;
        if (record.publication === "PUBLISHED") this.emit(record, "RESIDENT_REMOVED", 2);
        record.publication = "REMOVED";
        record.resident = null;
        record.consent = null;
        record.input = { ...record.input, nickname: "削除済み", answers: null };
        this.stop(record);
      }
      this.sessions.delete(token);
    }
  }

  hasSession(token: string | undefined): token is string {
    this.expire();
    const session = token ? this.sessions.get(token) : undefined;
    return Boolean(session && this.now() - session.createdAt < 3_600_000);
  }
  createSession() {
    this.expire();
    if (this.sessions.size >= 200) throw new DevelopmentServiceError("LOCAL_CAPACITY", 429);
    const token = randomUUID();
    this.sessions.set(token, { createdAt: this.now(), currentJob: null });
    return token;
  }
  private session(token: string) {
    if (!this.hasSession(token)) throw new DevelopmentServiceError("SESSION_REQUIRED", 401);
    const session = this.sessions.get(token);
    if (!session) throw new DevelopmentServiceError("SESSION_REQUIRED", 401);
    return session;
  }
  private record(token: string, id: string) {
    this.session(token);
    const record = this.jobs.get(id);
    if (!record || record.session !== token)
      throw new DevelopmentServiceError("JOB_NOT_FOUND", 404);
    this.advance(record);
    return record;
  }
  createJob(token: string, raw: CreateJobRequest): ParticipationView {
    const session = this.session(token);
    const input = CreateJobRequestSchema.parse(raw);
    const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    for (const record of this.jobs.values()) {
      if (record.session === token && record.input.requestId === input.requestId) {
        if (record.fingerprint !== fingerprint)
          throw new DevelopmentServiceError("IDEMPOTENCY_CONFLICT");
        this.advance(record);
        return this.view(record);
      }
    }
    const previous = session.currentJob ? this.jobs.get(session.currentJob) : undefined;
    if (previous && previous.job.state !== "CANCELLED")
      throw new DevelopmentServiceError("ACTIVE_JOB_EXISTS");
    if (this.jobs.size >= 200) throw new DevelopmentServiceError("LOCAL_CAPACITY", 429);
    const jobId = randomUUID();
    const deadline = this.now() + 30_000;
    const record: RecordState = {
      session: token,
      input,
      fingerprint,
      attemptStartedAt: this.now(),
      deadline,
      job: {
        schemaVersion: 1,
        jobId,
        state: "QUEUED",
        attempt: 0,
        deadline: new Date(deadline).toISOString(),
        updatedAt: new Date(this.now()).toISOString(),
      },
      publication: "PRIVATE",
      resident: null,
      consent: null,
    };
    this.jobs.set(jobId, record);
    session.currentJob = jobId;
    return this.view(record);
  }
  current(token: string): ParticipationView | null {
    const session = this.session(token);
    return session.currentJob ? this.getJob(token, session.currentJob) : null;
  }
  getJob(token: string, id: string) {
    return this.view(this.record(token, id));
  }
  private avatar(record: RecordState): DevelopmentAvatar {
    const avatar = developmentAvatars[record.input.sampleId === "sora" ? 0 : 1];
    if (!avatar) throw new DevelopmentServiceError("ASSET_NOT_FOUND", 500);
    return avatar;
  }
  private preview(record: RecordState) {
    // Entertainment preferences only. Skipping gives neutral values, never an inferred MBTI.
    const answers = record.input.answers;
    const sociability = answers ? answers[0] + answers[4] : 2;
    return {
      nickname: record.input.nickname,
      avatarVersion: this.avatar(record).manifest.avatarVersion,
      personalityLabel:
        sociability >= 3
          ? "にぎやかな交流家"
          : sociability <= 1
            ? "静かな探検家"
            : "のんびり散歩好き",
      interests: answers ? [answers[5] === 0 ? "音楽" : answers[5] === 1 ? "ゲーム" : "散歩"] : [],
    };
  }
  private advance(record: RecordState) {
    if (!["QUEUED", "RUNNING"].includes(record.job.state)) return;
    if (this.now() >= record.deadline) {
      this.fail(record, "DEADLINE_EXCEEDED");
      return;
    }
    const elapsed = this.now() - record.attemptStartedAt;
    if (elapsed >= 400 && record.job.state === "QUEUED") {
      record.job.state = "RUNNING";
      record.job.attempt += 1;
      record.job.updatedAt = new Date(this.now()).toISOString();
    }
    if (elapsed < 1000 || record.input.scenario === "TIMEOUT") return;
    if (
      record.input.scenario === "ALWAYS_FAIL" ||
      (record.input.scenario === "FAIL_ONCE" && record.job.attempt === 1)
    ) {
      this.fail(record, "GENERATION_FAILED");
      return;
    }
    record.job.state = "READY";
    record.job.result = {
      avatarVersion: this.avatar(record).manifest.avatarVersion,
      mode: "FAST",
      fallback: true,
    };
    record.job.updatedAt = new Date(this.now()).toISOString();
  }
  private fail(record: RecordState, code: string) {
    record.job.state = "FAILED";
    record.job.errorCode = code;
    record.job.updatedAt = new Date(this.now()).toISOString();
  }
  retry(token: string, id: string) {
    const record = this.record(token, id);
    if (record.job.state !== "FAILED" || record.job.attempt >= 2 || this.now() >= record.deadline)
      throw new DevelopmentServiceError("RETRY_EXHAUSTED");
    record.job.state = "QUEUED";
    delete record.job.errorCode;
    record.job.updatedAt = new Date(this.now()).toISOString();
    record.attemptStartedAt = this.now();
    return this.view(record);
  }
  confirm(token: string, id: string, raw: PublishRequest) {
    const consent = PublishRequestSchema.parse(raw);
    const record = this.record(token, id);
    if (record.publication === "PUBLISHED") {
      if (!record.consent) throw new DevelopmentServiceError("CONSENT_MISSING", 500);
      const { recordedAt: _, ...previous } = record.consent;
      if (JSON.stringify(previous) !== JSON.stringify(consent))
        throw new DevelopmentServiceError("CONSENT_CONFLICT");
      return this.view(record);
    }
    if (record.job.state !== "READY" || record.publication === "REMOVED")
      throw new DevelopmentServiceError("JOB_NOT_READY");
    const preview = this.preview(record);
    record.consent = { ...consent, recordedAt: new Date(this.now()).toISOString() };
    record.resident = {
      schemaVersion: 1,
      residentId: `resident-${id}`,
      eventId: developmentEventId,
      nickname: consent.fields.nickname ? preview.nickname : "ゲスト",
      personalityLabel: consent.fields.personality ? preview.personalityLabel : "非公開",
      interests: consent.fields.interests ? preview.interests : [],
      avatarVersion: preview.avatarVersion,
      publicConsent: true,
      consentVersion: consent.consentVersion,
      publicState: "VISIBLE",
    };
    record.publication = "PUBLISHED";
    this.emit(record, "RESIDENT_JOINED", 1);
    return this.view(record);
  }
  private stop(record: RecordState) {
    record.job.state = "CANCELLED";
    record.job.cancelRequested = true;
    record.job.updatedAt = new Date(this.now()).toISOString();
    delete record.job.result;
    delete record.job.errorCode;
  }
  cancel(token: string, id: string) {
    const record = this.record(token, id);
    if (record.publication === "PUBLISHED") throw new DevelopmentServiceError("REMOVE_REQUIRED");
    this.stop(record);
    return this.view(record);
  }
  remove(token: string, id: string) {
    const record = this.record(token, id);
    if (record.publication === "PUBLISHED") this.emit(record, "RESIDENT_REMOVED", 2);
    record.publication = "REMOVED";
    record.resident = null;
    record.consent = null;
    record.input = { ...record.input, nickname: "削除済み", answers: null };
    this.stop(record);
    return this.view(record);
  }
  private emit(record: RecordState, type: CityEvent["type"], version: number) {
    if (!record.resident) throw new DevelopmentServiceError("RESIDENT_MISSING", 500);
    this.cityEvents.push({
      schemaVersion: 1,
      id: randomUUID(),
      eventId: developmentEventId,
      eventSeq: this.cityEvents.length + 1,
      residentId: record.resident.residentId,
      version,
      type,
    });
  }
  private view(record: RecordState): ParticipationView {
    const ready = record.job.state === "READY";
    return ParticipationViewSchema.parse({
      schemaVersion: 1,
      mode: "MOCK",
      eventId: developmentEventId,
      job: structuredClone(record.job),
      publication: record.publication,
      preview: ready ? this.preview(record) : null,
      resident: record.resident,
      avatar: ready ? this.avatar(record) : null,
    });
  }
  snapshot() {
    this.expire();
    const residents = [...this.jobs.values()]
      .filter((record) => record.publication === "PUBLISHED")
      .flatMap((record) => (record.resident ? [record.resident] : []));
    return CitySnapshotSchema.parse({
      schemaVersion: 1,
      mode: "MOCK",
      eventId: developmentEventId,
      streamId: this.streamId,
      eventSeq: this.cityEvents.length,
      residents,
      avatars: developmentAvatars.filter((avatar) =>
        residents.some((resident) => resident.avatarVersion === avatar.manifest.avatarVersion),
      ),
    });
  }
  events(streamId: string, afterSeq: number) {
    this.expire();
    if (streamId !== this.streamId) throw new DevelopmentServiceError("STREAM_RESET");
    if (!Number.isSafeInteger(afterSeq) || afterSeq < 0)
      throw new DevelopmentServiceError("INVALID_CURSOR", 400);
    if (afterSeq > this.cityEvents.length) throw new DevelopmentServiceError("CURSOR_AHEAD");
    return CityEventPageSchema.parse({
      schemaVersion: 1,
      mode: "MOCK",
      eventId: developmentEventId,
      streamId: this.streamId,
      afterSeq,
      latestSeq: this.cityEvents.length,
      events: this.cityEvents.slice(afterSeq),
    });
  }
}
