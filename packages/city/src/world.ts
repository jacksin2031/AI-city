// Ochanomizu in metres, exported from the Blender scene by scripts/blender/export-ochanomizu.py.
// x grows east, y grows south (Blender's −Y) and heights are metres above the scene origin.
// Residents walk on a 1 m grid rasterised from the scene's footways, plazas and streets.

export type Point = { x: number; y: number };
export type PoiActivity = "sit" | "visit" | "stand";
export type Poi = {
  id: string;
  x: number;
  y: number;
  activity: PoiActivity;
  /** Direction the resident faces while there, in radians: 0 east, π/2 south. */
  heading: number;
  seconds: number;
  /** Shown on the profile card while the resident is here. */
  doing: string;
  /** Shown while walking towards it. */
  place: string;
};

/** Walk-grid cell kinds: 0 blocked, then footway, open ground, lawn, side street, main road. */
export type WalkGrid = {
  x0: number;
  y0: number;
  width: number;
  depth: number;
  kinds: Uint8Array;
  /** Ground height of each cell in centimetres. */
  heights: Int16Array;
};
export type Shopfront = { kind: string; x: number; z: number; y: number; nx: number; nz: number };
export type CityPlaces = {
  grid: { x0: number; z0: number; width: number; depth: number; cell: number };
  vehicleLoopSeconds: number;
  shops: Shopfront[];
};
export type World = { grid: WalkGrid; pois: Poi[]; spawns: Point[] };

/** Extent of the exported terrain. */
export const BOUNDS = { x0: -480, y0: -390, width: 790, depth: 730 } as const;

/**
 * Relative effort of walking one metre over each cell kind. Footways are the intended route, so
 * they are cheapest; open ground is markedly more expensive because it includes the unmarked gaps
 * between buildings, and a resident should only cross it when there is no footway alternative.
 * Streets are crossed rather than followed.
 */
const COST = [0, 1, 4, 2.5, 3.5, 9];
/** Kerbs and steps are fine; anything taller is a wall, an embankment or a bridge edge. */
const MAX_STEP_CM = 45;
/**
 * Extra metres of apparent distance that make a walker prefer a footway over open ground.
 * Open ground includes the unmarked gaps between buildings, so it should only be chosen when
 * nothing paved is anywhere near.
 */
const OPEN_GROUND_AVOIDANCE = 10;

export function parseGrid(meta: CityPlaces["grid"], data: ArrayBuffer): WalkGrid {
  const cells = meta.width * meta.depth;
  if (data.byteLength < cells * 3) throw new Error("Walk grid is incomplete");
  return {
    x0: meta.x0,
    y0: meta.z0,
    width: meta.width,
    depth: meta.depth,
    kinds: new Uint8Array(data, 0, cells),
    // The heights start at an odd offset when the width × depth is odd, so copy them out.
    heights: new Int16Array(data.slice(cells, cells * 3)),
  };
}

function cellOf(grid: WalkGrid, x: number, y: number) {
  const col = Math.floor(x - grid.x0);
  const row = Math.floor(y - grid.y0);
  if (col < 0 || row < 0 || col >= grid.width || row >= grid.depth) return -1;
  return row * grid.width + col;
}
const centre = (grid: WalkGrid, index: number): Point => ({
  x: grid.x0 + (index % grid.width) + 0.5,
  y: grid.y0 + Math.floor(index / grid.width) + 0.5,
});

export function kindAt(grid: WalkGrid, x: number, y: number) {
  const index = cellOf(grid, x, y);
  return index < 0 ? 0 : (grid.kinds[index] ?? 0);
}

/** Ground height in metres, blended between cells so walkers glide over slopes. */
export function heightAt(grid: WalkGrid, x: number, y: number): number {
  const fx = Math.min(grid.width - 1.001, Math.max(0, x - grid.x0 - 0.5));
  const fy = Math.min(grid.depth - 1.001, Math.max(0, y - grid.y0 - 0.5));
  const col = Math.floor(fx);
  const row = Math.floor(fy);
  const at = (c: number, r: number) => (grid.heights[r * grid.width + c] ?? 0) / 100;
  const here = at(col, row);
  // Do not blend across a wall: a resident beside the river stays at street level.
  const near = (value: number) => (Math.abs(value - here) < MAX_STEP_CM / 100 ? value : here);
  const tx = fx - col;
  const ty = fy - row;
  const top = here * (1 - tx) + near(at(col + 1, row)) * tx;
  const bottom = near(at(col, row + 1)) * (1 - tx) + near(at(col + 1, row + 1)) * tx;
  return top * (1 - ty) + bottom * ty;
}

/** The walkable cell centre closest to `point`, searching outwards up to `radius` metres. */
export function nearestWalkable(
  grid: WalkGrid,
  point: Point,
  radius = 40,
  accessible?: Uint8Array,
): Point | null {
  const col = Math.floor(point.x - grid.x0);
  const row = Math.floor(point.y - grid.y0);
  let best: Point | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let ring = 0; ring <= radius; ring++) {
    for (let dr = -ring; dr <= ring; dr++)
      for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
        const c = col + dc;
        const r = row + dr;
        if (c < 0 || r < 0 || c >= grid.width || r >= grid.depth) continue;
        const index = r * grid.width + c;
        // Prefer footways. Open ground may be a gap between buildings, so it is only chosen
        // when no footway is near; a street cell is a last resort.
        const kind = grid.kinds[index] ?? 0;
        if (!kind || (accessible && !accessible[index])) continue;
        const cell = centre(grid, index);
        // Open ground may be a gap between buildings; a street cell is a last resort.
        const avoidance = kind === 2 ? OPEN_GROUND_AVOIDANCE : kind >= 4 ? 6 : 0;
        const distance = Math.hypot(cell.x - point.x, cell.y - point.y) + avoidance;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = cell;
        }
      }
    if (best && bestDistance <= ring) return best;
  }
  return best;
}

type Scratch = { cost: Float32Array; from: Int32Array; stamp: Uint32Array; generation: number };
const scratches = new WeakMap<WalkGrid, Scratch>();

function scratchFor(grid: WalkGrid): Scratch {
  let scratch = scratches.get(grid);
  if (!scratch) {
    const cells = grid.width * grid.depth;
    scratch = {
      cost: new Float32Array(cells),
      from: new Int32Array(cells),
      stamp: new Uint32Array(cells),
      generation: 0,
    };
    scratches.set(grid, scratch);
  }
  scratch.generation++;
  return scratch;
}

/** Binary min-heap of cell indices keyed by estimated total cost. */
class Heap {
  private items: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.items.length;
  }
  push(item: number, key: number) {
    let index = this.items.length;
    this.items.push(item);
    this.keys.push(key);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if ((this.keys[parent] ?? 0) <= key) break;
      this.items[index] = this.items[parent] ?? 0;
      this.keys[index] = this.keys[parent] ?? 0;
      index = parent;
    }
    this.items[index] = item;
    this.keys[index] = key;
  }
  pop(): number {
    const top = this.items[0] ?? -1;
    const lastItem = this.items.pop() ?? -1;
    const lastKey = this.keys.pop() ?? 0;
    if (!this.items.length) return top;
    let index = 0;
    for (;;) {
      const left = index * 2 + 1;
      if (left >= this.items.length) break;
      const right = left + 1;
      const child =
        right < this.items.length && (this.keys[right] ?? 0) < (this.keys[left] ?? 0)
          ? right
          : left;
      if ((this.keys[child] ?? 0) >= lastKey) break;
      this.items[index] = this.items[child] ?? 0;
      this.keys[index] = this.keys[child] ?? 0;
      index = child;
    }
    this.items[index] = lastItem;
    this.keys[index] = lastKey;
    return top;
  }
}

const NEIGHBOURS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
] as const;

function canStep(grid: WalkGrid, from: number, to: number) {
  if (!grid.kinds[to]) return false;
  return Math.abs((grid.heights[to] ?? 0) - (grid.heights[from] ?? 0)) <= MAX_STEP_CM;
}

/** Keep destinations in the same walkable component as the plaza entrance.
 * Some exported 1 m cells look like footways but are isolated by steep edges.
 */
function accessibleFrom(grid: WalkGrid, start: Point): Uint8Array {
  const visited = new Uint8Array(grid.width * grid.depth);
  const initial = cellOf(grid, start.x, start.y);
  if (initial < 0 || !grid.kinds[initial]) return visited;
  const queue = new Int32Array(visited.length);
  let head = 0;
  let tail = 1;
  queue[0] = initial;
  visited[initial] = 1;
  while (head < tail) {
    const current = queue[head++] ?? -1;
    const col = current % grid.width;
    const row = Math.floor(current / grid.width);
    for (const [dc, dr] of NEIGHBOURS) {
      const c = col + dc;
      const r = row + dr;
      if (c < 0 || r < 0 || c >= grid.width || r >= grid.depth) continue;
      const next = r * grid.width + c;
      if (visited[next] || !canStep(grid, current, next)) continue;
      if (
        dc &&
        dr &&
        (!canStep(grid, current, row * grid.width + c) ||
          !canStep(grid, current, r * grid.width + col))
      )
        continue;
      visited[next] = 1;
      queue[tail++] = next;
    }
  }
  return visited;
}

/**
 * A* over the walk grid. Returns the waypoints after `from`, ending exactly at `to`,
 * or an empty list when `to` cannot be reached.
 */
export function findPath(grid: WalkGrid, from: Point, to: Point, budget = 400_000): Point[] {
  const start = cellOf(grid, from.x, from.y);
  const goal = cellOf(grid, to.x, to.y);
  if (start < 0 || goal < 0 || !grid.kinds[goal]) return [];
  if (start === goal) return [to];
  const scratch = scratchFor(grid);
  const { cost, from: came, stamp, generation } = scratch;
  const goalCol = goal % grid.width;
  const goalRow = Math.floor(goal / grid.width);
  const estimate = (index: number) => {
    const dx = Math.abs((index % grid.width) - goalCol);
    const dy = Math.abs(Math.floor(index / grid.width) - goalRow);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  const open = new Heap();
  cost[start] = 0;
  came[start] = -1;
  stamp[start] = generation;
  open.push(start, estimate(start));
  let found = false;
  for (let expanded = 0; open.size && expanded < budget; expanded++) {
    const current = open.pop();
    if (current === goal) {
      found = true;
      break;
    }
    const col = current % grid.width;
    const row = Math.floor(current / grid.width);
    const base = cost[current] ?? 0;
    for (const [dc, dr, length] of NEIGHBOURS) {
      const c = col + dc;
      const r = row + dr;
      if (c < 0 || r < 0 || c >= grid.width || r >= grid.depth) continue;
      const next = r * grid.width + c;
      if (!canStep(grid, current, next)) continue;
      // No cutting corners past buildings.
      if (
        dc &&
        dr &&
        (!canStep(grid, current, row * grid.width + c) ||
          !canStep(grid, current, r * grid.width + col))
      )
        continue;
      const total = base + length * (COST[grid.kinds[next] ?? 0] ?? 9);
      if (stamp[next] === generation && (cost[next] ?? 0) <= total) continue;
      stamp[next] = generation;
      cost[next] = total;
      came[next] = current;
      open.push(next, total + estimate(next));
    }
  }
  if (!found) return [];
  const cells: number[] = [];
  for (let step = goal; step >= 0; step = came[step] ?? -1) cells.unshift(step);
  return [
    ...smooth(grid, cells)
      .slice(1, -1)
      .map((index) => centre(grid, index)),
    to,
  ];
}

/** Drop waypoints that a straight walk can skip without leaving equally easy ground. */
function smooth(grid: WalkGrid, cells: number[]): number[] {
  if (cells.length < 3) return cells;
  const kept = [cells[0] ?? 0];
  let anchor = 0;
  while (anchor < cells.length - 1) {
    let reach = anchor + 1;
    for (let next = cells.length - 1; next > anchor + 1; next--) {
      if (clearLine(grid, cells, anchor, next)) {
        reach = next;
        break;
      }
    }
    kept.push(cells[reach] ?? 0);
    anchor = reach;
  }
  return kept;
}

function clearLine(grid: WalkGrid, cells: number[], from: number, to: number) {
  const a = cells[from] ?? 0;
  const b = cells[to] ?? 0;
  let worst = 0;
  for (let index = from; index <= to; index++)
    worst = Math.max(worst, COST[grid.kinds[cells[index] ?? 0] ?? 0] ?? 9);
  const ax = a % grid.width;
  const ay = Math.floor(a / grid.width);
  const bx = b % grid.width;
  const by = Math.floor(b / grid.width);
  const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2;
  let previous = a;
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    const cell = Math.round(ay + (by - ay) * t) * grid.width + Math.round(ax + (bx - ax) * t);
    if (cell === previous) continue;
    if (!canStep(grid, previous, cell) || (COST[grid.kinds[cell] ?? 0] ?? 9) > worst) return false;
    previous = cell;
  }
  return true;
}

// —— Destinations ——
type Landmark = Omit<Poi, "heading"> & { heading?: number; facing?: Point };
const north = -Math.PI / 2;
/** Real places in the Blender scene; points are snapped to the nearest footway. */
const landmarks: Landmark[] = [
  {
    id: "jr-hijiri",
    x: -25,
    y: 40,
    activity: "visit",
    seconds: 7,
    doing: "JR御茶ノ水駅（聖橋口）で電車待ち",
    place: "聖橋口",
    facing: { x: -30, y: 35 },
  },
  // Short stops around the station entrances, so visits cover the surrounding footways
  // instead of converging on a single doorway.
  {
    id: "jr-hijiri-front",
    x: -36,
    y: 44,
    activity: "stand",
    seconds: 5,
    doing: "JR御茶ノ水駅の聖橋口周辺を散策中",
    place: "JR御茶ノ水駅・聖橋口周辺",
  },
  {
    id: "jr-hijiri-walk",
    x: -19,
    y: 55,
    activity: "stand",
    seconds: 5,
    doing: "聖橋口近くの歩道を歩いています",
    place: "聖橋口の歩道",
  },
  {
    id: "jr-ocha",
    x: -173,
    y: -8,
    activity: "visit",
    seconds: 7,
    doing: "JR御茶ノ水駅（御茶ノ水橋口）で電車待ち",
    place: "御茶ノ水橋口",
    facing: { x: -160, y: -2 },
  },
  {
    id: "jr-ocha-front",
    x: -161,
    y: -6,
    activity: "stand",
    seconds: 6,
    doing: "JR御茶ノ水駅の御茶ノ水橋口周辺を散策中",
    place: "JR御茶ノ水駅・御茶ノ水橋口周辺",
  },
  {
    id: "jr-ocha-walk",
    x: -185,
    y: -18,
    activity: "stand",
    seconds: 5,
    doing: "御茶ノ水橋口近くを散歩しています",
    place: "御茶ノ水橋口の歩道",
  },
  {
    id: "bridge",
    x: -176,
    y: -53,
    activity: "stand",
    seconds: 6,
    doing: "お茶の水橋から神田川を眺めています",
    place: "お茶の水橋",
    heading: 0,
  },
  {
    id: "photo",
    x: 2,
    y: -45,
    activity: "stand",
    seconds: 6,
    doing: "聖橋から丸ノ内線を撮影中",
    place: "聖橋",
    heading: 0,
  },
  {
    id: "bridge-approach",
    x: -165,
    y: -45,
    activity: "stand",
    seconds: 5,
    doing: "お茶の水橋のたもとを散策しています",
    place: "お茶の水橋周辺",
  },
  {
    id: "dhu",
    x: 72,
    y: 100,
    activity: "visit",
    seconds: 9,
    doing: "デジタルハリウッド大学で授業中",
    place: "デジタルハリウッド大学",
    facing: { x: 106, y: 130 },
  },
  {
    id: "sola-entrance",
    x: 30,
    y: 95,
    activity: "stand",
    seconds: 5,
    doing: "ソラシティの周辺を散歩しています",
    place: "御茶ノ水ソラシティ周辺",
  },
  {
    id: "sola-plaza",
    x: 50,
    y: 100,
    activity: "sit",
    seconds: 8,
    doing: "ソラシティ広場でひと休み",
    place: "ソラシティ広場",
  },
  {
    id: "sola-stage",
    x: 40,
    y: 120,
    activity: "stand",
    seconds: 6,
    doing: "ソラシティ広場の作品発表会を見ています",
    place: "作品発表会",
    facing: { x: 60, y: 110 },
  },
  {
    id: "plaza-north",
    x: 44,
    y: 95,
    activity: "stand",
    seconds: 5,
    doing: "広場を散歩しています",
    place: "ソラシティ広場の北側",
    heading: Math.PI / 2,
  },
  {
    id: "plaza-west",
    x: 38,
    y: 108,
    activity: "stand",
    seconds: 5,
    doing: "広場でひと息ついています",
    place: "広場の西側",
    heading: 0,
  },
  {
    id: "plaza-centre",
    x: 52,
    y: 114,
    activity: "stand",
    seconds: 5,
    doing: "広場の真ん中で空を見上げています",
    place: "広場の中央",
    heading: -Math.PI / 2,
  },
  {
    id: "plaza-south",
    x: 56,
    y: 126,
    activity: "stand",
    seconds: 5,
    doing: "広場の南で友だちを待っています",
    place: "広場の南側",
    heading: -Math.PI / 2,
  },
  {
    id: "nikolai",
    x: -38,
    y: 190,
    activity: "stand",
    seconds: 6,
    doing: "ニコライ堂を見上げています",
    place: "ニコライ堂",
    facing: { x: -5, y: 192 },
  },
  {
    id: "nikolai-walk",
    x: -46,
    y: 177,
    activity: "stand",
    seconds: 6,
    doing: "ニコライ堂の周辺を歩いています",
    place: "ニコライ堂周辺",
  },
  {
    id: "yushima",
    x: 56,
    y: -74,
    activity: "visit",
    seconds: 8,
    doing: "湯島聖堂を見学中",
    place: "湯島聖堂",
    heading: north,
  },
  {
    id: "yushima-walk",
    x: 60,
    y: -65,
    activity: "stand",
    seconds: 5,
    doing: "湯島聖堂の周辺を散策しています",
    place: "湯島聖堂周辺",
  },
  {
    id: "meiji",
    x: -345,
    y: 232,
    activity: "visit",
    seconds: 8,
    doing: "明治大学リバティタワーで講義中",
    place: "明治大学",
    facing: { x: -365, y: 249 },
  },
  {
    id: "hospital",
    x: -258,
    y: 240,
    activity: "stand",
    seconds: 4,
    doing: "大学病院の前で待ち合わせ中",
    place: "日本大学病院",
    facing: { x: -258, y: 266 },
  },
  {
    id: "subway",
    x: 28,
    y: 92,
    activity: "visit",
    seconds: 6,
    doing: "千代田線 新御茶ノ水駅へ",
    place: "新御茶ノ水駅",
    facing: { x: 28, y: 98 },
  },
  {
    id: "riverwalk",
    x: -95,
    y: -60,
    activity: "stand",
    seconds: 5,
    doing: "神田川沿いから駅を眺めています",
    place: "神田川沿い",
    heading: Math.PI / 2,
  },
];

/** What a resident does at each kind of shopfront; several lines rotate through a kind. */
const shopActivities: Record<string, { place: string; doing: string }[]> = {
  food: [
    { place: "定食屋", doing: "炭火焼き定食でランチ中" },
    { place: "ラーメン屋", doing: "煮干しラーメンを食べています" },
    { place: "牛たん屋", doing: "牛たん定食を食べています" },
    { place: "洋食屋", doing: "ハンバーグを食べています" },
    { place: "豚丼屋", doing: "炭火豚丼を食べています" },
  ],
  cafe: [{ place: "カフェ", doing: "カフェでコーヒーを注文中" }],
  books: [{ place: "古書店", doing: "古書店で立ち読み中" }],
  music: [
    { place: "楽器店", doing: "楽器店でギターを試奏中" },
    { place: "大型楽器店", doing: "大型楽器店で楽譜を探しています" },
  ],
  konbini: [{ place: "コンビニ", doing: "コンビニで買い物中" }],
  sport: [{ place: "スポーツ用品店", doing: "スポーツ用品店をのぞいています" }],
  tech: [{ place: "家電店", doing: "家電店で新製品を見ています" }],
  health: [{ place: "ドラッグストア", doing: "ドラッグストアで買い物中" }],
};

/**
 * Where residents first appear: the footways of the Sola City plaza. The camera opens on
 * this plaza.
 */
const spawnPoints: Point[] = [
  { x: 44, y: 95 },
  { x: 38, y: 108 },
  { x: 52, y: 114 },
  { x: 56, y: 126 },
  { x: 46, y: 102 },
  { x: 40, y: 116 },
  { x: 42, y: 112 },
  { x: 48, y: 122 },
  { x: 36, y: 100 },
  { x: 60, y: 118 },
  { x: 50, y: 96 },
  { x: 50, y: 100 },
];

export function createWorld(grid: WalkGrid, shops: Shopfront[]): World {
  const plazaEntrance = nearestWalkable(grid, spawnPoints[0] ?? { x: 44, y: 95 });
  const accessible = plazaEntrance ? accessibleFrom(grid, plazaEntrance) : undefined;
  const pois: Poi[] = [];
  const add = (poi: Poi) => {
    if (pois.some((other) => Math.hypot(other.x - poi.x, other.y - poi.y) < 1.5)) return;
    pois.push(poi);
  };
  for (const landmark of landmarks) {
    const spot = nearestWalkable(grid, landmark, 40, accessible);
    if (!spot) continue;
    const { facing, heading, ...rest } = landmark;
    add({
      ...rest,
      ...spot,
      heading: facing ? Math.atan2(facing.y - spot.y, facing.x - spot.x) : (heading ?? Math.PI / 2),
    });
  }
  const counts: Record<string, number> = {};
  for (const shop of shops) {
    const options = shopActivities[shop.kind];
    if (!options) continue;
    // Stand on the footway a few steps in front of the awning, facing the shop.
    const spot = nearestWalkable(
      grid,
      { x: shop.x + shop.nx * 2.5, y: shop.z + shop.nz * 2.5 },
      8,
      accessible,
    );
    if (!spot) continue;
    const count = counts[shop.kind] ?? 0;
    counts[shop.kind] = count + 1;
    const activity = options[count % options.length] ?? options[0];
    if (!activity) continue;
    add({
      id: `${shop.kind}-${count}`,
      ...spot,
      activity: "visit",
      heading: Math.atan2(-shop.nz, -shop.nx),
      seconds: 7,
      ...activity,
    });
  }
  const spawns = spawnPoints.flatMap((point) => {
    const spot = nearestWalkable(grid, point, 40, accessible);
    return spot ? [spot] : [];
  });
  return { grid, pois, spawns };
}

/** Viewpoints for the automatic tour. */
export const tour: { x: number; y: number; label: string }[] = [
  { x: -95, y: 28, label: "JR御茶ノ水駅" },
  { x: 40, y: -10, label: "聖橋と丸ノ内線" },
  { x: 70, y: 115, label: "御茶ノ水ソラシティ" },
  { x: -15, y: 185, label: "ニコライ堂" },
  { x: -150, y: 60, label: "楽器店街" },
  { x: -330, y: 225, label: "明治大学" },
  { x: 56, y: -74, label: "湯島聖堂" },
  { x: -176, y: -45, label: "お茶の水橋" },
];
