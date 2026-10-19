import { describe, expect, it } from "vitest";
import { characterIllustration } from "./illustrations";
import { commandActor, createActor, stepActor } from "./simulation";

describe("placeholder character behaviour", () => {
  it("walks towards the next waypoint but stays still when motion is paused", () => {
    const walking = commandActor(createActor(0), "walk");
    const next = stepActor(walking, 0.5, true);
    expect(next.x).toBeGreaterThan(walking.x);
    expect(next.y).toBe(walking.y);
    expect(stepActor(walking, 5, false)).toEqual(walking);
  });
  it("turns through four directions without changing position", () => {
    const initial = createActor(0);
    let actor = initial;
    const directions = new Set([actor.direction]);
    for (let index = 0; index < 4; index++) {
      actor = commandActor(actor, "turn");
      directions.add(actor.direction);
    }
    expect(directions.size).toBe(4);
    expect(actor.direction).toBe(initial.direction);
    expect([actor.x, actor.y]).toEqual([initial.x, initial.y]);
  });
  it("finishes wave and preset talk actions without waiting for a model", () => {
    for (const action of ["wave", "talk"] as const) {
      const actor = commandActor(createActor(0), action);
      expect(stepActor(actor, 3, true).action).toBe("idle");
    }
  });
  it("does not interpolate a supplied avatar identifier into SVG markup", () => {
    const illustration = characterIllustration(
      '<script>alert("private")</script>',
      "front",
      "idle",
      0,
    );
    expect(illustration).toContain("<svg");
    expect(illustration).not.toContain("<script");
    expect(illustration).not.toContain("private");
    expect(illustration).not.toContain("foreignObject");
  });
});
