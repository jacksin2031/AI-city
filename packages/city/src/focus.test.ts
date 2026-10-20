import { describe, expect, it } from "vitest";
import { focusCamera, projectResident, speechBounds } from "./focus";

describe("in-scene character focus", () => {
  it("enlarges the actual resident centrally for a profile and keeps welcome at its city position", () => {
    const actor = { x: 250, y: 365 };
    const camera = focusCamera(actor, "profile");
    expect(camera.zoom).toBe(2);
    expect(projectResident(actor, camera, 0.9)).toEqual({ x: 480, y: 490, scale: 1.8 });
    expect(projectResident(actor, focusCamera(actor, "welcome"), 1.1)).toEqual({
      x: 250,
      y: 365,
      scale: 1.1,
    });
    expect(focusCamera(actor, null)).toEqual({ zoom: 1, scrollX: 0, scrollY: 0 });
    expect(actor).toEqual({ x: 250, y: 365 });
  });

  it("keeps a compact speech panel above the head, inside the map", () => {
    for (const kind of ["profile", "welcome"] as const) {
      const actor = { x: 250, y: 365 };
      const pose = projectResident(actor, focusCamera(actor, kind), kind === "welcome" ? 1.1 : 0.9);
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
