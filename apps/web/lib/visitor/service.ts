import { createHash, randomBytes, randomUUID } from "node:crypto";
import { type PublicResident, PublicResidentSchema } from "@ai-city/contracts";
import {
  type CitySnapshot,
  CitySnapshotSchema,
  type CreateJobRequest,
  CreateJobRequestSchema,
  type DevelopmentAvatar,
  DevelopmentJobSchema,
  developmentAvatars,
  developmentEventId,
  type ParticipationView,
  ParticipationViewSchema,
  type PublishRequest,
  PublishRequestSchema,
} from "@ai-city/contracts/development";
import { z } from "zod";
import { DevelopmentServiceError } from "../development/service";
import type { StoredDocument, VisitorStore, VisitorTransaction } from "./store";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const INVITATION_TTL_MS = 3 * 60 * 1000;
const PENDING_SESSION_LEASE_MS = 3 * 60 * 1000;
const MAX_ACTIVE_SESSIONS = 200;
const MAX_ACTIVE_INVITATIONS = 10;
const MAX_JOBS_PER_SESSION = 32;
const OPEN_ADMISSIONS_PER_MINUTE = 12;
const OpenAdmissionSchema = z.strictObject({
  startedAt: z.number().int().nonnegative(),
  count: z.number().int().min(1).max(OPEN_ADMISSIONS_PER_MINUTE),
});
const DIGEST = z.string().regex(/^[a-f0-9]{64}$/);
const INVITATION_DIGEST = z.string().regex(/^[a-f0-9]{64}$/);
const SafeId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

const RequestTombstoneSchema = z.strictObject({
  requestId: SafeId,
  fingerprint: DIGEST,
  jobId: SafeId,
});
const VisitorSessionDocumentSchema = z.strictObject({
  expiresAt: z.number().int().nonnegative(),
  currentJob: SafeId.nullable(),
  jobsCreated: z.number().int().min(0).max(MAX_JOBS_PER_SESSION),
  requestTombstones: z.array(RequestTombstoneSchema).max(MAX_JOBS_PER_SESSION),
});
const StoredResidentSchema = z.strictObject({
  ownerDigest: DIGEST,
  jobId: SafeId,
  expiresAt: z.number().int().nonnegative(),
  resident: PublicResidentSchema,
});
const VisitorStateSchema = z.strictObject({
  schemaVersion: z.literal(1),
  streamId: SafeId,
  eventSeq: z.number().int().nonnegative(),
  activeSessions: z
    .record(DIGEST, z.number().int().nonnegative())
    .refine((sessions) => Object.keys(sessions).length <= MAX_ACTIVE_SESSIONS),
  pendingSessions: z
    .record(DIGEST, z.number().int().nonnegative())
    .refine((sessions) => Object.keys(sessions).length <= MAX_ACTIVE_SESSIONS),
  invitations: z
    .record(INVITATION_DIGEST, z.number().int().nonnegative())
    .refine((invitations) => Object.keys(invitations).length <= MAX_ACTIVE_INVITATIONS),
  residents: z.array(StoredResidentSchema).max(MAX_ACTIVE_SESSIONS),
});
const StoredConsentSchema = z.strictObject({
  avatarPublicConsent: z.literal(true),
  consentVersion: z.literal(2),
  publicationScope: z.literal("HOSTED_PREVIEW"),
  fields: z.strictObject({
    nickname: z.boolean(),
    personality: z.boolean(),
    interests: z.boolean(),
  }),
  recordedAt: z.iso.datetime({ offset: true }),
});
const VisitorJobDocumentSchema = z
  .strictObject({
    ownerDigest: DIGEST,
    input: CreateJobRequestSchema.nullable(),
    fingerprint: DIGEST,
    generation: z.strictObject({
      attemptStartedAt: z.number().int().nonnegative(),
      deadlineAt: z.number().int().nonnegative(),
    }),
    consent: StoredConsentSchema.nullable(),
    publication: z.enum(["PRIVATE", "PUBLISHED", "REMOVED"]),
    resident: PublicResidentSchema.nullable(),
    job: DevelopmentJobSchema,
  })
  .superRefine((document, context) => {
    if (document.input && document.input.scenario !== "SUCCESS") {
      context.addIssue({
        code: "custom",
        path: ["input", "scenario"],
        message: "Only successful mock generation is available to visitors",
      });
    }
    if (
      (document.publication === "PUBLISHED") !==
      (document.resident !== null && document.consent !== null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["publication"],
        message: "Inconsistent publication state",
      });
    }
    if (document.job.state === "READY" && !document.input) {
      context.addIssue({
        code: "custom",
        path: ["input"],
        message: "Ready jobs require private generation input",
      });
    }
  });

type VisitorState = z.infer<typeof VisitorStateSchema>;
type VisitorSessionDocument = z.infer<typeof VisitorSessionDocumentSchema>;
type VisitorJobDocument = z.infer<typeof VisitorJobDocumentSchema>;
type StoredConsent = z.infer<typeof StoredConsentSchema>;
type ServiceOutcome<T> = { value: T } | { failure: { code: string; status: number } };

function success<T>(value: T): ServiceOutcome<T> {
  return { value };
}

function failure<T = never>(code: string, status = 409): ServiceOutcome<T> {
  return { failure: { code, status } };
}

function unwrap<T>(outcome: ServiceOutcome<T>): T {
  if ("failure" in outcome) {
    throw new DevelopmentServiceError(outcome.failure.code, outcome.failure.status);
  }
  return outcome.value;
}

function newState(): VisitorState {
  return VisitorStateSchema.parse({
    schemaVersion: 1,
    streamId: randomUUID(),
    eventSeq: 0,
    activeSessions: {},
    pendingSessions: {},
    invitations: {},
    residents: [],
  });
}

async function readState(tx: VisitorTransaction): Promise<VisitorState> {
  const raw = await tx.get("meta/state");
  if (!raw) return newState();
  return parseState(raw);
}

function parseState(raw: StoredDocument): VisitorState {
  try {
    // Older persisted documents predate invitation admission.
    const compatible = {
      ...raw,
      invitations: raw.invitations ?? (Object.hasOwn(raw, "invitations") ? null : {}),
      pendingSessions: raw.pendingSessions ?? (Object.hasOwn(raw, "pendingSessions") ? null : {}),
    };
    return VisitorStateSchema.parse(compatible);
  } catch {
    throw new DevelopmentServiceError("STORAGE_INVALID", 500);
  }
}

function setDocument(tx: VisitorTransaction, path: string, value: object): void {
  tx.set(path, value as StoredDocument);
}

function parseSession(raw: StoredDocument | null): VisitorSessionDocument | null {
  if (!raw) return null;
  try {
    return VisitorSessionDocumentSchema.parse(raw);
  } catch {
    throw new DevelopmentServiceError("STORAGE_INVALID", 500);
  }
}

function parseJob(raw: StoredDocument | null): VisitorJobDocument | null {
  if (!raw) return null;
  try {
    return VisitorJobDocumentSchema.parse(raw);
  } catch {
    throw new DevelopmentServiceError("STORAGE_INVALID", 500);
  }
}

function digestToken(token: string): string | null {
  if (!/^[a-fA-F0-9]{64}$/.test(token)) return null;
  return createHash("sha256").update(token).digest("hex");
}

function fingerprint(input: CreateJobRequest): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function removeDigest(state: VisitorState, digest: string): VisitorState {
  const activeSessions = { ...state.activeSessions };
  const pendingSessions = { ...state.pendingSessions };
  delete activeSessions[digest];
  delete pendingSessions[digest];
  const residents = state.residents.filter((stored) => stored.ownerDigest !== digest);
  return {
    ...state,
    activeSessions,
    pendingSessions,
    residents,
    eventSeq: state.eventSeq + state.residents.length - residents.length,
  };
}

function sweepExpired(
  tx: VisitorTransaction,
  state: VisitorState,
  now: number,
): { state: VisitorState; changed: boolean } {
  const expired = new Set([
    ...Object.entries(state.activeSessions)
      .filter(
        ([digest, expiresAt]) =>
          expiresAt <= now ||
          (state.pendingSessions[digest] !== undefined && state.pendingSessions[digest] <= now),
      )
      .map(([digest]) => digest),
    ...Object.entries(state.pendingSessions)
      .filter(([, ackDeadline]) => ackDeadline <= now)
      .map(([digest]) => digest),
  ]);
  let next = state;
  for (const digest of expired) {
    tx.delete(`sessions/${digest}`);
    tx.delete(`jobs/${digest}`);
    next = removeDigest(next, digest);
  }
  const residents = next.residents.filter((stored) => stored.expiresAt > now);
  if (residents.length !== next.residents.length) {
    next = {
      ...next,
      residents,
      eventSeq: next.eventSeq + next.residents.length - residents.length,
    };
  }
  const invitations = Object.fromEntries(
    Object.entries(next.invitations).filter(([, expiresAt]) => expiresAt > now),
  );
  const invitationsChanged =
    Object.keys(invitations).length !== Object.keys(next.invitations).length;
  if (invitationsChanged) next = { ...next, invitations };
  const pendingSessions = Object.fromEntries(
    Object.entries(next.pendingSessions).filter(([, ackDeadline]) => ackDeadline > now),
  );
  const pendingSessionsChanged =
    Object.keys(pendingSessions).length !== Object.keys(next.pendingSessions).length;
  if (pendingSessionsChanged) next = { ...next, pendingSessions };
  return {
    state: next,
    changed:
      expired.size > 0 ||
      residents.length !== state.residents.length ||
      invitationsChanged ||
      pendingSessionsChanged,
  };
}

function digestInvitation(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function isKnownSession(
  session: VisitorSessionDocument | null,
  digest: string,
  state: VisitorState,
): boolean {
  return session !== null || Object.hasOwn(state.activeSessions, digest);
}

function purgeSession(tx: VisitorTransaction, state: VisitorState, digest: string): VisitorState {
  tx.delete(`sessions/${digest}`);
  tx.delete(`jobs/${digest}`);
  const next = removeDigest(state, digest);
  if (
    Object.hasOwn(state.activeSessions, digest) ||
    state.residents.some((stored) => stored.ownerDigest === digest)
  ) {
    setDocument(tx, "meta/state", next);
  }
  return next;
}

function validSession(
  session: VisitorSessionDocument | null,
  digest: string,
  state: VisitorState,
  now: number,
): session is VisitorSessionDocument {
  return Boolean(
    session &&
      session.expiresAt > now &&
      state.activeSessions[digest] === session.expiresAt &&
      (state.pendingSessions[digest] === undefined || state.pendingSessions[digest] > now),
  );
}

function acknowledgeSession(
  state: VisitorState,
  digest: string,
): { state: VisitorState; changed: boolean } {
  if (!Object.hasOwn(state.pendingSessions, digest)) return { state, changed: false };
  const pendingSessions = { ...state.pendingSessions };
  delete pendingSessions[digest];
  return { state: { ...state, pendingSessions }, changed: true };
}

function iso(now: number): string {
  return new Date(now).toISOString();
}

function avatarFor(input: CreateJobRequest): DevelopmentAvatar {
  const avatar = developmentAvatars[input.sampleId === "sora" ? 0 : 1];
  if (!avatar) throw new DevelopmentServiceError("ASSET_NOT_FOUND", 500);
  return avatar;
}

function previewFor(input: CreateJobRequest) {
  const avatar = avatarFor(input);
  // Preferences are entertainment only; omitted answers produce neutral values.
  const answers = input.answers;
  const sociability = answers ? answers[0] + answers[4] : 2;
  return {
    nickname: input.nickname,
    avatarVersion: avatar.manifest.avatarVersion,
    personalityLabel:
      sociability >= 3
        ? "にぎやかな交流家"
        : sociability <= 1
          ? "静かな探検家"
          : "のんびり散歩好き",
    interests: answers ? [answers[5] === 0 ? "音楽" : answers[5] === 1 ? "ゲーム" : "散歩"] : [],
  };
}

function view(record: VisitorJobDocument): ParticipationView {
  const ready = record.job.state === "READY";
  const input = record.input;
  return ParticipationViewSchema.parse({
    schemaVersion: 1,
    mode: "MOCK",
    eventId: developmentEventId,
    job: structuredClone(record.job),
    publication: record.publication,
    preview: ready && input ? previewFor(input) : null,
    resident: record.resident,
    avatar: ready && input ? avatarFor(input) : null,
  });
}

function advance(record: VisitorJobDocument, now: number): boolean {
  if (!record.input || !["QUEUED", "RUNNING"].includes(record.job.state)) return false;
  const elapsed = now - record.generation.attemptStartedAt;
  if (now >= record.generation.deadlineAt) {
    record.job.state = "FAILED";
    record.job.errorCode = "DEADLINE_EXCEEDED";
    record.job.updatedAt = iso(now);
    return true;
  }
  if (elapsed >= 400 && record.job.state === "QUEUED") {
    record.job.state = "RUNNING";
    record.job.attempt += 1;
    record.job.updatedAt = iso(now);
  }
  if (elapsed < 1000) return record.job.state === "RUNNING";
  record.job.state = "READY";
  record.job.result = {
    avatarVersion: avatarFor(record.input).manifest.avatarVersion,
    mode: "FAST",
    fallback: true,
  };
  record.job.updatedAt = iso(now);
  return true;
}

function stop(record: VisitorJobDocument, now: number): void {
  record.job.state = "CANCELLED";
  record.job.cancelRequested = true;
  record.job.updatedAt = iso(now);
  delete record.job.result;
  delete record.job.errorCode;
  record.input = null;
  record.consent = null;
}

function asStoredConsent(consent: PublishRequest, now: number): StoredConsent {
  return StoredConsentSchema.parse({ ...consent, recordedAt: iso(now) });
}

function cleanExpiredState(tx: VisitorTransaction, state: VisitorState, now: number): VisitorState {
  const cleaned = sweepExpired(tx, state, now);
  if (cleaned.changed) setDocument(tx, "meta/state", cleaned.state);
  return cleaned.state;
}

function cleanExpiredAndAcknowledge(
  tx: VisitorTransaction,
  state: VisitorState,
  now: number,
  digest: string,
): VisitorState {
  const cleaned = sweepExpired(tx, state, now);
  const acknowledged = acknowledgeSession(cleaned.state, digest);
  if (cleaned.changed || acknowledged.changed) setDocument(tx, "meta/state", acknowledged.state);
  return acknowledged.state;
}

/**
 * Transactional visitor state backed by the injected document store. Session credentials are
 * anonymous capabilities only; this service does not verify a person's real-world identity.
 */
export class VisitorService {
  constructor(
    private readonly store: VisitorStore,
    private readonly now: () => number = Date.now,
  ) {}

  async createInvitation(): Promise<{ code: string; expiresAt: number }> {
    const now = this.now();
    const code = randomBytes(16).toString("hex");
    const digest = digestInvitation(code);
    const expiresAt = now + INVITATION_TTL_MS;
    const outcome = await this.store.run(async (tx) => {
      let state = await readState(tx);
      if (Object.hasOwn(state.invitations, digest)) {
        return failure("INVITATION_CREATE_FAILED", 500);
      }
      const cleaned = sweepExpired(tx, state, now);
      state = cleaned.state;
      if (Object.keys(state.invitations).length >= MAX_ACTIVE_INVITATIONS) {
        if (cleaned.changed) setDocument(tx, "meta/state", state);
        return failure("INVITATION_CAPACITY", 429);
      }
      state = { ...state, invitations: { ...state.invitations, [digest]: expiresAt } };
      setDocument(tx, "meta/state", state);
      return success({ code, expiresAt });
    });
    return unwrap(outcome);
  }

  async createSession(
    existingToken?: string,
    invitation?: string,
  ): Promise<{ token: string; expiresAt: number }> {
    return this.admitSession(existingToken, invitation, false);
  }

  async createOpenSession(existingToken?: string): Promise<{ token: string; expiresAt: number }> {
    return this.admitSession(existingToken, undefined, true);
  }

  private async admitSession(
    existingToken: string | undefined,
    invitation: string | undefined,
    open: boolean,
  ): Promise<{ token: string; expiresAt: number }> {
    const now = this.now();
    if (invitation !== undefined && !/^[a-fA-F0-9]{32}$/.test(invitation)) {
      throw new DevelopmentServiceError("INVITATION_REQUIRED", 401);
    }
    if (!open && existingToken && !digestToken(existingToken) && !invitation) {
      throw new DevelopmentServiceError("INVITATION_REQUIRED", 401);
    }
    if (!open && !existingToken && (!invitation || !/^[a-fA-F0-9]{32}$/.test(invitation))) {
      throw new DevelopmentServiceError("INVITATION_REQUIRED", 401);
    }

    const proposedToken = randomBytes(32).toString("hex");
    const proposedDigest = digestToken(proposedToken);
    if (!proposedDigest) throw new DevelopmentServiceError("SESSION_CREATE_FAILED", 500);
    const invitationDigest =
      invitation && /^[a-fA-F0-9]{32}$/.test(invitation)
        ? digestInvitation(invitation.toLowerCase())
        : null;
    if (!open && !invitationDigest && (!existingToken || !digestToken(existingToken))) {
      throw new DevelopmentServiceError("INVITATION_REQUIRED", 401);
    }

    const outcome = await this.store.run(async (tx) => {
      let state = await readState(tx);
      const existingDigest = existingToken ? digestToken(existingToken) : null;
      let existing: VisitorSessionDocument | null = null;
      if (existingDigest) {
        existing = parseSession(await tx.get(`sessions/${existingDigest}`));
        if (validSession(existing, existingDigest, state, now)) {
          cleanExpiredAndAcknowledge(tx, state, now, existingDigest);
          return success({ token: existingToken as string, expiresAt: existing.expiresAt });
        }
      }

      const candidate = await tx.get(`sessions/${proposedDigest}`);
      if (candidate) return failure("SESSION_CREATE_FAILED", 500);

      if (
        !open &&
        (!invitationDigest ||
          state.invitations[invitationDigest] === undefined ||
          state.invitations[invitationDigest] <= now)
      ) {
        return failure("INVITATION_REQUIRED", 401);
      }

      // Separate document keeps existing visitor metadata and rollback readers compatible.
      const rawAdmission = open ? await tx.get("meta/open-admission") : null;
      const parsedAdmission = rawAdmission ? OpenAdmissionSchema.safeParse(rawAdmission) : null;
      if (parsedAdmission && !parsedAdmission.success)
        throw new DevelopmentServiceError("STORAGE_INVALID", 500);
      const admission = parsedAdmission?.data ?? null;
      const withinWindow = admission && now < admission.startedAt + 60000;
      if (withinWindow && admission.count >= OPEN_ADMISSIONS_PER_MINUTE)
        return failure("RATE_LIMITED", 429);

      if (existingDigest && isKnownSession(existing, existingDigest, state)) {
        tx.delete(`sessions/${existingDigest}`);
        tx.delete(`jobs/${existingDigest}`);
        state = removeDigest(state, existingDigest);
      }
      const cleaned = sweepExpired(tx, state, now);
      state = cleaned.state;
      if (Object.keys(state.activeSessions).length >= MAX_ACTIVE_SESSIONS) {
        if (cleaned.changed) setDocument(tx, "meta/state", state);
        return failure("LOCAL_CAPACITY", 429);
      }

      const expiresAt = now + SESSION_TTL_MS;
      const session: VisitorSessionDocument = {
        expiresAt,
        currentJob: null,
        jobsCreated: 0,
        requestTombstones: [],
      };
      state = {
        ...state,
        activeSessions: { ...state.activeSessions, [proposedDigest]: expiresAt },
        pendingSessions: {
          ...state.pendingSessions,
          [proposedDigest]: now + PENDING_SESSION_LEASE_MS,
        },
        invitations: Object.fromEntries(
          Object.entries(state.invitations).filter(
            ([storedDigest]) => storedDigest !== invitationDigest,
          ),
        ),
      };
      setDocument(tx, `sessions/${proposedDigest}`, session);
      setDocument(tx, "meta/state", state);
      if (open)
        setDocument(tx, "meta/open-admission", {
          startedAt: withinWindow ? admission.startedAt : now,
          count: withinWindow ? admission.count + 1 : 1,
        });
      return success({ token: proposedToken, expiresAt });
    });

    return unwrap(outcome);
  }

  async current(token: string): Promise<ParticipationView | null> {
    const digest = digestToken(token);
    if (!digest) throw new DevelopmentServiceError("SESSION_REQUIRED", 401);
    const now = this.now();
    const outcome = await this.store.run(async (tx) => {
      let state = await readState(tx);
      const session = parseSession(await tx.get(`sessions/${digest}`));
      const job = parseJob(await tx.get(`jobs/${digest}`));
      if (!validSession(session, digest, state, now)) {
        if (isKnownSession(session, digest, state)) purgeSession(tx, state, digest);
        return failure("SESSION_REQUIRED", 401);
      }
      state = cleanExpiredAndAcknowledge(tx, state, now, digest);
      if (!session.currentJob) return success(null);
      if (!job || job.ownerDigest !== digest || job.job.jobId !== session.currentJob)
        return success(null);
      if (advance(job, now)) setDocument(tx, `jobs/${digest}`, job);
      return success(view(job));
    });
    return unwrap(outcome);
  }

  async createJob(token: string, raw: CreateJobRequest): Promise<ParticipationView> {
    const digest = digestToken(token);
    if (!digest) throw new DevelopmentServiceError("SESSION_REQUIRED", 401);
    const input = CreateJobRequestSchema.parse(raw);
    if (input.scenario !== "SUCCESS")
      throw new DevelopmentServiceError("SCENARIO_NOT_ALLOWED", 400);
    const requestFingerprint = fingerprint(input);
    const now = this.now();

    const outcome = await this.store.run(async (tx) => {
      const state = await readState(tx);
      const session = parseSession(await tx.get(`sessions/${digest}`));
      const previous = parseJob(await tx.get(`jobs/${digest}`));
      if (!validSession(session, digest, state, now)) {
        if (isKnownSession(session, digest, state)) purgeSession(tx, state, digest);
        return failure("SESSION_REQUIRED", 401);
      }
      cleanExpiredAndAcknowledge(tx, state, now, digest);

      const duplicate = session.requestTombstones.find(
        (entry) => entry.requestId === input.requestId,
      );
      if (duplicate) {
        if (duplicate.fingerprint !== requestFingerprint) return failure("IDEMPOTENCY_CONFLICT");
        if (session.currentJob === duplicate.jobId && previous?.job.jobId === duplicate.jobId) {
          if (advance(previous, now)) setDocument(tx, `jobs/${digest}`, previous);
          return success(view(previous));
        }
        return failure("JOB_RETIRED");
      }
      if (session.jobsCreated >= MAX_JOBS_PER_SESSION) return failure("SESSION_JOB_LIMIT", 429);
      if (
        session.currentJob &&
        previous?.job.jobId === session.currentJob &&
        previous.job.state !== "CANCELLED" &&
        previous.publication !== "REMOVED"
      ) {
        return failure("ACTIVE_JOB_EXISTS");
      }

      const jobId = randomUUID();
      const deadlineAt = now + 30_000;
      const job: VisitorJobDocument = VisitorJobDocumentSchema.parse({
        ownerDigest: digest,
        input,
        fingerprint: requestFingerprint,
        generation: { attemptStartedAt: now, deadlineAt },
        consent: null,
        publication: "PRIVATE",
        resident: null,
        job: {
          schemaVersion: 1,
          jobId,
          state: "QUEUED",
          attempt: 0,
          deadline: iso(deadlineAt),
          updatedAt: iso(now),
        },
      });
      const nextSession: VisitorSessionDocument = {
        ...session,
        currentJob: jobId,
        jobsCreated: session.jobsCreated + 1,
        requestTombstones: [
          ...session.requestTombstones,
          { requestId: input.requestId, fingerprint: requestFingerprint, jobId },
        ],
      };
      setDocument(tx, `sessions/${digest}`, nextSession);
      setDocument(tx, `jobs/${digest}`, job);
      return success(view(job));
    });
    return unwrap(outcome);
  }

  async getJob(token: string, id: string): Promise<ParticipationView> {
    const digest = digestToken(token);
    if (!digest) throw new DevelopmentServiceError("SESSION_REQUIRED", 401);
    const now = this.now();
    const outcome = await this.store.run(async (tx) => {
      let state = await readState(tx);
      const session = parseSession(await tx.get(`sessions/${digest}`));
      const record = parseJob(await tx.get(`jobs/${digest}`));
      if (!validSession(session, digest, state, now)) {
        if (isKnownSession(session, digest, state)) purgeSession(tx, state, digest);
        return failure("SESSION_REQUIRED", 401);
      }
      state = cleanExpiredAndAcknowledge(tx, state, now, digest);
      if (
        session.currentJob !== id ||
        !record ||
        record.ownerDigest !== digest ||
        record.job.jobId !== id
      ) {
        return failure("JOB_NOT_FOUND", 404);
      }
      if (advance(record, now)) setDocument(tx, `jobs/${digest}`, record);
      return success(view(record));
    });
    return unwrap(outcome);
  }

  async confirm(token: string, id: string, raw: PublishRequest): Promise<ParticipationView> {
    const consent = PublishRequestSchema.parse(raw);
    if (consent.consentVersion !== 2 || consent.publicationScope !== "HOSTED_PREVIEW") {
      throw new DevelopmentServiceError("CONSENT_VERSION_REQUIRED", 400);
    }
    const digest = digestToken(token);
    if (!digest) throw new DevelopmentServiceError("SESSION_REQUIRED", 401);
    const now = this.now();
    const outcome = await this.store.run(async (tx) => {
      let state = await readState(tx);
      const session = parseSession(await tx.get(`sessions/${digest}`));
      const record = parseJob(await tx.get(`jobs/${digest}`));
      if (!validSession(session, digest, state, now)) {
        if (isKnownSession(session, digest, state)) purgeSession(tx, state, digest);
        return failure("SESSION_REQUIRED", 401);
      }
      state = cleanExpiredAndAcknowledge(tx, state, now, digest);
      if (
        session.currentJob !== id ||
        !record ||
        record.ownerDigest !== digest ||
        record.job.jobId !== id
      ) {
        return failure("JOB_NOT_FOUND", 404);
      }

      const advanced = advance(record, now);
      if (record.publication === "PUBLISHED") {
        if (!record.consent) throw new DevelopmentServiceError("CONSENT_MISSING", 500);
        const { recordedAt: _recordedAt, ...previousConsent } = record.consent;
        if (JSON.stringify(previousConsent) !== JSON.stringify(consent)) {
          if (advanced) setDocument(tx, `jobs/${digest}`, record);
          return failure("CONSENT_CONFLICT");
        }
        if (advanced) setDocument(tx, `jobs/${digest}`, record);
        return success(view(record));
      }
      if (record.publication === "REMOVED" || record.job.state !== "READY" || !record.input) {
        if (advanced) setDocument(tx, `jobs/${digest}`, record);
        return failure("JOB_NOT_READY");
      }

      const preview = previewFor(record.input);
      const resident: PublicResident = PublicResidentSchema.parse({
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
      });
      record.consent = asStoredConsent(consent, now);
      record.resident = resident;
      record.publication = "PUBLISHED";
      state = {
        ...state,
        eventSeq: state.eventSeq + 1,
        residents: [
          ...state.residents.filter((stored) => stored.ownerDigest !== digest),
          { ownerDigest: digest, jobId: id, expiresAt: session.expiresAt, resident },
        ],
      };
      setDocument(tx, `jobs/${digest}`, record);
      setDocument(tx, "meta/state", state);
      return success(view(record));
    });
    return unwrap(outcome);
  }

  async cancel(token: string, id: string): Promise<ParticipationView> {
    const digest = digestToken(token);
    if (!digest) throw new DevelopmentServiceError("SESSION_REQUIRED", 401);
    const now = this.now();
    const outcome = await this.store.run(async (tx) => {
      let state = await readState(tx);
      const session = parseSession(await tx.get(`sessions/${digest}`));
      const record = parseJob(await tx.get(`jobs/${digest}`));
      if (!validSession(session, digest, state, now)) {
        if (isKnownSession(session, digest, state)) purgeSession(tx, state, digest);
        return failure("SESSION_REQUIRED", 401);
      }
      state = cleanExpiredAndAcknowledge(tx, state, now, digest);
      if (
        session.currentJob !== id ||
        !record ||
        record.ownerDigest !== digest ||
        record.job.jobId !== id
      ) {
        return failure("JOB_NOT_FOUND", 404);
      }
      if (record.publication === "PUBLISHED") return failure("REMOVE_REQUIRED");
      if (record.job.state !== "CANCELLED") {
        stop(record, now);
        setDocument(tx, `jobs/${digest}`, record);
      }
      return success(view(record));
    });
    return unwrap(outcome);
  }

  async retry(token: string, id: string): Promise<ParticipationView> {
    const digest = digestToken(token);
    if (!digest) throw new DevelopmentServiceError("SESSION_REQUIRED", 401);
    const now = this.now();
    const outcome = await this.store.run(async (tx) => {
      let state = await readState(tx);
      const session = parseSession(await tx.get(`sessions/${digest}`));
      const record = parseJob(await tx.get(`jobs/${digest}`));
      if (!validSession(session, digest, state, now)) {
        if (isKnownSession(session, digest, state)) purgeSession(tx, state, digest);
        return failure("SESSION_REQUIRED", 401);
      }
      state = cleanExpiredAndAcknowledge(tx, state, now, digest);
      if (
        session.currentJob !== id ||
        !record ||
        record.ownerDigest !== digest ||
        record.job.jobId !== id
      ) {
        return failure("JOB_NOT_FOUND", 404);
      }
      const advanced = advance(record, now);
      if (
        record.job.state !== "FAILED" ||
        record.job.attempt >= 2 ||
        now >= record.generation.deadlineAt ||
        !record.input
      ) {
        if (advanced) setDocument(tx, `jobs/${digest}`, record);
        return failure("RETRY_EXHAUSTED");
      }
      record.job.state = "QUEUED";
      delete record.job.errorCode;
      record.job.updatedAt = iso(now);
      record.generation.attemptStartedAt = now;
      setDocument(tx, `jobs/${digest}`, record);
      return success(view(record));
    });
    return unwrap(outcome);
  }

  async remove(token: string, id: string): Promise<ParticipationView> {
    const digest = digestToken(token);
    if (!digest) throw new DevelopmentServiceError("SESSION_REQUIRED", 401);
    const now = this.now();
    const outcome = await this.store.run(async (tx) => {
      let state = await readState(tx);
      const session = parseSession(await tx.get(`sessions/${digest}`));
      const record = parseJob(await tx.get(`jobs/${digest}`));
      if (!validSession(session, digest, state, now)) {
        if (isKnownSession(session, digest, state)) purgeSession(tx, state, digest);
        return failure("SESSION_REQUIRED", 401);
      }
      state = cleanExpiredAndAcknowledge(tx, state, now, digest);
      if (
        session.currentJob !== id ||
        !record ||
        record.ownerDigest !== digest ||
        record.job.jobId !== id
      ) {
        return failure("JOB_NOT_FOUND", 404);
      }
      if (record.publication === "REMOVED") return success(view(record));

      const hadPublicResident = record.publication === "PUBLISHED";
      state = {
        ...state,
        eventSeq: state.eventSeq + (hadPublicResident ? 1 : 0),
        residents: state.residents.filter((stored) => stored.ownerDigest !== digest),
      };
      record.publication = "REMOVED";
      record.resident = null;
      stop(record, now);
      setDocument(tx, `jobs/${digest}`, record);
      setDocument(tx, "meta/state", state);
      return success(view(record));
    });
    return unwrap(outcome);
  }

  async closeSession(token: string): Promise<void> {
    const digest = digestToken(token);
    if (!digest) return;
    await this.store.run(async (tx) => {
      const state = await readState(tx);
      const session = parseSession(await tx.get(`sessions/${digest}`));
      if (!isKnownSession(session, digest, state)) return;
      purgeSession(tx, state, digest);
    });
  }

  async snapshot(): Promise<CitySnapshot> {
    const now = this.now();
    return this.store.run(async (tx) => {
      const rawState = await tx.get("meta/state");
      const state = rawState ? parseState(rawState) : newState();
      const cleaned = sweepExpired(tx, state, now);
      if (!rawState || cleaned.changed) setDocument(tx, "meta/state", cleaned.state);
      const residents = cleaned.state.residents.map((stored) => stored.resident);
      return CitySnapshotSchema.parse({
        schemaVersion: 1,
        mode: "MOCK",
        eventId: developmentEventId,
        streamId: cleaned.state.streamId,
        eventSeq: cleaned.state.eventSeq,
        residents,
        avatars: developmentAvatars.filter((avatar) =>
          residents.some((resident) => resident.avatarVersion === avatar.manifest.avatarVersion),
        ),
      });
    });
  }

  async removeResident(id: string): Promise<void> {
    const now = this.now();
    const outcome = await this.store.run(async (tx) => {
      let state = await readState(tx);
      const candidate = state.residents.find((stored) => stored.resident.residentId === id);
      if (!candidate || candidate.expiresAt <= now) {
        state = cleanExpiredState(tx, state, now);
        return failure("JOB_NOT_FOUND", 404);
      }
      const session = parseSession(await tx.get(`sessions/${candidate.ownerDigest}`));
      const record = parseJob(await tx.get(`jobs/${candidate.ownerDigest}`));
      state = cleanExpiredState(tx, state, now);
      const current = state.residents.find((stored) => stored.resident.residentId === id);
      if (!current) return failure("JOB_NOT_FOUND", 404);
      state = {
        ...state,
        eventSeq: state.eventSeq + 1,
        residents: state.residents.filter((stored) => stored.resident.residentId !== id),
      };
      if (
        session &&
        record &&
        record.ownerDigest === current.ownerDigest &&
        record.job.jobId === current.jobId
      ) {
        record.publication = "REMOVED";
        record.resident = null;
        stop(record, now);
        setDocument(tx, `jobs/${current.ownerDigest}`, record);
      }
      setDocument(tx, "meta/state", state);
      return success(undefined);
    });
    unwrap(outcome);
  }
}
