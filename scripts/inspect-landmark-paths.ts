import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type CityPlaces, createWorld, findPath, parseGrid } from "../packages/city/src/world";

const base = resolve(import.meta.dirname, "../apps/web/public/city3d");
const meta = JSON.parse(readFileSync(resolve(base, "places.json"), "utf8")) as CityPlaces;
const bytes = readFileSync(resolve(base, "nav.bin"));
const world = createWorld(parseGrid(meta.grid, Uint8Array.from(bytes).buffer), meta.shops);
const ids = [
  "plaza-north",
  "plaza-west",
  "plaza-centre",
  "plaza-south",
  "dhu",
  "subway",
  "jr-hijiri",
  "jr-ocha",
  "photo",
  "bridge",
  "nikolai",
  "yushima",
  "riverwalk",
  "hospital",
  "meiji",
];
const origins = ["plaza-north", "jr-hijiri", "jr-ocha", "photo", "nikolai"];
for (const from of origins) {
  const a = world.pois.find((x) => x.id === from);
  if (!a) throw new Error("Missing origin landmark");
  for (const to of ids) {
    const b = world.pois.find((x) => x.id === to);
    if (!b || from === to) continue;
    const start = performance.now();
    const route = findPath(world.grid, a, b);
    console.log(
      from,
      to,
      route.length > 0 ? "OK" : "FAIL",
      "waypoints",
      route.length,
      "ms",
      Math.round(performance.now() - start),
    );
  }
}
