import { describe, expect, it } from "vitest";
import { characterIllustration } from "./illustrations";
import { commandActor, createActor, stepActor } from "./simulation";
import { findPath, heightAt, nearestWalkable, type WalkGrid, type World } from "./world";

/** A 40 × 20 m block: footway around a building, with a 1 m step up on the east side. */
function testWorld(): World {
  const width = 40;
  const depth = 20;
  const kinds = new Uint8Array(width * depth).fill(1);
  const heights = new Int16Array(width * depth);
  for (let row = 0; row < depth; row++)
    for (let col = 0; col < width; col++) {
      if (col >= 10 && col < 30 && row >= 5 && row < 15) kinds[row * width + col] = 0;
      if (col >= 36) heights[row * width + col] = 100;
    }
  const grid: WalkGrid = { x0: 0, y0: 0, width, depth, kinds, heights };
  const poi = {
    activity: "visit" as const,
    heading: Math.PI / 2,
    seconds: 4,
    doing: "テスト中",
    place: "テスト",
  };
  return {
    grid,
    pois: [
      { ...poi, id: "west", x: 3.5, y: 10.5 },
      { ...poi, id: "east", x: 33.5, y: 10.5, activity: "sit" },
      { ...poi, id: "north", x: 20.5, y: 2.5 },
    ],
    spawns: [{ x: 5.5, y: 2.5 }],
  };
}

describe("walking on the exported grid", () => {
  it("routes around buildings and never climbs a wall", () => {
    const { grid } = testWorld();
    const path = findPath(grid, { x: 3.5, y: 10.5 }, { x: 33.5, y: 10.5 });
    expect(path.at(-1)).toEqual({ x: 33.5, y: 10.5 });
    let previous = { x: 3.5, y: 10.5 };
    for (const point of path) {
      // Every straight leg stays clear of the block in the middle.
      for (let t = 0; t <= 1; t += 0.02) {
        const x = previous.x + (point.x - previous.x) * t;
        const y = previous.y + (point.y - previous.y) * t;
        expect(x >= 10 && x < 30 && y >= 5 && y < 15).toBe(false);
      }
      previous = point;
    }
    expect(findPath(grid, { x: 3.5, y: 10.5 }, { x: 38.5, y: 10.5 })).toEqual([]);
    // Inside the block, the nearest footway is just outside its long side.
    const snapped = nearestWalkable(grid, { x: 20.3, y: 10 });
    expect(snapped?.x).toBe(20.5);
    expect([4.5, 15.5]).toContain(snapped?.y);
    expect(heightAt(grid, 38.5, 3.5)).toBeCloseTo(1);
    expect(heightAt(grid, 35.5, 3.5)).toBeCloseTo(0);
  });
});

describe("placeholder character behaviour", () => {
  it("walks towards the next destination but stays still when motion is paused", () => {
    const world = testWorld();
    const walking = commandActor(world, createActor(world, 0), "walk");
    expect(walking.action).toBe("walk");
    expect(walking.path.length).toBeGreaterThan(0);
    const next = stepActor(world, walking, 0.5, true);
    // Walking pace is 1.35 m/s.
    expect(Math.hypot(next.x - walking.x, next.y - walking.y)).toBeCloseTo(0.675, 2);
    expect(stepActor(world, walking, 5, false)).toEqual(walking);
    let actor = walking;
    for (let step = 0; step < 200 && actor.action === "walk"; step++)
      actor = stepActor(world, actor, 0.5, true);
    const goal = world.pois.find((poi) => poi.id === walking.goal);
    expect([actor.x, actor.y]).toEqual([goal?.x, goal?.y]);
    expect(actor.action).toBe(goal?.activity === "sit" ? "sit" : "visit");
  });
  it("turns through four directions without changing position", () => {
    const world = testWorld();
    const initial = createActor(world, 0);
    let actor = initial;
    const headings = new Set<number>();
    for (let index = 0; index < 4; index++) {
      actor = commandActor(world, actor, "turn");
      headings.add(
        Math.round((((actor.heading % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) * 100),
      );
    }
    expect(headings.size).toBe(4);
    expect(Math.cos(actor.heading)).toBeCloseTo(Math.cos(initial.heading));
    expect([actor.x, actor.y]).toEqual([initial.x, initial.y]);
  });
  it("finishes wave and preset talk actions without waiting for a model", () => {
    const world = testWorld();
    for (const action of ["wave", "talk"] as const) {
      const actor = commandActor(world, createActor(world, 0), action);
      expect(stepActor(world, actor, 3, true).action).toBe("idle");
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
