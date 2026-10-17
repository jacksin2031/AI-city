import { z } from "zod";

const Id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
const Version = z.string().min(1).max(64);
const AssetReference = z
  .string()
  .max(512)
  .regex(
    /^\/avatars\/[A-Za-z0-9/_-]+\.(?:png|webp)$/,
    "Expected a scoped avatar asset path; signed URLs belong to an internal transport contract",
  );

export const AvatarSpecSchema = z.strictObject({
  schemaVersion: z.literal(1),
  hairId: Id,
  clothingId: Id,
  hairColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  clothingColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accessoryIds: z.array(Id).max(8),
});

export const AvatarManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  avatarVersion: Version,
  rigVersion: Version,
  directions: z.strictObject({
    front: AssetReference,
    back: AssetReference,
    left: AssetReference,
    right: AssetReference,
  }),
});

// Shape validation is NOT proof of a real consent record or authorization.
// The future publishing service must verify session ownership and consent independently.
export const PublicResidentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  residentId: Id,
  eventId: Id,
  nickname: z.string().trim().min(1).max(80),
  avatarVersion: Version,
  publicConsent: z.literal(true),
  consentVersion: z.number().int().positive(),
  interests: z.array(z.string().min(1).max(32)).max(8),
  personalityLabel: z.string().min(1).max(80),
});

export const GenerationJobSchema = z.strictObject({
  schemaVersion: z.literal(1),
  jobId: Id,
  state: z.enum(["QUEUED", "RUNNING", "READY", "FAILED", "CANCELLED"]),
  attempt: z.number().int().min(0).max(10),
});

export const CityEventSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: Id,
  eventId: Id,
  eventSeq: z.number().int().nonnegative(),
  residentId: Id,
  version: z.number().int().positive(),
  type: z.enum(["RESIDENT_JOINED", "RESIDENT_UPDATED", "RESIDENT_HIDDEN", "RESIDENT_REMOVED"]),
});

export type AvatarSpec = z.infer<typeof AvatarSpecSchema>;
export type AvatarManifest = z.infer<typeof AvatarManifestSchema>;
export type PublicResident = z.infer<typeof PublicResidentSchema>;
export type GenerationJob = z.infer<typeof GenerationJobSchema>;
export type CityEvent = z.infer<typeof CityEventSchema>;
