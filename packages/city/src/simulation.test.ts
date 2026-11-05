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
  it("prefers nearby destinations in the current view without teleporting", () => {
    const world = testWorld();
    const initial = createActor(world, 0);
    const walking = commandActor(world, initial, "walk", (point) => point.x < 5);
    expect(walking.goal).toBe("west");
    expect([walking.x, walking.y]).toEqual([initial.x, initial.y]);
    expect(walking.path.length).toBeGreaterThan(0);
  });
  it("does not choose a remote destination when a nearby option is available", () => {
    const world = testWorld();
    const first = world.pois[0];
    if (!first) throw new Error("Test destination missing");
    world.pois.push({ ...first, id: "remote", x: 1000, y: 1000 });
    for (let seed = 0; seed < 20; seed++) {
      const walking = commandActor(world, { ...createActor(world, 0), seed }, "walk");
      expect(walking.goal).not.toBe("remote");
    }
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

it("waits at a pedestrian signal on red or flashing green and resumes on steady green", () => {
  const world = testWorld();
  const actor = {
    ...createActor(world, 0),
    x: 4,
    y: 2.5,
    action: "walk" as const,
    path: [{ x: 9, y: 2.5 }],
  };
  const signals = [{ x: 6, y: 2.5, height: 0, dx: 1, dy: 0, group: "A" as const }];
  const red = stepActor(world, actor, 3, true, { signals, time: 5 });
  expect(red.x).toBeCloseTo(5);
  expect(red.waitingForSignal).toBe(true);
  expect(stepActor(world, red, 1, true, { signals, time: 32 }).x).toBeCloseTo(5);
  const green = stepActor(world, red, 1, true, { signals, time: 22 });
  expect(green.x).toBeGreaterThan(5);
  expect(green.waitingForSignal).toBe(false);
  // Once the person has entered the crossing, a red light must not trap them in the road.
  const inCrossing = { ...green, x: 6.5 };
  expect(stepActor(world, inCrossing, 1, true, { signals, time: 5 }).x).toBeGreaterThan(6.5);
});

it("does not stop for an unrelated direction or signal on another level", () => {
  const world = testWorld();
  const actor = {
    ...createActor(world, 0),
    x: 4,
    y: 2.5,
    action: "walk" as const,
    path: [{ x: 9, y: 2.5 }],
  };
  const signal = { x: 6, y: 2.5, height: 0, dx: -1, dy: 0, group: "A" as const };
  expect(stepActor(world, actor, 2, true, { signals: [signal], time: 5 }).x).toBeGreaterThan(6);
  expect(
    stepActor(world, actor, 2, true, { signals: [{ ...signal, dx: 1, height: 10 }], time: 5 }).x,
  ).toBeGreaterThan(6);
});
