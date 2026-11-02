import { describe, expect, it } from "vitest";
import {
  DEFAULT_ZOOM,
  focusCamera,
  PROFILE_MAGNIFICATION,
  panCamera,
  project,
  projectResident,
  speechBounds,
  VIEW,
} from "./focus";

const base = { centerX: -90, centerY: 0, height: 12, zoom: DEFAULT_ZOOM };

describe("in-scene character focus", () => {
  it("enlarges the actual resident under the card for a profile and leaves the tour view alone", () => {
    const actor = { x: 70, y: 110, height: 13.5 };
    const camera = focusCamera(actor, "profile", base);
    expect(camera.zoom).toBe(DEFAULT_ZOOM * PROFILE_MAGNIFICATION);
    const pose = projectResident(actor, camera, 0.02);
    expect(pose.x).toBeCloseTo(480);
    expect(pose.y).toBeCloseTo(490);
    expect(pose.scale).toBeCloseTo(0.02 * camera.zoom);
    expect(focusCamera(actor, null, base)).toEqual(base);
    expect(actor).toEqual({ x: 70, y: 110, height: 13.5 });
  });

  it("looks from the north-west: east runs down-right, south down-left, height straight up", () => {
    const origin = project({ x: base.centerX, y: base.centerY, height: base.height }, base);
    expect(origin).toEqual({ x: 480, y: 300 });
    const east = project({ x: base.centerX + 1, y: base.centerY, height: base.height }, base);
    const south = project({ x: base.centerX, y: base.centerY + 1, height: base.height }, base);
    const up = project({ x: base.centerX, y: base.centerY, height: base.height + 1 }, base);
    expect(east.x).toBeLessThan(480);
    expect(south.x).toBeGreaterThan(480);
    expect(east.y).toBeLessThan(300);
    expect(south.y).toBeCloseTo(east.y);
    expect(up.x).toBeCloseTo(480);
    expect(up.y).toBeCloseTo(300 - DEFAULT_ZOOM * VIEW.up.height);
  });

  it("pans so the ground under the finger follows the drag", () => {
    const ground = { x: -80, y: 15, height: base.height };
    const before = project(ground, base);
    const moved = panCamera(base, 40, -25);
    const after = project(ground, moved);
    expect(after.x - before.x).toBeCloseTo(40);
    expect(after.y - before.y).toBeCloseTo(-25);
  });

  it("keeps a compact speech panel above the head, inside the map", () => {
    for (const kind of ["profile", "welcome"] as const) {
      const actor = { x: 70, y: 110, height: 13.5 };
      const pose = projectResident(actor, focusCamera(actor, kind, base), 0.02);
      const bubble = speechBounds(pose, kind);
      expect(bubble.y + bubble.height).toBeLessThan(pose.y - pose.scale * 128);
      expect(bubble.width * bubble.height).toBeLessThan(960 * 600 * 0.18);
      expect(bubble.x).toBeGreaterThanOrEqual(8);
      expect(bubble.y).toBeGreaterThanOrEqual(8);
      expect(bubble.x + bubble.width).toBeLessThanOrEqual(952);
    }
    expect(speechBounds({ x: 20, y: 365, scale: 1.1 }, "welcome").x).toBe(8);
    expect(speechBounds({ x: 950, y: 505, scale: 1.1 }, "welcome").x).toBe(640);
  });
});
