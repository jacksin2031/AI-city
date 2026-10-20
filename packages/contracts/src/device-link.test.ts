import { describe, expect, it } from "vitest";
import { developmentCitySnapshot } from "./development";
import { DeviceDisplaySchema, DeviceUpdateSchema, deviceControlFixture } from "./device-link";

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
