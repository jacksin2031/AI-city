/** Read-only navigation coverage audit. Never changes city assets or model state. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type CityPlaces,
  createWorld,
  findPath,
  kindAt,
  parseGrid,
} from "../packages/city/src/world";

const base = resolve(import.meta.dirname, "../apps/web/public/city3d");
const places = JSON.parse(readFileSync(resolve(base, "places.json"), "utf8")) as CityPlaces;
const nav = readFileSync(resolve(base, "nav.bin"));
const world = createWorld(parseGrid(places.grid, Uint8Array.from(nav).buffer), places.shops);
const grid = world.grid;
const start = world.spawns[0];
if (!start) throw Error("No resident spawn");
const at = (x: number, y: number) => Math.floor(y - grid.y0) * grid.width + Math.floor(x - grid.x0);
const seen = new Uint8Array(grid.width * grid.depth);
const queue = new Int32Array(grid.width * grid.depth);
const first = at(start.x, start.y);
seen[first] = 1;
queue[0] = first;
let head = 0,
  tail = 1,
  paved = 0;
const can = (a: number, b: number) =>
  b >= 0 &&
  b < seen.length &&
  (grid.kinds[b] ?? 0) !== 0 &&
  Math.abs((grid.heights[a] ?? 0) - (grid.heights[b] ?? 0)) <= 45;
while (head < tail) {
  const cur = queue[head++];
  if (cur === undefined) throw new Error("Queue underflow");
  if (grid.kinds[cur] === 1) paved++;
  const col = cur % grid.width,
    row = Math.floor(cur / grid.width);
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, 1],
  ]) {
    const c = col + dx,
      r = row + dy;
    if (c < 0 || c >= grid.width || r < 0 || r >= grid.depth) continue;
    const next = r * grid.width + c;
    if (seen[next] || !can(cur, next)) continue;
    if (dx && dy && (!can(cur, row * grid.width + c) || !can(cur, r * grid.width + col))) continue;
    seen[next] = 1;
    queue[tail++] = next;
  }
}
console.log(
  "GRID",
  grid.width,
  grid.depth,
  "SPAWN",
  start,
  "REACHABLE",
  tail,
  "PAVED",
  paved,
  "POIS",
  world.pois.length,
);
for (const poi of world.pois.filter(
  (p) => !/^(food|bar|cafe|health|music|books|tech|konbini|sport|other)-/.test(p.id),
)) {
  const index = at(poi.x, poi.y);
  const reachable = seen[index] === 1;
  console.log(
    "LANDMARK",
    poi.id,
    poi.x,
    poi.y,
    "kind",
    kindAt(grid, poi.x, poi.y),
    "reachable",
    reachable,
  );
}
if (process.argv.includes("--paths")) {
  for (const id of [
    "jr-hijiri",
    "jr-ocha",
    "photo",
    "bridge",
    "nikolai",
    "yushima",
    "riverwalk",
    "meiji",
    "hospital",
  ]) {
    const poi = world.pois.find((p) => p.id === id);
    if (!poi) continue;
    const begin = performance.now();
    const path = findPath(grid, start, poi);
    console.log(
      "PATH",
      id,
      "waypoints",
      path.length,
      "milliseconds",
      Math.round(performance.now() - begin),
    );
  }
}

console.log(
  "SPAWNS",
  world.spawns.map((point, index) => ({ index, point, main: seen[at(point.x, point.y)] === 1 })),
);
console.log("SOLACITY_NEIGHBOUR_PATCH");
for (let y = 94.5; y <= 104.5; y++) {
  let row = "";
  for (let x = 43.5; x <= 57.5; x++) {
    const kind = kindAt(grid, x, y);
    row += kind === 0 ? "X" : seen[at(x, y)] ? "o" : "!";
  }
  console.log(y, row);
}
