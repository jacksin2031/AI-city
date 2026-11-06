import { z } from "zod";
import { DevicePresetIdSchema } from "./device-link";
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

/** Static, privacy-safe failure classification. No free-form tool error or photo information. */
export const SpineFailureCodeSchema = z.enum([
  "TOOL_PREPARATION_FAILED",
  "TOOL_RUNTIME_FAILED",
  "TOOL_LIVE_INVALID",
  "TOOL_LIVE_EXIT",
  "TOOL_PIPELINE_FAILED",
  "MODEL_LOGIN_REQUIRED",
  "MODEL_QUOTA_REACHED",
  "MODEL_EXECUTION_FAILED",
  "BUNDLE_INVALID",
  "PHOTO_INTEGRITY_FAILED",
  "WORKER_EXECUTION_ERROR",
]);
export type SpineFailureCode = z.infer<typeof SpineFailureCodeSchema>;

export const SpineAdminTaskSchema = z.strictObject({
  task: SpineTaskIdSchema,
  code: z.string().length(8),
  state: SpineTaskStateSchema,
  stateSince: z.iso.datetime().nullable(),
  failureCode: SpineFailureCodeSchema.nullable(),
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

/** The admin recovery actions. A redo spends paid model budget, so it must carry confirmCost. */
export const SpineAdminActionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("cancel"), task: SpineTaskIdSchema }),
  z.strictObject({
    action: z.literal("requeue"),
    task: SpineTaskIdSchema,
    confirmCost: z.literal(true),
  }),
  z.strictObject({
    action: z.literal("preset"),
    task: SpineTaskIdSchema,
    presetId: DevicePresetIdSchema,
  }),
  z.strictObject({
    action: z.literal("adjust"),
    task: SpineTaskIdSchema,
    adjustment: SpineAdjustmentSchema,
  }),
  z.strictObject({ action: z.literal("resetAdjust"), task: SpineTaskIdSchema }),
]);
export type SpineAdminAction = z.infer<typeof SpineAdminActionSchema>;

/** Admin update of the hosted photo-upload admission switch. Strict: nothing else is accepted. */
export const PhotoUploadSettingsUpdateSchema = z.strictObject({ allowUpload: z.boolean() });
export type PhotoUploadSettingsUpdate = z.infer<typeof PhotoUploadSettingsUpdateSchema>;
/**
 * Admin view. `allowUpload` is the stored switch; `available` says whether this server has real
 * cloud intake at all; `effective` is what participants actually get (both must hold).
 */
export const PhotoUploadAdminSettingsSchema = z.strictObject({
  allowUpload: z.boolean(),
  available: z.boolean(),
  effective: z.boolean(),
});
export type PhotoUploadAdminSettings = z.infer<typeof PhotoUploadAdminSettingsSchema>;
/** Public view: one boolean, no detail about why. */
export const PhotoUploadPublicSettingsSchema = z.strictObject({ allowed: z.boolean() });
export type PhotoUploadPublicSettings = z.infer<typeof PhotoUploadPublicSettingsSchema>;

export { SPINE_PARTS, type SpineAdjustment, SpineAdjustmentSchema, type SpinePart } from "./index";
