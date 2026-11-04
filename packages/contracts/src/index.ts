import { z } from "zod";

const Id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
const Version = z.string().min(1).max(64);
const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const Timestamp = z.iso.datetime({ offset: true });
const AssetReference = z
  .string()
  .max(512)
  .regex(
    /^\/avatars\/[A-Za-z0-9/_-]+\.(?:png|webp)$/,
    "Expected a scoped avatar asset path; signed URLs belong to an internal transport contract",
  );
const AtlasDataReference = z
  .string()
  .max(512)
  .regex(/^\/avatars\/[A-Za-z0-9/_-]+\.json$/, "Expected a scoped avatar atlas JSON path");

// A bundle lives in one immutable version directory; paths never point to private storage.
const SpineBundleSchema = z
  .strictObject({
    runtime: z.literal("4.3"),
    skeleton: z.string().regex(/^\/avatars\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/skeleton\.json$/),
    atlas: z.string().regex(/^\/avatars\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/skeleton\.atlas$/),
    pages: z
      .array(z.string().regex(/^\/avatars\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.png$/))
      .min(1)
      .max(16),
    orientationPolicy: z
      .string()
      .regex(/^\/avatars\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/orientation-policy\.json$/),
    buildManifest: z
      .string()
      .regex(/^\/avatars\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/build-manifest\.json$/),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .refine((bundle) => {
    const directory = bundle.skeleton.slice(0, bundle.skeleton.lastIndexOf("/") + 1);
    const paths = [
      bundle.skeleton,
      bundle.atlas,
      bundle.orientationPolicy,
      bundle.buildManifest,
      ...bundle.pages,
    ];
    return (
      paths.every((path) => path.slice(0, path.lastIndexOf("/") + 1) === directory) &&
      new Set(paths).size === paths.length
    );
  }, "Spine bundle assets must be unique and in one version directory");

// Fields added in v0.2 are optional so that v0.1 documents and callers stay valid.

export const AvatarSpecSchema = z.strictObject({
  schemaVersion: z.literal(1),
  hairId: Id,
  clothingId: Id,
  hairColor: HexColor,
  clothingColor: HexColor,
  accessoryIds: z.array(Id).max(8),
  templateId: Id.optional(),
  palette: z.array(HexColor).max(16).optional(),
  asymmetryIds: z.array(Id).max(8).optional(),
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
  animationVersion: Version.optional(),
  // Transparent frame size in pixels; the anchor is normalized to that frame (0–1).
  frameSize: z
    .strictObject({
      width: z.number().int().min(1).max(4096),
      height: z.number().int().min(1).max(4096),
    })
    .optional(),
  anchor: z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
  atlas: z.strictObject({ image: AssetReference, data: AtlasDataReference }).optional(),
  // True when this asset set is a template or Fast Mode fallback, not the requested result.
  fallback: z.boolean().optional(),
  spine: SpineBundleSchema.optional(),
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
  // Removed residents leave the public collection; HIDDEN keeps the record but stops display.
  publicState: z.enum(["VISIBLE", "HIDDEN"]).optional(),
});

export const GenerationJobSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    jobId: Id,
    state: z.enum(["QUEUED", "RUNNING", "READY", "FAILED", "CANCELLED"]),
    attempt: z.number().int().min(0).max(10),
    deadline: Timestamp.optional(),
    updatedAt: Timestamp.optional(),
    cancelRequested: z.boolean().optional(),
    // READY is not the same as published; confirming entry into the city is a separate action.
    result: z
      .strictObject({
        avatarVersion: Version,
        mode: z.enum(["FAST", "ENHANCED"]),
        fallback: z.boolean(),
      })
      .optional(),
    // Stable machine code only; user-facing Japanese text is mapped by the client.
    errorCode: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{0,63}$/)
      .optional(),
  })
  .superRefine((job, context) => {
    if (job.result && job.state !== "READY")
      context.addIssue({
        code: "custom",
        path: ["result"],
        message: "Only READY jobs carry a result",
      });
    if (job.errorCode && job.state !== "FAILED")
      context.addIssue({
        code: "custom",
        path: ["errorCode"],
        message: "Only FAILED jobs carry an error code",
      });
  });

// `id` identifies the event; `eventId` identifies the exhibition (activity) it belongs to.
const CityEventEnvelope = {
  schemaVersion: z.literal(1),
  id: Id,
  eventId: Id,
  eventSeq: z.number().int().nonnegative(),
  version: z.number().int().positive(),
};

export const CityEventSchema = z.strictObject({
  ...CityEventEnvelope,
  residentId: Id,
  type: z.enum(["RESIDENT_JOINED", "RESIDENT_UPDATED", "RESIDENT_HIDDEN", "RESIDENT_REMOVED"]),
});

export const CityModeEventSchema = z.strictObject({
  ...CityEventEnvelope,
  type: z.literal("MODE_CHANGED"),
  mode: z.enum(["LIVE", "DEMO", "MAINTENANCE"]),
});

// Everything a display consumes from the event stream. CityEventSchema stays resident-only for v0.1 callers.
export const CityStreamEventSchema = z.union([CityEventSchema, CityModeEventSchema]);

// Residents' public context is looked up server-side from PublicResident; requests carry IDs only.
export const DialogueRequestSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    requestId: Id,
    eventId: Id,
    residentIds: z.tuple([Id, Id]),
    locale: z.literal("ja-JP"),
    maxLines: z.number().int().min(1).max(6),
  })
  .refine((request) => request.residentIds[0] !== request.residentIds[1], {
    path: ["residentIds"],
    message: "A dialogue needs two different residents",
  });

export const DialogueResultSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    requestId: Id,
    // LIVE is model output; PRESET is a reviewed fallback and must be shown as such.
    source: z.enum(["LIVE", "PRESET"]),
    safety: z.enum(["PASSED", "BLOCKED"]),
    lines: z
      .array(z.strictObject({ residentId: Id, text: z.string().trim().min(1).max(80) }))
      .max(6),
  })
  .superRefine((result, context) => {
    if (result.safety === "BLOCKED" && result.lines.length > 0)
      context.addIssue({ code: "custom", path: ["lines"], message: "Blocked output has no lines" });
    if (result.safety === "PASSED" && result.lines.length === 0)
      context.addIssue({ code: "custom", path: ["lines"], message: "Passed output needs lines" });
  });

export type AvatarSpec = z.infer<typeof AvatarSpecSchema>;
export type AvatarManifest = z.infer<typeof AvatarManifestSchema>;
export type PublicResident = z.infer<typeof PublicResidentSchema>;
export type GenerationJob = z.infer<typeof GenerationJobSchema>;
export type CityEvent = z.infer<typeof CityEventSchema>;
export type CityModeEvent = z.infer<typeof CityModeEventSchema>;
export type CityStreamEvent = z.infer<typeof CityStreamEventSchema>;
export type DialogueRequest = z.infer<typeof DialogueRequestSchema>;
export type DialogueResult = z.infer<typeof DialogueResultSchema>;
