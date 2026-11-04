import { describe, expect, it } from "vitest";
import { autumnLighting, timeOfDay } from "./autumn";

const at = (hour: number, minute = 0) => new Date(2026, 10, 2, hour, minute);

describe("autumn lighting", () => {
  it("uses the device local time for morning, afternoon, dusk and night", () => {
    expect(timeOfDay(at(5, 59))).toBe("night");
    expect(timeOfDay(at(6))).toBe("morning");
    expect(timeOfDay(at(10))).toBe("afternoon");
    expect(timeOfDay(at(16))).toBe("dusk");
    expect(timeOfDay(at(19))).toBe("night");
    expect(timeOfDay(at(23))).toBe("night");
  });
  it("blends gradually during the half hour before a change", () => {
    const night = autumnLighting(at(5, 30));
    const middle = autumnLighting(at(5, 45));
    const morning = autumnLighting(at(6));
    expect(middle.hemisphereIntensity).toBeGreaterThan(night.hemisphereIntensity);
    expect(middle.hemisphereIntensity).toBeLessThan(morning.hemisphereIntensity);
    expect(autumnLighting(at(6, 30)).hemisphereIntensity).toBe(morning.hemisphereIntensity);
  });
  it("keeps all four simulated periods distinct and the night scene lit", () => {
    const presets = [at(8), at(13), at(17), at(22)].map(autumnLighting);
    expect(new Set(presets.map((preset) => preset.sun.getHex())).size).toBe(4);
    expect(presets[3]?.hemisphereIntensity).toBeGreaterThan(0);
    expect(presets[3]?.sunIntensity).toBeGreaterThan(0);
  });
});
