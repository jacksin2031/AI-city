import { z } from "zod";
import { SpineAdjustmentSchema, SpineBundleSchema } from "./index";

/** Consent must be bound server-side to a live session and a verified photo digest. */
export const SpinePhotoConsentSchema = z.strictObject({
  version: z.literal(2),
  processing: z.literal(true),
  externalModelUpload: z.literal(true),
  automaticPublication: z.literal(true),
});
export const SpineTaskIdSchema = z
  .string()
  .regex(/^spine-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
export const SpineTaskStateSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "PREPARED",
  "UNKNOWN",
  "REQUIRES_REVIEW",
  "FAILED",
  "PUBLISHED",
  "WITHDRAWN",
]);
export const SpineTaskViewSchema = z
  .strictObject({
    task: SpineTaskIdSchema,
    state: SpineTaskStateSchema,
    photoCleanup: z.enum(["PENDING", "COMPLETE"]).optional(),
  })
  .refine((job) =>
    job.state === "WITHDRAWN" ? job.photoCleanup !== undefined : job.photoCleanup === undefined,
  );
export const SpineCurrentResponseSchema = z.strictObject({
  mode: z.literal("LOCAL_PRIVATE_TEST"),
  job: SpineTaskViewSchema.nullable(),
});
export const SpineCreatedResponseSchema = z.strictObject({
  mode: z.literal("LOCAL_PRIVATE_TEST"),
  task: SpineTaskIdSchema,
  state: z.literal("QUEUED"),
});
export const SpineWithdrawalResponseSchema = z.strictObject({
  mode: z.literal("LOCAL_PRIVATE_TEST"),
  state: z.literal("WITHDRAWN"),
  photoCleanup: z.enum(["PENDING", "COMPLETE"]),
});
export type SpineTaskView = z.infer<typeof SpineTaskViewSchema>;

export const SpineWorkerStatusSchema = z.strictObject({
  online: z.boolean(),
  lastSeenAt: z.iso.datetime().nullable(),
});
export type SpineWorkerStatus = z.infer<typeof SpineWorkerStatusSchema>;

export const SpineRepairEntrySchema = z.strictObject({
  at: z.iso.datetime(),
  action: z.enum(["cancel", "requeue", "preset", "adjust", "resetAdjust"]),
  code: z.string().length(8),
});
export type SpineRepairEntry = z.infer<typeof SpineRepairEntrySchema>;

export const SpineAdminTaskSchema = z.strictObject({
  task: SpineTaskIdSchema,
  code: z.string().length(8),
  state: SpineTaskStateSchema,
  stateSince: z.iso.datetime().nullable(),
  needsAttention: z.boolean(),
  /** Only PUBLISHED tasks; the bundle descriptor is already public to tablets. */
  preview: z
    .strictObject({ bundle: SpineBundleSchema, adjustment: SpineAdjustmentSchema.nullable() })
    .nullable(),
});
export type SpineAdminTask = z.infer<typeof SpineAdminTaskSchema>;

export const SpineAdminViewSchema = z.strictObject({
  worker: SpineWorkerStatusSchema,
  queued: z.number().int(),
  running: z.number().int(),
  tasks: z.array(SpineAdminTaskSchema).max(200),
  truncated: z.boolean(),
  repairs: z.array(SpineRepairEntrySchema).max(20),
});
export type SpineAdminView = z.infer<typeof SpineAdminViewSchema>;

export { SPINE_PARTS, type SpineAdjustment, SpineAdjustmentSchema, type SpinePart } from "./index";
