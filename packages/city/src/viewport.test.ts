import { describe, expect, it } from "vitest";
import { cityViewport, clampSpeechToViewport } from "./viewport";

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
});

it("keeps a profile card inside the visible portion of a cropped tablet scene", () => {
  const bounds = clampSpeechToViewport({ x: 8, y: 8, width: 420, height: 220 }, 768, 1024);
  expect(bounds.x).toBeGreaterThan(250);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(960 - bounds.x);
  expect(bounds.y).toBeGreaterThanOrEqual(8);
});
