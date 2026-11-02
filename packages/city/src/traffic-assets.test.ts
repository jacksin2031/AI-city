import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { TrafficData } from "./traffic-scene";

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
    for (const vehicle of data.vehicles) {
      const route = routes.get(vehicle.path);
      expect(route, vehicle.controller).toBeDefined();
      expect(route?.pts.length).toBeGreaterThan(1);
      if (route?.kind === "rail") {
        expect(route.stationCentre).toEqual(expect.any(Number));
        for (let i = 1; i <= (vehicle.cars ?? 0); i++)
          expect(names.has(`${vehicle.controller}_car${String(i).padStart(2, "0")}`)).toBe(true);
      } else {
        expect(names.has(`${vehicle.controller}_body`)).toBe(true);
        expect(route?.stops?.length).toBeGreaterThan(0);
      }
    }
  });
});
