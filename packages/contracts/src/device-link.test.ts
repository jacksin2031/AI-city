import { describe, expect, it } from "vitest";
import { developmentCitySnapshot } from "./development";
import {
  DeviceAdminSchema,
  DeviceDisplaySchema,
  DeviceParticipantCounterResetSchema,
  DevicePresetUpdateSchema,
  DeviceUpdateSchema,
  deviceControlFixture,
  PRESET_CHARACTERS,
} from "./device-link";

describe("mobile/tablet link contracts", () => {
  it("accepts versioned control updates and refuses empty, stale-shape or private input", () => {
    expect(DeviceUpdateSchema.parse({ expectedRevision: 0, displayMode: "DEMO" }).displayMode).toBe(
      "DEMO",
    );
    for (const input of [
      { expectedRevision: 0 },
      { expectedRevision: -1, motionEnabled: true },
      { expectedRevision: 0, photo: "private" },
      { expectedRevision: 0, displayMode: "CLOUD_AI" },
    ])
      expect(() => DeviceUpdateSchema.parse(input)).toThrow();
  });
  it("requires explicit demo/live/maintenance envelopes without private fields", () => {
    expect(
      DeviceDisplaySchema.parse({
        control: deviceControlFixture,
        snapshot: developmentCitySnapshot,
      }).control.mode,
    ).toBe("MOCK");
    expect(() =>
      DeviceDisplaySchema.parse({
        control: deviceControlFixture,
        snapshot: { ...developmentCitySnapshot, token: "private" },
      }),
    ).toThrow();
    expect(() =>
      DeviceDisplaySchema.parse({
        control: { ...deviceControlFixture, displayMode: "MAINTENANCE" },
        snapshot: developmentCitySnapshot,
      }),
    ).toThrow();
  });
});

it("validates preset IDs, rejects private fields and accepts legacy admin responses", () => {
  const legacy = {
    control: deviceControlFixture,
    snapshot: developmentCitySnapshot,
    pairedDisplays: 0,
    connectedDisplays: 0,
  };
  expect(DeviceAdminSchema.parse(legacy).presetIds).toEqual([]);
  for (const preset of PRESET_CHARACTERS)
    expect(
      DevicePresetUpdateSchema.parse({ expectedRevision: 0, presetId: preset.id, enabled: true })
        .presetId,
    ).toBe(preset.id);
  expect(() =>
    DevicePresetUpdateSchema.parse({ expectedRevision: 0, presetId: "unknown", enabled: true }),
  ).toThrow();
  expect(() =>
    DevicePresetUpdateSchema.parse({
      expectedRevision: 0,
      presetId: "aoi",
      enabled: true,
      photo: "private",
    }),
  ).toThrow();
  expect(DeviceAdminSchema.parse({ ...legacy, presetIds: ["aoi", "aoi"] }).presetIds).toHaveLength(
    2,
  );
  expect(() => DeviceAdminSchema.parse({ ...legacy, presetIds: Array(21).fill("aoi") })).toThrow();
});

it("validates participant counter reset responses", () => {
  expect(
    DeviceParticipantCounterResetSchema.parse({ mode: "MOCK", totalParticipants: 0 })
      .totalParticipants,
  ).toBe(0);
  expect(() =>
    DeviceParticipantCounterResetSchema.parse({ mode: "MOCK", totalParticipants: -1 }),
  ).toThrow();
  expect(() =>
    DeviceParticipantCounterResetSchema.parse({
      mode: "MOCK",
      totalParticipants: 0,
      token: "private",
    }),
  ).toThrow();
});
