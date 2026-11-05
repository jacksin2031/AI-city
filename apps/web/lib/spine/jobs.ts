import { SpineBundleSchema } from "@ai-city/contracts";
import { z } from "zod";
import type { VisitorStore } from "../visitor/store";
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
type Consent = {
  processing: boolean;
  automaticPublication: boolean;
  version: number;
  recordedAt: string;
};

/** Internal operations. Authentication and storage authorization are required at the caller. */
export class SpineJobs {
  constructor(private readonly store: VisitorStore) {}
  private path(task: string) {
    return `jobs/spine-${id.parse(task)}`;
  }
  async create(task: string, owner: string, photoSha256: string, consent: Consent) {
    const path = this.path(task);
    const record = recordSchema.parse({
      owner: digest.parse(owner),
      photoSha256: digest.parse(photoSha256),
      consent: consentSchema.parse(consent),
      ...createProductionJob(consent),
      worker: null,
      bundle: null,
    });
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
  async claim(task: string, worker: string) {
    const path = this.path(task);
    id.parse(worker);
    return this.store.run(async (tx) => {
      const record = recordSchema.parse(await tx.get(path));
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
      return record.success && record.data.state === "PUBLISHED"
        ? (record.data.bundle ?? null)
        : null;
    });
  }
  async withdraw(task: string, owner: string) {
    const path = this.path(task);
    digest.parse(owner);
    return this.store.run(async (tx) => {
      const record = recordSchema.parse(await tx.get(path));
      if (record.owner !== owner) throw new Error("NOT_FOUND");
      const next = {
        ...record,
        ...transitionProductionJob(record, { type: "WITHDRAW" }),
        photoSha256: null,
        consent: null,
        worker: null,
        bundle: null,
      };
      tx.set(path, next);
      return next;
    });
  }
}
