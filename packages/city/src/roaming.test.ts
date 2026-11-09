import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { commandActor, createActor, inCentralDistrict, stepActor } from "./simulation";
import { type CityPlaces, createWorld, findPath, kindAt, parseGrid } from "./world";

function realWorld() {
  const root = resolve(process.cwd(), "apps/web/public/city3d");
  const places = JSON.parse(readFileSync(resolve(root, "places.json"), "utf8")) as CityPlaces;
  const data = readFileSync(resolve(root, "nav.bin"));
  return createWorld(parseGrid(places.grid, Uint8Array.from(data).buffer), places.shops);
}

describe("landmark-to-landmark roaming on the exported city grid", () => {
  it("starts residents on walkable streets in the Sola City plaza", () => {
    const world = realWorld();
    expect(world.spawns.length).toBeGreaterThanOrEqual(8);
    for (const point of world.spawns) {
      expect(inCentralDistrict(point)).toBe(true);
      expect(kindAt(world.grid, point.x, point.y)).toBeGreaterThan(0);
    }
  });
  it("finds reachable destinations for the first residents beyond Sola City", () => {
    const world = realWorld();
    for (let index = 0; index < world.spawns.length; index++) {
      const actor = createActor(world, index);
      const walking = commandActor(world, actor, "walk");
      expect(walking.action, `spawn ${index} at ${actor.x},${actor.y}`).toBe("walk");
      const goal = world.pois.find((poi) => poi.id === walking.goal);
      expect(goal).toBeDefined();
      expect(walking.path.length).toBeGreaterThan(0);
    }
  });
  it("continues finding destinations across neighbourhoods after repeated trips", () => {
    const world = realWorld();
    for (let index = 0; index < Math.min(world.spawns.length, 6); index++) {
      let actor = createActor(world, index);
      for (let trip = 0; trip < 3; trip++) {
        const walking = commandActor(world, actor, "walk");
        expect(walking.action, `spawn ${index}, trip ${trip}`).toBe("walk");
        const goal = world.pois.find((poi) => poi.id === walking.goal);
        expect(goal).toBeDefined();
        actor = stepActor(world, walking, 1000, true);
      }
    }
  });

  it("reaches both JR station entrances from the Sola City area over walkable ground", () => {
    const world = realWorld();
    const sola = world.pois.find((poi) => poi.id === "sola-plaza");
    const station = world.pois.find((poi) => poi.id === "jr-hijiri");
    const westEntrance = world.pois.find((poi) => poi.id === "jr-ocha");
    expect(sola).toBeDefined();
    expect(station).toBeDefined();
    expect(westEntrance).toBeDefined();
    if (!sola || !station || !westEntrance) return;
    for (const [from, to] of [
      [sola, station],
      [station, westEntrance],
      [westEntrance, sola],
    ] as const) {
      const path = findPath(world.grid, from, to);
      expect(path.length, `missing walking route: ${from.id} -> ${to.id}`).toBeGreaterThan(0);
      let current: { x: number; y: number } = from;
      for (const next of path) {
        const length = Math.hypot(next.x - current.x, next.y - current.y);
        for (let step = 0; step <= Math.ceil(length * 2); step++) {
          const t = step / Math.max(1, Math.ceil(length * 2));
          const x = current.x + (next.x - current.x) * t;
          const y = current.y + (next.y - current.y) * t;
          expect(
            kindAt(world.grid, x, y),
            `route crosses blocked ground at ${x},${y}`,
          ).toBeGreaterThan(0);
        }
        current = next;
      }
    }
  });

  it("sometimes visits the JR station instead of remaining in the Sola City plaza", () => {
    const world = realWorld();
    const visited = new Set<string>();
    for (let index = 0; index < world.spawns.length; index++) {
      let actor = createActor(world, index);
      for (let trip = 0; trip < 4; trip++) {
        const walking = commandActor(world, actor, "walk");
        if (walking.action !== "walk") break;
        if (walking.goal) visited.add(walking.goal);
        actor = stepActor(world, walking, 2000, true);
      }
    }
    expect(visited.has("jr-hijiri")).toBe(true);
    expect([...visited].some((id) => id.startsWith("jr-") || id === "photo")).toBe(true);
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
