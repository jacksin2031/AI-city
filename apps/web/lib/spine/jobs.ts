import { type SpineAdjustment, SpineAdjustmentSchema, SpineBundleSchema } from "@ai-city/contracts";
import { SpinePhotoConsentSchema, SpineTaskStateSchema } from "@ai-city/contracts/spine";
import { z } from "zod";
import type { VisitorStore, VisitorTransaction } from "../visitor/store";
import { verifySpineBundle } from "./bundle";
import { createProductionJob, transitionProductionJob } from "./lifecycle";
import { addSpineResident, removeSpineResident } from "./roster-index";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,96}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const legacyConsentSchema = z.strictObject({
  processing: z.literal(true),
  automaticPublication: z.literal(true),
  version: z.literal(1),
  recordedAt: z.iso.datetime(),
});
const liveConsentSchema = SpinePhotoConsentSchema.extend({ recordedAt: z.iso.datetime() });
const consentSchema = z.discriminatedUnion("version", [legacyConsentSchema, liveConsentSchema]);
const recordSchema = z
  .strictObject({
    owner: digest,
    photoSha256: digest.nullable(),
    consent: consentSchema.nullable(),
    state: SpineTaskStateSchema,
    /** Epoch ms of the last state change; absent on records written before it existed. */
    stateSince: z.number().int().nonnegative().optional(),
    processingConsent: z.boolean(),
    publicationConsent: z.boolean(),
    worker: id.nullable(),
    bundle: SpineBundleSchema.nullable().optional(),
    /** Admin-saved per-part tuning, applied when the tablet plays the published bundle. */
    adjustment: SpineAdjustmentSchema.nullable().optional(),
    sessionExpiresAt: z.number().int().nonnegative().optional(),
    cleanupPending: z.boolean().optional(),
    toolCleanupPending: z.boolean().optional(),
    toolCleanupSafe: z.boolean().optional(),
    publishedPhotoCleanupPending: z.boolean().optional(),
    photoStorage: z.literal("CLOUD_PRIVATE").optional(),
    photoGeneration: z
      .string()
      .regex(/^[1-9][0-9]{0,19}$/)
      .optional(),
    toolFlow: z
      .string()
      .regex(/^flow-[a-f0-9]{32}$/)
      .nullable()
      .optional(),
    liveIntent: z.boolean().optional(),
  })
  .refine((record) => {
    if ((record.photoStorage === "CLOUD_PRIVATE") !== (record.photoGeneration !== undefined))
      return false;
    if (record.state === "WITHDRAWN")
      return (
        !record.processingConsent &&
        !record.publicationConsent &&
        record.photoSha256 === null &&
        record.consent === null &&
        record.worker === null &&
        (record.bundle === null || record.bundle === undefined)
      );
    if (
      !record.processingConsent ||
      !record.publicationConsent ||
      !record.photoSha256 ||
      !record.consent
    )
      return false;
    if (record.state === "PUBLISHED") return record.worker !== null && record.bundle != null;
    if (record.state === "PREPARED" && !record.toolFlow) return false;
    if (record.bundle != null) return false;
    return record.state === "QUEUED" ? record.worker === null : record.worker !== null;
  }, "Inconsistent job state");
/** Single place that records when a job entered its current state. */
function stamp<T extends object>(record: T, now: number): T & { stateSince: number } {
  return { ...record, stateSince: now };
}

export type SpineConsent = {
  processing: boolean;
  automaticPublication: boolean;
  version: number;
  recordedAt: string;
  externalModelUpload?: boolean;
};

export function makeSpineJob(
  owner: string,
  photoSha256: string,
  consent: SpineConsent,
  sessionExpiresAt: number | undefined,
  now: number,
) {
  return recordSchema.parse({
    owner: digest.parse(owner),
    photoSha256: digest.parse(photoSha256),
    consent: consentSchema.parse(consent),
    ...stamp(createProductionJob(consent), now),
    worker: null,
    bundle: null,
    cleanupPending: false,
    toolCleanupPending: false,
    toolCleanupSafe: false,
    toolFlow: null,
    liveIntent: false,
    ...(sessionExpiresAt === undefined ? {} : { sessionExpiresAt }),
  });
}

/** Only a server-side verifier may bind an object generation to a queued task. */
export function makeCloudSpineJob(
  owner: string,
  photoSha256: string,
  consent: SpineConsent,
  expiresAt: number,
  generation: string,
  now: number,
) {
  return recordSchema.parse({
    ...makeSpineJob(owner, photoSha256, consent, expiresAt, now),
    photoStorage: "CLOUD_PRIVATE",
    photoGeneration: generation,
  });
}

export function withdrawSpineJobRecord(value: unknown, owner: string, now: number) {
  digest.parse(owner);
  const record = recordSchema.parse(value);
  if (record.owner !== owner) throw new Error("NOT_FOUND");
  return {
    ...record,
    ...stamp(transitionProductionJob(record, { type: "WITHDRAW" }), now),
    photoSha256: null,
    consent: null,
    worker: null,
    bundle: null,
    cleanupPending: true,
    toolCleanupPending: Boolean(
      record.toolCleanupPending || (record.state !== "QUEUED" && record.state !== "WITHDRAWN"),
    ),
    // A completed, model-disabled preflight has no running tool process or external output.
    toolCleanupSafe: Boolean(
      record.toolCleanupSafe || (record.state === "PREPARED" && !record.liveIntent),
    ),
  };
}

/** Public data only; caller must independently check the roster entry and live session. */
export function publishedSpineRecord(value: unknown, owner: string, expiresAt: number) {
  return publishedSpineView(value, owner, expiresAt)?.bundle ?? null;
}

/** Bundle plus the saved adjustment (null when none), under the same checks as above. */
export function publishedSpineView(value: unknown, owner: string, expiresAt: number) {
  const parsed = recordSchema.safeParse(value);
  if (
    !parsed.success ||
    parsed.data.state !== "PUBLISHED" ||
    parsed.data.owner !== owner ||
    parsed.data.sessionExpiresAt !== expiresAt
  )
    return null;
  return parsed.data.bundle
    ? { bundle: parsed.data.bundle, adjustment: parsed.data.adjustment ?? null }
    : null;
}

async function sessionActive(
  tx: VisitorTransaction,
  record: z.infer<typeof recordSchema>,
  now: number,
) {
  if (record.sessionExpiresAt === undefined) return true; // Legacy internal/test jobs have no visitor binding.
  const session = await tx.get(`sessions/${record.owner}`);
  const state = await tx.get("meta/state");
  const active = state?.activeSessions;
  const pending = state?.pendingSessions;
  if (pending !== undefined && (!pending || typeof pending !== "object" || Array.isArray(pending)))
    return false;
  const deadline = (pending as Record<string, unknown> | undefined)?.[record.owner];
  if (deadline !== undefined && (typeof deadline !== "number" || deadline <= now)) return false;
  return Boolean(
    session &&
      session.expiresAt === record.sessionExpiresAt &&
      record.sessionExpiresAt > now &&
      active &&
      typeof active === "object" &&
      !Array.isArray(active) &&
      (active as Record<string, unknown>)[record.owner] === record.sessionExpiresAt,
  );
}

/** Internal operations. Authentication and storage authorization are required at the caller. */
export class SpineJobs {
  constructor(
    private readonly store: VisitorStore,
    private readonly now: () => number = Date.now,
  ) {}
  private path(task: string) {
    return `jobs/spine-${id.parse(task)}`;
  }
  /** Tombstone serializes orphan cleanup against a late admission transaction. */
  async reserveOrphanCleanup(task: string): Promise<boolean> {
    const path = this.path(task);
    const marker = `requests/spine-orphan-${id.parse(task)}`;
    return this.store.run(async (tx) => {
      if (await tx.get(path)) return false;
      if (!(await tx.get(marker))) tx.set(marker, { cleanup: true });
      return true;
    });
  }
  async create(task: string, owner: string, photoSha256: string, consent: SpineConsent) {
    const path = this.path(task);
    const record = makeSpineJob(owner, photoSha256, consent, undefined, this.now());
    await this.store.run(async (tx) => {
      if (await tx.get(path)) throw new Error("ALREADY_EXISTS");
      tx.set(path, record);
    });
  }
  async get(task: string, owner: string) {
    const path = this.path(task);
    digest.parse(owner);
    return this.store.run(async (tx) => {
      const record = recordSchema.safeParse(await tx.get(path));
      if (!record.success || record.data.owner !== owner) throw new Error("NOT_FOUND");
      return record.data;
    });
  }
  /** Internal dispatcher lookup, never return this record to a browser. */
  async queuedForWorker(task: string) {
    return this.store.run(async (tx) => {
      const record = recordSchema.safeParse(await tx.get(this.path(task)));
      if (
        !record.success ||
        record.data.state !== "QUEUED" ||
        record.data.photoStorage === "CLOUD_PRIVATE"
      )
        return null;
      if (!(await sessionActive(tx, record.data, this.now()))) return null;
      return { owner: record.data.owner, photoSha256: record.data.photoSha256 };
    });
  }
  /** Internal dispatcher lookup for a cloud-stored photo. Never return this record to a browser. */
  async cloudQueuedForWorker(task: string) {
    return this.store.run(async (tx) => {
      const record = recordSchema.safeParse(await tx.get(this.path(task)));
      if (
        !record.success ||
        record.data.state !== "QUEUED" ||
        record.data.photoStorage !== "CLOUD_PRIVATE" ||
        record.data.photoGeneration === undefined
      )
        return null;
      if (!(await sessionActive(tx, record.data, this.now()))) return null;
      return {
        owner: record.data.owner,
        photoSha256: record.data.photoSha256,
        generation: record.data.photoGeneration,
      };
    });
  }
  async claim(task: string, worker: string) {
    const path = this.path(task);
    id.parse(worker);
    return this.store.run(async (tx) => {
      const record = recordSchema.parse(await tx.get(path));
      if (!(await sessionActive(tx, record, this.now()))) throw new Error("SESSION_EXPIRED");
      const next = {
        ...record,
        ...stamp(transitionProductionJob(record, { type: "START" }), this.now()),
        worker,
      };
      tx.set(path, next);
      return next;
    });
  }
  async markUnknown(task: string, worker: string) {
    const path = this.path(task);
    id.parse(worker);
    return this.store.run(async (tx) => {
      const record = recordSchema.parse(await tx.get(path));
      if (record.worker !== worker) throw new Error("WORKER_MISMATCH");
      const next = {
        ...record,
        ...stamp(transitionProductionJob(record, { type: "UNKNOWN" }), this.now()),
      };
      tx.set(path, next);
      return next;
    });
  }
  /** Bind an already-created tool flow before any live model operation begins. */
  async bindToolFlow(task: string, worker: string, flow: string, photoSha256: string) {
    const path = this.path(task);
    id.parse(worker);
    digest.parse(photoSha256);
    z.string()
      .regex(/^flow-[a-f0-9]{32}$/)
      .parse(flow);
    return this.store.run(async (tx) => {
      const record = recordSchema.parse(await tx.get(path));
      if (record.worker !== worker || record.state !== "RUNNING")
        throw new Error("WORKER_MISMATCH");
      if (!(await sessionActive(tx, record, this.now()))) throw new Error("SESSION_EXPIRED");
      if (record.photoSha256 !== photoSha256 || (record.toolFlow && record.toolFlow !== flow))
        throw new Error("TOOL_FLOW_MISMATCH");
      const next = { ...record, toolFlow: flow };
      tx.set(path, next);
      return next;
    });
  }
  /** Internal recovery lookup; callers must independently verify that no tool call was sent. */
  async preflightRecoveryContext(task: string) {
    return this.store.run(async (tx) => {
      const parsed = recordSchema.safeParse(await tx.get(this.path(task)));
      if (
        !parsed.success ||
        parsed.data.liveIntent ||
        !["RUNNING", "UNKNOWN"].includes(parsed.data.state)
      )
        return null;
      if (!(await sessionActive(tx, parsed.data, this.now()))) return null;
      return {
        owner: parsed.data.owner,
        photoSha256: parsed.data.photoSha256,
        toolFlow: parsed.data.toolFlow ?? null,
      };
    });
  }
  /** Only call after the read-only helper verifies a model-disabled flow and its receipt. */
  async recoverPrepared(task: string, owner: string, flow: string, photoSha256: string) {
    const path = this.path(task);
    digest.parse(owner);
    digest.parse(photoSha256);
    z.string()
      .regex(/^flow-[a-f0-9]{32}$/)
      .parse(flow);
    return this.store.run(async (tx) => {
      const record = recordSchema.parse(await tx.get(path));
      if (
        record.owner !== owner ||
        record.liveIntent ||
        !["RUNNING", "UNKNOWN"].includes(record.state) ||
        record.photoSha256 !== photoSha256 ||
        (record.toolFlow && record.toolFlow !== flow)
      )
        throw new Error("TOOL_FLOW_MISMATCH");
      if (!(await sessionActive(tx, record, this.now()))) throw new Error("SESSION_EXPIRED");
      const next = stamp({ ...record, toolFlow: flow, state: "PREPARED" as const }, this.now());
      tx.set(path, next);
      return next;
    });
  }
  async markReview(task: string, worker: string) {
    return this.finishWithoutPublication(task, worker, "REVIEW");
  }
  /** Reserve one irreversible live attempt before any tool process can send data. */
  async claimPreparedLive(task: string, worker: string, maxTasks: number) {
    const path = this.path(task);
    id.parse(worker);
    if (!Number.isSafeInteger(maxTasks) || maxTasks < 1 || maxTasks > 1000)
      throw new Error("BUDGET_CONFIG_INVALID");
    return this.store.run(async (tx) => {
      const record = recordSchema.parse(await tx.get(path));
      const budgetRaw = await tx.get("meta/spine-live-budget");
      const reservationPath = `requests/spine-live-${task}`;
      const existing = await tx.get(reservationPath);
      if (record.state !== "PREPARED" || !record.toolFlow || record.liveIntent)
        throw new Error("INVALID_TRANSITION");
      if (record.sessionExpiresAt === undefined) throw new Error("SESSION_REQUIRED");
      if (!(await sessionActive(tx, record, this.now()))) throw new Error("SESSION_EXPIRED");
      if (record.consent?.version !== 2 || record.consent.externalModelUpload !== true)
        throw new Error("CONSENT_REQUIRED");
      const budget = budgetRaw
        ? z
            .strictObject({
              maxTasks: z.number().int().min(1).max(1000),
              reserved: z.number().int().nonnegative(),
            })
            .parse(budgetRaw)
        : { maxTasks, reserved: 0 };
      if (budget.maxTasks !== maxTasks) throw new Error("BUDGET_CONFIG_CHANGED");
      if (existing || budget.reserved >= budget.maxTasks) throw new Error("BUDGET_EXHAUSTED");
      const next = {
        ...record,
        ...stamp(transitionProductionJob(record, { type: "RESUME" }), this.now()),
        worker,
        liveIntent: true,
      };
      tx.set("meta/spine-live-budget", { ...budget, reserved: budget.reserved + 1 });
      tx.set(reservationPath, { task, reserved: true });
      tx.set(path, next);
      return next;
    });
  }
  async markPrepared(task: string, worker: string) {
    const path = this.path(task);
    id.parse(worker);
    return this.store.run(async (tx) => {
      const record = recordSchema.parse(await tx.get(path));
      if (record.worker !== worker || !record.toolFlow || record.liveIntent)
        throw new Error("TOOL_FLOW_MISMATCH");
      if (!(await sessionActive(tx, record, this.now()))) throw new Error("SESSION_EXPIRED");
      const next = {
        ...record,
        ...stamp(transitionProductionJob(record, { type: "PREPARE" }), this.now()),
      };
      tx.set(path, next);
      return next;
    });
  }
  async markFailed(task: string, worker: string) {
    return this.finishWithoutPublication(task, worker, "FAIL");
  }
  private async finishWithoutPublication(task: string, worker: string, type: "REVIEW" | "FAIL") {
    const path = this.path(task);
    id.parse(worker);
    return this.store.run(async (tx) => {
      const record = recordSchema.parse(await tx.get(path));
      if (record.worker !== worker) throw new Error("WORKER_MISMATCH");
      const next = {
        ...record,
        ...stamp(transitionProductionJob(record, { type }), this.now()),
      };
      tx.set(path, next);
      return next;
    });
  }
  /** Internal worker boundary: caller must independently authenticate and verify review evidence. */
  async publish(
    task: string,
    worker: string,
    candidate: {
      descriptor: z.infer<typeof SpineBundleSchema>;
      manifest: Uint8Array;
      assets: Record<string, Uint8Array | undefined>;
      reviewApproved: boolean;
    },
  ) {
    const path = this.path(task);
    id.parse(worker);
    const descriptor = SpineBundleSchema.parse(candidate.descriptor);
    if (
      !candidate.reviewApproved ||
      !verifySpineBundle(descriptor, candidate.manifest, candidate.assets)
    )
      throw new Error("BUNDLE_NOT_APPROVED");
    return this.store.run(async (tx) => {
      const record = recordSchema.parse(await tx.get(path));
      if (record.worker !== worker) throw new Error("WORKER_MISMATCH");
      if (!(await sessionActive(tx, record, this.now()))) throw new Error("SESSION_EXPIRED");
      const next = {
        ...record,
        ...stamp(
          transitionProductionJob(record, { type: "PUBLISH", verified: true, approved: true }),
          this.now(),
        ),
        bundle: descriptor,
        publishedPhotoCleanupPending: true,
      };
      if (record.sessionExpiresAt !== undefined)
        await addSpineResident(tx, {
          task,
          owner: record.owner,
          expiresAt: record.sessionExpiresAt,
        });
      tx.set(path, next);
      return next;
    });
  }
  /** Saves (or with null clears) the display adjustment; only a published task has one. */
  async setAdjustment(task: string, adjustment: SpineAdjustment | null): Promise<void> {
    const path = this.path(task);
    const value = adjustment === null ? null : SpineAdjustmentSchema.parse(adjustment);
    await this.store.run(async (tx) => {
      const record = recordSchema.parse(await tx.get(path));
      if (record.state !== "PUBLISHED") throw new Error("INVALID_TRANSITION");
      tx.set(path, recordSchema.parse({ ...record, adjustment: value }));
    });
  }
  /** The public transport must check this on every request; it is not a storage URL. */
  async publishedBundle(task: string) {
    return this.store.run(async (tx) => {
      const record = recordSchema.safeParse(await tx.get(this.path(task)));
      return record.success &&
        record.data.state === "PUBLISHED" &&
        (await sessionActive(tx, record.data, this.now()))
        ? (record.data.bundle ?? null)
        : null;
    });
  }
  /** Publication records the need for cleanup in the same transaction as the public bundle. */
  async publishedPhotoCleanupPending(task: string) {
    return this.store.run(async (tx) => {
      const parsed = recordSchema.safeParse(await tx.get(this.path(task)));
      return Boolean(
        parsed.success &&
          parsed.data.state === "PUBLISHED" &&
          parsed.data.publishedPhotoCleanupPending,
      );
    });
  }
  async finishPublishedPhotoCleanup(task: string) {
    return this.store.run(async (tx) => {
      const path = this.path(task);
      const parsed = recordSchema.safeParse(await tx.get(path));
      if (!parsed.success || parsed.data.state !== "PUBLISHED") return false;
      tx.set(path, { ...parsed.data, publishedPhotoCleanupPending: false });
      return true;
    });
  }
  /** Local maintenance: expire session-bound tasks and retain a durable cleanup marker. */
  async prepareCleanup(task: string) {
    const path = this.path(task);
    return this.store.run(async (tx) => {
      const parsed = recordSchema.safeParse(await tx.get(path));
      if (!parsed.success) return null;
      let record = parsed.data;
      if (record.state !== "WITHDRAWN") {
        if (record.sessionExpiresAt === undefined || (await sessionActive(tx, record, this.now())))
          return null;
        record = withdrawSpineJobRecord(record, record.owner, this.now());
        await removeSpineResident(tx, task);
        tx.set(path, record);
      }
      return {
        pending: record.cleanupPending === true,
        toolCleanupPending: record.toolCleanupPending === true,
        toolCleanupSafe: record.toolCleanupSafe === true,
      };
    });
  }
  async finishCleanup(task: string) {
    const path = this.path(task);
    return this.store.run(async (tx) => {
      const parsed = recordSchema.safeParse(await tx.get(path));
      if (!parsed.success || parsed.data.state !== "WITHDRAWN" || parsed.data.toolCleanupPending)
        return false;
      tx.set(path, { ...parsed.data, cleanupPending: false });
      return true;
    });
  }
  /** A worker has removed the isolated workspace of a verified preflight-only task. */
  async finishToolCleanup(task: string) {
    return this.store.run(async (tx) => {
      const path = this.path(task);
      const parsed = recordSchema.safeParse(await tx.get(path));
      if (!parsed.success || parsed.data.state !== "WITHDRAWN" || !parsed.data.toolCleanupSafe)
        return false;
      tx.set(path, { ...parsed.data, toolCleanupPending: false, toolCleanupSafe: false });
      return true;
    });
  }
  async withdraw(task: string, owner: string) {
    const path = this.path(task);
    digest.parse(owner);
    return this.store.run(async (tx) => {
      const next = withdrawSpineJobRecord(await tx.get(path), owner, this.now());
      await removeSpineResident(tx, task);
      tx.set(path, next);
      return next;
    });
  }
  /**
   * Admin redo of a stuck or failed cloud task. The caller must have confirmed the cost and that the
   * photo still exists. The live budget counter is deliberately not decremented, so a re-run is
   * counted again when it is next claimed.
   */
  async requeue(task: string) {
    const path = this.path(task);
    return this.store.run(async (tx) => {
      const found = recordSchema.safeParse(await tx.get(path));
      if (!found.success) throw new Error("NOT_FOUND");
      const record = found.data;
      const next = {
        ...record,
        ...stamp(transitionProductionJob(record, { type: "REQUEUE" }), this.now()),
        worker: null,
        toolFlow: null,
        liveIntent: false,
      };
      if (record.photoStorage !== "CLOUD_PRIVATE") throw new Error("NOT_CLOUD_PHOTO");
      tx.delete(`requests/spine-live-${task}`);
      tx.set(path, recordSchema.parse(next));
    });
  }
  /** Admin cancel: the participant withdrawal path, acting for the owner stored in the record. */
  async adminWithdraw(task: string) {
    const path = this.path(task);
    return this.store.run(async (tx) => {
      const raw = await tx.get(path);
      const parsed = recordSchema.safeParse(raw);
      if (!parsed.success) throw new Error("NOT_FOUND");
      if (parsed.data.state === "WITHDRAWN") throw new Error("INVALID_TRANSITION");
      const next = withdrawSpineJobRecord(parsed.data, parsed.data.owner, this.now());
      await removeSpineResident(tx, task);
      tx.set(path, next);
    });
  }
}
