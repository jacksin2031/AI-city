import { z } from "zod";

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
