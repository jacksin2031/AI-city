import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type Actor, createActor, stepActor } from "./simulation";
import type { TrafficData } from "./traffic-scene";
import { type CityPlaces, findPath, nearestWalkable, parseGrid, type World } from "./world";

const asset = (name: string) =>
  fileURLToPath(new URL(`../../../apps/web/public/city3d/${name}`, import.meta.url));

describe("exported traffic assets", () => {
  it("maps every simulated vehicle to an existing route and model and gives every route stops", () => {
    const data = JSON.parse(readFileSync(asset("traffic.json"), "utf8")) as TrafficData;
    const glb = readFileSync(asset("vehicles.glb"));
    const jsonLength = glb.readUInt32LE(12);
    const model = JSON.parse(glb.subarray(20, 20 + jsonLength).toString("utf8")) as {
      nodes: { name: string }[];
    };
    const names = new Set(model.nodes.map((node) => node.name));
    const routes = new Map(data.paths.map((path) => [path.name, path]));
    expect(data.vehicles.length).toBeGreaterThan(0);
    const cars = data.vehicles.filter((vehicle) => routes.get(vehicle.path)?.kind === "road");
    expect(cars).toHaveLength(41);
    expect(cars.filter((vehicle) => vehicle.sourceController)).toHaveLength(16);
    for (const road of data.paths.filter((path) => path.kind === "road")) {
      const onRoad = cars.filter((vehicle) => vehicle.path === road.name);
      expect(onRoad.length).toBeGreaterThanOrEqual(2);
      for (let i = 0; i < onRoad.length; i++)
        for (let j = i + 1; j < onRoad.length; j++)
          expect(Math.abs((onRoad[i]?.s ?? 0) - (onRoad[j]?.s ?? 0))).toBeGreaterThanOrEqual(7);
    }
    expect(data.pedestrianSignals.length).toBeGreaterThan(100);
    for (const signal of data.pedestrianSignals) {
      expect(["A", "B"]).toContain(signal.group);
      expect(Math.hypot(signal.dx, signal.dy)).toBeCloseTo(1, 2);
      expect(Number.isFinite(signal.height)).toBe(true);
    }
    for (const vehicle of data.vehicles) {
      const route = routes.get(vehicle.path);
      expect(route, vehicle.controller).toBeDefined();
      expect(route?.pts.length).toBeGreaterThan(1);
      if (route?.kind === "rail") {
        expect(route.stationCentre).toEqual(expect.any(Number));
        for (let i = 1; i <= (vehicle.cars ?? 0); i++)
          expect(names.has(`${vehicle.controller}_car${String(i).padStart(2, "0")}`)).toBe(true);
      } else {
        expect(names.has(`${vehicle.sourceController ?? vehicle.controller}_body`)).toBe(true);
        expect(route?.stops?.length).toBeGreaterThan(0);
      }
    }
  });
});

it("can stop a routed sample walker at an exported pedestrian signal", () => {
  const traffic = JSON.parse(readFileSync(asset("traffic.json"), "utf8")) as TrafficData;
  const places = JSON.parse(readFileSync(asset("places.json"), "utf8")) as CityPlaces;
  const buffer = readFileSync(asset("nav.bin"));
  const grid = parseGrid(
    places.grid,
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
  );
  let verified = false;
  for (const signal of traffic.pedestrianSignals.slice(0, 40)) {
    const start = nearestWalkable(
      grid,
      { x: signal.x - signal.dx * 3, y: signal.y - signal.dy * 3 },
      3,
    );
    const end = nearestWalkable(
      grid,
      { x: signal.x + signal.dx * 11, y: signal.y + signal.dy * 11 },
      3,
    );
    if (!start || !end) continue;
    const path = findPath(grid, start, end);
    if (!path.length) continue;
    const world: World = { grid, pois: [], spawns: [start] };
    let actor = { ...createActor(world, 0), ...start, action: "walk" as const, path } as Actor;
    for (let i = 0; i < 80 && actor.action === "walk"; i++) {
      actor = stepActor(world, actor, 0.25, true, { signals: [signal], time: 0 });
      if (actor.waitingForSignal) {
        verified = true;
        break;
      }
    }
    if (verified) break;
  }
  expect(verified).toBe(true);
});
