import { z } from "zod";
import { CitySnapshotSchema } from "./development";
import { CityModeEventSchema } from "./index";

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
  pairedDisplays: z.number().int().nonnegative(),
  connectedDisplays: z.number().int().nonnegative(),
});
export const DeviceDisplaySchema = z
  .strictObject({
    control: DeviceControlSchema,
    snapshot: CitySnapshotSchema.nullable(),
  })
  .refine((value) =>
    value.control.displayMode === "MAINTENANCE" ? value.snapshot === null : value.snapshot !== null,
  );
export const DeviceOkSchema = z.strictObject({ mode: z.literal("MOCK") });
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
