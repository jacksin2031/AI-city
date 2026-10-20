import { developmentCitySnapshot } from "@ai-city/contracts/development";
import { type DeviceDisplay, deviceControlFixture } from "@ai-city/contracts/device-link";
import { describe, expect, it } from "vitest";
import { mergeDeviceState } from "./device-state";

const previous: DeviceDisplay = {
  control: deviceControlFixture,
  snapshot: { ...developmentCitySnapshot, eventSeq: 10, residents: [], avatars: [] },
};
describe("device snapshot and control ordering", () => {
  it("accepts a newer control without resurrecting a withdrawn resident from an older snapshot", () => {
    const next = {
      control: { ...deviceControlFixture, revision: 1, motionEnabled: false },
      snapshot: developmentCitySnapshot,
    };
    const merged = mergeDeviceState(previous, next);
    expect(merged.control.motionEnabled).toBe(false);
    expect(merged.control.revision).toBe(1);
    expect(merged.snapshot?.eventSeq).toBe(10);
    expect(merged.snapshot?.residents).toEqual([]);
  });
  it("rejects old controls and accepts maintenance null and replacement streams", () => {
    const current = { ...previous, control: { ...deviceControlFixture, revision: 2 } };
    expect(mergeDeviceState(current, previous)).toBe(current);
    const paused: DeviceDisplay = {
      control: { ...current.control, revision: 3, displayMode: "MAINTENANCE" },
      snapshot: null,
    };
    expect(mergeDeviceState(current, paused).snapshot).toBeNull();
    const restart = {
      ...previous,
      control: { ...deviceControlFixture, serverId: "replacement" },
      snapshot: developmentCitySnapshot,
    };
    expect(mergeDeviceState(current, restart)).toBe(restart);
  });
});
