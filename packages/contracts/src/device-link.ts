import { z } from "zod";
import { CitySnapshotSchema } from "./development";
import { CityModeEventSchema } from "./index";

/** Fictional display-only presets; these are not AI-generated participants. */
export const PRESET_CHARACTERS = [
  {
    id: "aoi",
    officialSkin: "spineboy",
    name: "あおい",
    avatarVersion: "fixture-sora-v1",
    personality: "散歩が好き",
    interest: "音楽",
  },
  {
    id: "kaede",
    officialSkin: "davide",
    name: "かえで",
    avatarVersion: "fixture-haru-v1",
    personality: "好奇心いっぱい",
    interest: "本",
  },
  {
    id: "minato",
    officialSkin: "erikari",
    name: "みなと",
    avatarVersion: "fixture-sora-v1",
    personality: "のんびり屋",
    interest: "カフェ",
  },
  {
    id: "hinata",
    officialSkin: "harri",
    name: "ひなた",
    avatarVersion: "fixture-haru-v1",
    personality: "街を探検中",
    interest: "散歩",
  },
  {
    id: "yui",
    officialSkin: "luke",
    name: "ゆい",
    avatarVersion: "fixture-sora-v1",
    personality: "音楽好き",
    interest: "楽器",
  },
  {
    id: "ren",
    officialSkin: "misaki",
    name: "れん",
    avatarVersion: "fixture-haru-v1",
    personality: "おだやか",
    interest: "ゲーム",
  },
] as const;
export const DevicePresetIdSchema = z.enum(["aoi", "kaede", "minato", "hinata", "yui", "ren"]);
export const DevicePresetUpdateSchema = z.strictObject({
  expectedRevision: z.number().int().nonnegative(),
  presetId: DevicePresetIdSchema,
  enabled: z.boolean(),
});
export type DevicePresetId = z.infer<typeof DevicePresetIdSchema>;

export const DeviceControlSchema = z.strictObject({
  schemaVersion: z.literal(1),
  mode: z.literal("MOCK"),
  serverId: z.uuid(),
  revision: z.number().int().nonnegative(),
  displayMode: CityModeEventSchema.shape.mode,
  motionEnabled: z.boolean(),
  updatedAt: z.iso.datetime(),
});
export const DeviceUpdateSchema = z
  .strictObject({
    expectedRevision: z.number().int().nonnegative(),
    displayMode: CityModeEventSchema.shape.mode.optional(),
    motionEnabled: z.boolean().optional(),
  })
  .refine((value) => value.displayMode !== undefined || value.motionEnabled !== undefined);
export const DeviceLoginSchema = z.strictObject({ key: z.string().min(1).max(256) });
export const DevicePairSchema = z.strictObject({ code: z.string().regex(/^\d{8}$/) });
export const DevicePairingSchema = z.strictObject({
  code: z.string().regex(/^\d{8}$/),
  expiresAt: z.iso.datetime(),
});
export const DeviceRemoveSchema = z.strictObject({
  residentId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
});
export const DeviceAdminSchema = z.strictObject({
  control: DeviceControlSchema,
  snapshot: CitySnapshotSchema,
  presetIds: z.array(DevicePresetIdSchema).max(20).default([]),
  pairedDisplays: z.number().int().nonnegative(),
  connectedDisplays: z.number().int().nonnegative(),
});
export const DeviceDisplaySchema = z
  .strictObject({
    control: DeviceControlSchema,
    snapshot: CitySnapshotSchema.nullable(),
    // Running count of everyone who joined publicly, including those who withdrew.
    totalParticipants: z.number().int().nonnegative().max(1_000_000).optional(),
  })
  .refine((value) =>
    value.control.displayMode === "MAINTENANCE" ? value.snapshot === null : value.snapshot !== null,
  );
export const DeviceOkSchema = z.strictObject({ mode: z.literal("MOCK") });
export const DeviceParticipantCounterResetSchema = z.strictObject({
  mode: z.literal("MOCK"),
  totalParticipants: z.number().int().nonnegative().max(1_000_000),
});
export const DeviceBootstrapSchema = z.strictObject({ key: z.string().min(32).max(256) });
export type DeviceControl = z.infer<typeof DeviceControlSchema>;
export type DeviceUpdate = z.infer<typeof DeviceUpdateSchema>;
export type DeviceAdmin = z.infer<typeof DeviceAdminSchema>;
export type DeviceDisplay = z.infer<typeof DeviceDisplaySchema>;
export const deviceControlFixture: DeviceControl = {
  schemaVersion: 1,
  mode: "MOCK",
  serverId: "00000000-0000-4000-8000-000000000001",
  revision: 0,
  displayMode: "DEMO",
  motionEnabled: true,
  updatedAt: "2026-10-19T00:00:00.000Z",
};
