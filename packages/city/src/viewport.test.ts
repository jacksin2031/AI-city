import { describe, expect, it } from "vitest";
import {
  cityViewport,
  clampSpeechToViewport,
  nextResidentTourIndex,
  nextVisibleTourIndex,
  pointInVisibleCity,
} from "./viewport";

describe("city viewport", () => {
  it("fills a 4:3 tablet without distorting the 960:600 scene", () => {
    const layout = cityViewport(1024, 768, true);
    expect(layout.height).toBe(768);
    expect(layout.width).toBeCloseTo(1228.8);
    expect(layout.left).toBeCloseTo(-102.4);
    expect(layout.top).toBe(0);
  });
  it("fills a wide display and keeps its crop centred", () => {
    const layout = cityViewport(1920, 1080, true);
    expect(layout.width).toBe(1920);
    expect(layout.height).toBe(1200);
    expect(layout.top).toBe(-60);
  });
  it("keeps the existing contained view for the sample page", () => {
    const layout = cityViewport(1024, 768, false);
    expect(layout.width).toBe(1024);
    expect(layout.height).toBe(640);
    expect(layout.top).toBe(64);
  });
  it("excludes points hidden by portrait cropping and includes the central street", () => {
    expect(pointInVisibleCity({ x: 480, y: 300 }, 768, 1024, true)).toBe(true);
    expect(pointInVisibleCity({ x: 30, y: 300 }, 768, 1024, true)).toBe(false);
    expect(pointInVisibleCity({ x: 480, y: 5 }, 768, 1024, true)).toBe(false);
  });
  it("skips tour stops with no visible resident and returns null when none fit", () => {
    expect(nextVisibleTourIndex(0, 4, (index) => index === 2)).toBe(2);
    expect(nextVisibleTourIndex(2, 4, (index) => index === 0)).toBe(0);
    expect(nextVisibleTourIndex(0, 4, () => false)).toBeNull();
  });
  it("walks the participants so the tour moves on to the next person each time", () => {
    const ids = ["a", "b", "c"];
    expect(nextResidentTourIndex(ids, null)).toBe(0);
    expect(nextResidentTourIndex(ids, "a")).toBe(1);
    expect(nextResidentTourIndex(ids, "b")).toBe(2);
    expect(nextResidentTourIndex(ids, "c")).toBe(0);
    // A resident who left the scene no longer appears in the list, so the tour restarts
    // from the front instead of sticking on a stale id.
    expect(nextResidentTourIndex(["b", "c"], "a")).toBe(0);
    expect(nextResidentTourIndex(["only"], "only")).toBe(0);
    expect(nextResidentTourIndex([], null)).toBeNull();
  });
});

it("keeps a profile card inside the visible portion of a cropped tablet scene", () => {
  const bounds = clampSpeechToViewport({ x: 8, y: 8, width: 420, height: 220 }, 768, 1024);
  expect(bounds.x).toBeGreaterThan(250);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(960 - bounds.x);
  expect(bounds.y).toBeGreaterThanOrEqual(8);
});
