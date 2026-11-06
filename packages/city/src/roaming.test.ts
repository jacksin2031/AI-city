import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { commandActor, createActor, inCentralDistrict, stepActor } from "./simulation";
import { type CityPlaces, createWorld, kindAt, parseGrid } from "./world";

function realWorld() {
  const root = resolve(process.cwd(), "apps/web/public/city3d");
  const places = JSON.parse(readFileSync(resolve(root, "places.json"), "utf8")) as CityPlaces;
  const data = readFileSync(resolve(root, "nav.bin"));
  return createWorld(parseGrid(places.grid, Uint8Array.from(data).buffer), places.shops);
}

describe("central district roaming on the exported city grid", () => {
  it("starts residents on walkable streets near the station and bridges", () => {
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
      expect(goal && inCentralDistrict(goal)).toBe(true);
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
        expect(goal && inCentralDistrict(goal)).toBe(true);
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
