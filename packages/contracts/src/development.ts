import { z } from "zod";
import { developmentAvatarManifests, developmentResidents } from "./fixtures";
import {
  AvatarManifestSchema,
  CityEventSchema,
  GenerationJobSchema,
  PublicResidentSchema,
} from "./index";

const Id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
export const developmentEventId = "fixture-event" as const;
export const SampleIdSchema = z.enum(["sora", "haru"]);
export const EmptyDevelopmentRequestSchema = z.strictObject({});
export function isDevelopmentValidationError(error: unknown): boolean {
  return error instanceof z.ZodError;
}
export const CreateJobRequestSchema = z.strictObject({
  eventId: z.literal(developmentEventId),
  requestId: Id,
  nickname: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine((value) =>
      [...value].every(
        (character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
      ),
    ),
  sampleId: SampleIdSchema,
  answers: z
    .tuple([
      z.number().int().min(0).max(2),
      z.number().int().min(0).max(2),
      z.number().int().min(0).max(2),
      z.number().int().min(0).max(2),
      z.number().int().min(0).max(2),
      z.number().int().min(0).max(2),
    ])
    .nullable(),
  scenario: z.enum(["SUCCESS", "FAIL_ONCE", "ALWAYS_FAIL", "TIMEOUT"]),
});
export const PublishRequestSchema = z
  .strictObject({
    avatarPublicConsent: z.literal(true),
    consentVersion: z.union([z.literal(1), z.literal(2)]),
    publicationScope: z.literal("HOSTED_PREVIEW").optional(),
    fields: z.strictObject({
      nickname: z.boolean(),
      personality: z.boolean(),
      interests: z.boolean(),
    }),
  })
  .refine((input) =>
    input.consentVersion === 2
      ? input.publicationScope === "HOSTED_PREVIEW"
      : input.publicationScope === undefined,
  );
export const DevelopmentJobSchema = GenerationJobSchema.superRefine((job, context) => {
  if (
    !job.deadline ||
    !job.updatedAt ||
    (job.state === "READY" && !job.result) ||
    (job.state === "FAILED" && !job.errorCode)
  ) {
    context.addIssue({
      code: "custom",
      message: "Local jobs require timestamps and terminal results/errors",
    });
  }
});
export const DevelopmentAvatarSchema = z.strictObject({
  manifest: AvatarManifestSchema,
  assetStatus: z.literal("REFERENCE_ONLY"),
});
const PreviewSchema = PublicResidentSchema.pick({
  nickname: true,
  avatarVersion: true,
  personalityLabel: true,
  interests: true,
});
export const ParticipationViewSchema = z.strictObject({
  schemaVersion: z.literal(1),
  mode: z.literal("MOCK"),
  eventId: z.literal(developmentEventId),
  job: DevelopmentJobSchema,
  publication: z.enum(["PRIVATE", "PUBLISHED", "REMOVED"]),
  preview: PreviewSchema.nullable(),
  resident: PublicResidentSchema.nullable(),
  avatar: DevelopmentAvatarSchema.nullable(),
});
export const CitySnapshotSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    mode: z.literal("MOCK"),
    eventId: z.literal(developmentEventId),
    streamId: Id,
    eventSeq: z.number().int().nonnegative(),
    residents: z.array(PublicResidentSchema).max(200),
    avatars: z.array(DevelopmentAvatarSchema).max(2),
  })
  .superRefine((snapshot, context) => {
    const versions = snapshot.avatars.map((avatar) => avatar.manifest.avatarVersion);
    const ids = snapshot.residents.map((resident) => resident.residentId);
    if (
      new Set(versions).size !== versions.length ||
      new Set(ids).size !== ids.length ||
      snapshot.residents.some(
        (resident) =>
          resident.eventId !== snapshot.eventId ||
          resident.publicState !== "VISIBLE" ||
          !versions.includes(resident.avatarVersion),
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Snapshot residents must be unique, visible and reference this exhibition's avatars",
      });
    }
  });
export const CityEventPageSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    mode: z.literal("MOCK"),
    eventId: z.literal(developmentEventId),
    streamId: Id,
    afterSeq: z.number().int().nonnegative(),
    latestSeq: z.number().int().nonnegative(),
    events: z.array(CityEventSchema).max(400),
  })
  .superRefine((page, context) => {
    if (
      page.afterSeq > page.latestSeq ||
      page.events.length !== page.latestSeq - page.afterSeq ||
      page.events.some(
        (event, index) =>
          event.eventId !== page.eventId || event.eventSeq !== page.afterSeq + index + 1,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Events must be a contiguous suffix of the exhibition stream",
      });
    }
  });
export const DevelopmentErrorSchema = z.strictObject({
  mode: z.literal("MOCK"),
  error: z.strictObject({ code: z.string().regex(/^[A-Z_]+$/), message: z.string().min(1) }),
});
export type CreateJobRequest = z.infer<typeof CreateJobRequestSchema>;
export type PublishRequest = z.infer<typeof PublishRequestSchema>;
export type ParticipationView = z.infer<typeof ParticipationViewSchema>;
export type CitySnapshot = z.infer<typeof CitySnapshotSchema>;
export type CityEventPage = z.infer<typeof CityEventPageSchema>;
export type DevelopmentAvatar = z.infer<typeof DevelopmentAvatarSchema>;

// Existing v0.2 fixtures stay compatible. This integration set uses unique versions.
export const developmentAvatars: DevelopmentAvatar[] = developmentAvatarManifests.map(
  (manifest, index) => ({
    manifest: {
      ...manifest,
      avatarVersion: index === 0 ? "fixture-sora-v1" : "fixture-haru-v1",
      fallback: true,
    },
    assetStatus: "REFERENCE_ONLY",
  }),
);
export const developmentCitySnapshot = CitySnapshotSchema.parse({
  schemaVersion: 1,
  mode: "MOCK",
  eventId: developmentEventId,
  streamId: "fixture-stream",
  eventSeq: 2,
  residents: developmentResidents.map((resident, index) => ({
    ...resident,
    avatarVersion: index === 0 ? "fixture-sora-v1" : "fixture-haru-v1",
    publicState: "VISIBLE",
  })),
  avatars: developmentAvatars,
});
export const developmentCityEventPage = CityEventPageSchema.parse({
  schemaVersion: 1,
  mode: "MOCK",
  eventId: developmentEventId,
  streamId: "fixture-stream",
  afterSeq: 0,
  latestSeq: 2,
  events: developmentCitySnapshot.residents.map((resident, index) => ({
    schemaVersion: 1,
    id: `fixture-joined-${index + 1}`,
    eventId: developmentEventId,
    eventSeq: index + 1,
    residentId: resident.residentId,
    version: 1,
    type: "RESIDENT_JOINED",
  })),
});
