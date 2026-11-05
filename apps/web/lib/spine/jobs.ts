import { SpineBundleSchema } from "@ai-city/contracts";
import { z } from "zod";
import type { VisitorStore, VisitorTransaction } from "../visitor/store";
import { verifySpineBundle } from "./bundle";
import { createProductionJob, transitionProductionJob } from "./lifecycle";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,96}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const consentSchema = z.strictObject({
  processing: z.literal(true),
  automaticPublication: z.literal(true),
  version: z.literal(1),
  recordedAt: z.iso.datetime(),
});
const recordSchema = z
  .strictObject({
    owner: digest,
    photoSha256: digest.nullable(),
    consent: consentSchema.nullable(),
    state: z.enum([
      "QUEUED",
      "RUNNING",
      "UNKNOWN",
      "REQUIRES_REVIEW",
      "FAILED",
      "PUBLISHED",
      "WITHDRAWN",
    ]),
    processingConsent: z.boolean(),
    publicationConsent: z.boolean(),
    worker: id.nullable(),
    bundle: SpineBundleSchema.nullable().optional(),
    sessionExpiresAt: z.number().int().nonnegative().optional(),
    cleanupPending: z.boolean().optional(),
    toolCleanupPending: z.boolean().optional(),
  })
  .refine((record) => {
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
    if (record.bundle != null) return false;
    return record.state === "QUEUED" ? record.worker === null : record.worker !== null;
  }, "Inconsistent job state");
export type SpineConsent = {
  processing: boolean;
  automaticPublication: boolean;
  version: number;
  recordedAt: string;
};

export function makeSpineJob(
  owner: string,
  photoSha256: string,
  consent: SpineConsent,
  sessionExpiresAt?: number,
) {
  return recordSchema.parse({
    owner: digest.parse(owner),
    photoSha256: digest.parse(photoSha256),
    consent: consentSchema.parse(consent),
    ...createProductionJob(consent),
    worker: null,
    bundle: null,
    cleanupPending: false,
    toolCleanupPending: false,
    ...(sessionExpiresAt === undefined ? {} : { sessionExpiresAt }),
  });
}

export function withdrawSpineJobRecord(value: unknown, owner: string) {
  digest.parse(owner);
  const record = recordSchema.parse(value);
  if (record.owner !== owner) throw new Error("NOT_FOUND");
  return {
    ...record,
    ...transitionProductionJob(record, { type: "WITHDRAW" }),
    photoSha256: null,
    consent: null,
    worker: null,
    bundle: null,
    cleanupPending: true,
    toolCleanupPending: Boolean(
      record.toolCleanupPending || (record.state !== "QUEUED" && record.state !== "WITHDRAWN"),
    ),
  };
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
  async create(task: string, owner: string, photoSha256: string, consent: SpineConsent) {
    const path = this.path(task);
    const record = makeSpineJob(owner, photoSha256, consent);
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
      if (!record.success || record.data.state !== "QUEUED") return null;
      if (!(await sessionActive(tx, record.data, this.now()))) return null;
      return { owner: record.data.owner, photoSha256: record.data.photoSha256 };
    });
  }
  async claim(task: string, worker: string) {
    const path = this.path(task);
    id.parse(worker);
    return this.store.run(async (tx) => {
      const record = recordSchema.parse(await tx.get(path));
      if (!(await sessionActive(tx, record, this.now()))) throw new Error("SESSION_EXPIRED");
      const next = { ...record, ...transitionProductionJob(record, { type: "START" }), worker };
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
      const next = { ...record, ...transitionProductionJob(record, { type: "UNKNOWN" }) };
      tx.set(path, next);
      return next;
    });
  }
  async markReview(task: string, worker: string) {
    return this.finishWithoutPublication(task, worker, "REVIEW");
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
      const next = { ...record, ...transitionProductionJob(record, { type }) };
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
        ...transitionProductionJob(record, { type: "PUBLISH", verified: true, approved: true }),
        bundle: descriptor,
      };
      tx.set(path, next);
      return next;
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
        record = withdrawSpineJobRecord(record, record.owner);
        tx.set(path, record);
      }
      return {
        pending: record.cleanupPending === true,
        toolCleanupPending: record.toolCleanupPending === true,
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
  async withdraw(task: string, owner: string) {
    const path = this.path(task);
    digest.parse(owner);
    return this.store.run(async (tx) => {
      const next = withdrawSpineJobRecord(await tx.get(path), owner);
      tx.set(path, next);
      return next;
    });
  }
}
