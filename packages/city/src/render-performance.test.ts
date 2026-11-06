import { describe, expect, it } from "vitest";
import {
  CHARACTER_REFRESH_SECONDS,
  cityPixelRatio,
  cityShadowMapSize,
  shouldDegradeCityQuality,
  shouldDrawCharacter,
} from "./render-performance";

describe("tablet 3D render performance", () => {
  it("caps high-DPI drawing without upscaling low-DPI screens", () => {
    expect(cityPixelRatio(3)).toBe(1.5);
    expect(cityPixelRatio(2)).toBe(1.5);
    expect(cityPixelRatio(1.25)).toBe(1.25);
    expect(cityPixelRatio(0.75)).toBe(1);
    expect(cityPixelRatio(Number.NaN)).toBe(1);
  });

  it("uses smaller shadow maps on narrow screens and respects the GPU limit", () => {
    expect(cityShadowMapSize(800, 4096)).toBe(1024);
    expect(cityShadowMapSize(1200, 4096)).toBe(2048);
    expect(cityShadowMapSize(1200, 1024)).toBe(1024);
  });

  it("redraws the first Spine frame and changed poses immediately", () => {
    expect(shouldDrawCharacter(-Infinity, "", "idle-front", 0, false)).toBe(true);
    expect(shouldDrawCharacter(0, "idle-front", "wave-front", 0.01, true)).toBe(true);
    expect(shouldDrawCharacter(0, "idle-front", "idle-back", 0.01, false)).toBe(true);
  });

  it("skips unchanged canvas uploads at 30fps and freezes still characters", () => {
    expect(shouldDrawCharacter(0, "idle-front", "idle-front", 1 / 30, true)).toBe(false);
    expect(
      shouldDrawCharacter(0, "idle-front", "idle-front", CHARACTER_REFRESH_SECONDS, true),
    ).toBe(true);
    expect(shouldDrawCharacter(0, "idle-front", "idle-front", 10, false)).toBe(false);
  });

  it("degrades only after sustained low frame throughput", () => {
    expect(shouldDegradeCityQuality(3000, 90, 1 / 30)).toBe(false);
    expect(shouldDegradeCityQuality(3000, 72, 1 / 30)).toBe(false);
    expect(shouldDegradeCityQuality(3000, 60, 1 / 30)).toBe(true);
    expect(shouldDegradeCityQuality(3000, 0, 1 / 30)).toBe(false);
  });
});
