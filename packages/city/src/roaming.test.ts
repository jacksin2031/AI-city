import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  commandActor,
  createActor,
  inCentralDistrict,
  inRoamingDistrict,
  stepActor,
} from "./simulation";
import { type CityPlaces, createWorld, findPath, kindAt, parseGrid } from "./world";

function realWorld() {
  const root = resolve(process.cwd(), "apps/web/public/city3d");
  const places = JSON.parse(readFileSync(resolve(root, "places.json"), "utf8")) as CityPlaces;
  const data = readFileSync(resolve(root, "nav.bin"));
  return createWorld(parseGrid(places.grid, Uint8Array.from(data).buffer), places.shops);
}

describe("central district roaming on the exported city grid", () => {
  it("starts residents on walkable streets in the Sola City plaza", () => {
    const world = realWorld();
    expect(world.spawns.length).toBeGreaterThanOrEqual(8);
    for (const point of world.spawns) {
      expect(inCentralDistrict(point)).toBe(true);
      expect(kindAt(world.grid, point.x, point.y)).toBeGreaterThan(0);
    }
  });
  it("finds reachable central destinations for the first residents", () => {
    const world = realWorld();
    for (let index = 0; index < world.spawns.length; index++) {
      const actor = createActor(world, index);
      const walking = commandActor(world, actor, "walk");
      expect(walking.action, `spawn ${index} at ${actor.x},${actor.y}`).toBe("walk");
      const goal = world.pois.find((poi) => poi.id === walking.goal);
      expect(goal && inRoamingDistrict(goal)).toBe(true);
      expect(walking.path.length).toBeGreaterThan(0);
    }
  });
  it("continues finding local destinations after repeated trips", () => {
    const world = realWorld();
    for (let index = 0; index < Math.min(world.spawns.length, 6); index++) {
      let actor = createActor(world, index);
      for (let trip = 0; trip < 3; trip++) {
        const walking = commandActor(world, actor, "walk");
        expect(walking.action, `spawn ${index}, trip ${trip}`).toBe("walk");
        const goal = world.pois.find((poi) => poi.id === walking.goal);
        expect(goal && inRoamingDistrict(goal)).toBe(true);
        actor = stepActor(world, walking, 1000, true);
      }
    }
  });

  it("keeps planned routes on paved ground instead of the gaps between buildings", () => {
    const world = realWorld();
    let paved = 0;
    let open = 0;
    for (let index = 0; index < Math.min(world.spawns.length, 12); index++) {
      let actor = createActor(world, index);
      for (let trip = 0; trip < 5; trip++) {
        const walking = commandActor(world, actor, "walk");
        if (walking.action !== "walk") break;
        for (const point of walking.path)
          if (kindAt(world.grid, point.x, point.y) === 1) paved++;
          else if (kindAt(world.grid, point.x, point.y) === 2) open++;
        actor = stepActor(world, walking, 4000, true);
      }
    }
    expect(paved + open).toBeGreaterThan(40);
    // Open ground is what hides the gaps between buildings, so routes must clearly avoid it.
    expect(paved / (paved + open)).toBeGreaterThan(0.6);
  });
});

describe("expanded roaming across proven existing Ochanomizu paths", () => {
  it("periodically leaves Sola City for multiple other districts", () => {
    const world = realWorld();
    const destinations = new Set<string>();
    let extended = 0;
    for (let index = 0; index < 24; index++) {
      const actor = createActor(world, index);
      const first = commandActor(world, actor, "walk");
      expect(first.action).toBe("walk");
      const goal = world.pois.find((poi) => poi.id === first.goal);
      if (!goal) throw new Error("Missing first-trip goal");
      expect(inRoamingDistrict(goal)).toBe(true);
      if (goal && !inCentralDistrict(goal)) {
        extended++;
        destinations.add(goal.id);
      }
    }
    expect(extended).toBeGreaterThanOrEqual(4);
    expect(destinations.size).toBeGreaterThanOrEqual(3);
  });

  it("reaches both JR exits, bridges and verified surrounding landmarks via the real grid", () => {
    const world = realWorld();
    const origin = world.pois.find((poi) => poi.id === "plaza-north");
    if (!origin) throw new Error("Missing central origin");
    let paved = 0;
    let samples = 0;
    for (const id of [
      "jr-hijiri",
      "jr-ocha",
      "bridge",
      "photo",
      "nikolai",
      "yushima",
      "riverwalk",
      "meiji",
      "hospital",
    ]) {
      const target = world.pois.find((poi) => poi.id === id);
      if (!target) throw new Error("Missing destination: " + id);
      const path = findPath(world.grid, origin, target);
      expect(path.length, id).toBeGreaterThan(0);
      let previous: { x: number; y: number } = origin;
      for (const point of path) {
        const length = Math.hypot(point.x - previous.x, point.y - previous.y);
        for (let n = 0; n <= Math.ceil(length * 2); n++) {
          const t = n / Math.max(1, Math.ceil(length * 2));
          const x = previous.x + (point.x - previous.x) * t;
          const y = previous.y + (point.y - previous.y) * t;
          const kind = kindAt(world.grid, x, y);
          expect(kind, `${id} invalid path at ${x},${y}`).toBeGreaterThan(0);
          if (kind === 1) paved++;
          samples++;
        }
        previous = point;
      }
    }
    expect(samples).toBeGreaterThan(150);
    expect(paved / samples).toBeGreaterThan(0.6);
  });

  it("visits non-plaza locations during repeated deterministic long-range tours", () => {
    const world = realWorld();
    const reached = new Set<string>();
    for (let index = 0; index < 12; index++) {
      let actor = createActor(world, index);
      for (let trip = 0; trip < 5; trip++) {
        const walking = commandActor(world, actor, "walk");
        expect(walking.action).toBe("walk");
        const goal = world.pois.find((poi) => poi.id === walking.goal);
        if (goal && !inCentralDistrict(goal)) reached.add(goal.id);
        actor = stepActor(world, walking, 1200, true);
      }
    }
    expect(reached.size).toBeGreaterThanOrEqual(6);
  });
});

it("keeps all original plaza spawns and the Sola plaza POI connected to the city", () => {
  const world = realWorld();
  const origin = world.spawns[0];
  if (!origin) throw new Error("No plaza spawn");
  for (const spawn of world.spawns)
    expect(findPath(world.grid, origin, spawn).length, "disconnected spawn").toBeGreaterThan(0);
  const plaza = world.pois.find((poi) => poi.id === "sola-plaza");
  if (!plaza) throw new Error("Missing Sola plaza landmark");
  expect(findPath(world.grid, origin, plaza).length).toBeGreaterThan(0);
});
