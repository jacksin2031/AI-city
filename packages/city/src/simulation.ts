import { type PedestrianSignal, pedestrianStopFraction } from "./traffic";
import { findPath, heightAt, nearestWalkable, type Poi, type Point, type World } from "./world";

export type Direction = "front" | "left" | "back" | "right";
export type CityAction = "idle" | "walk" | "turn" | "talk" | "wave" | "sit" | "visit";
export type Actor = {
  x: number;
  y: number;
  /** Facing in radians: 0 east, π/2 south. */
  heading: number;
  action: CityAction;
  elapsed: number;
  /** Remaining waypoints; the last one is the destination itself. */
  path: Point[];
  goal: string | null;
  /** Deterministic per-resident choice of the next destination; no Math.random in tests. */
  seed: number;
  waitingForSignal?: boolean;
};
/** Walking pace in metres per second. */
const speed = 1.35;
/** Residents pick their next stop within a few minutes' walk, so the crowd stays together. */
const NEARBY = 45;

/**
 * The Sola City plaza and the crossing beside it. Destinations are limited to this box so the
 * crowd stays in the part of town the exhibition shows, rather than scattering across the map.
 */
export function inCentralDistrict(point: Point): boolean {
  return point.x >= -10 && point.x <= 120 && point.y >= 55 && point.y <= 150;
}

export function poiById(world: World, id: string | null): Poi | undefined {
  return id ? world.pois.find((poi) => poi.id === id) : undefined;
}

export function createActor(world: World, index: number): Actor {
  const start = world.spawns[index % Math.max(1, world.spawns.length)] ?? { x: 0, y: 0 };
  const offset = Math.floor(index / Math.max(1, world.spawns.length)) * 1.2;
  const spot = nearestWalkable(world.grid, { x: start.x + offset, y: start.y }, 6) ?? start;
  return {
    ...spot,
    // Facing the camera, which looks from the north-west.
    heading: -(3 * Math.PI) / 4,
    action: "idle",
    elapsed: 0,
    path: [],
    goal: null,
    seed: (index * 7919 + 17) % 9973,
  };
}

/** Walk to a destination along the footways. */
export function planTrip(world: World, actor: Actor, poi: Poi): Actor {
  const path = findPath(world.grid, actor, poi);
  if (!path.length)
    return { ...actor, action: "idle", elapsed: 0, path: [], goal: null, waitingForSignal: false };
  return { ...actor, action: "walk", elapsed: 0, path, goal: poi.id, waitingForSignal: false };
}

function nextDestinations(world: World, actor: Actor, inView?: (point: Point) => boolean): Poi[] {
  // Small LCG: stable sequences per resident, varied between residents.
  const seed = (actor.seed * 1103 + 12345) % 9973;
  const others = world.pois.filter((poi) => poi.id !== actor.goal);
  const central = others.filter(inCentralDistrict);
  const district = central.length ? central : others;
  const near = district.filter((poi) => Math.hypot(poi.x - actor.x, poi.y - actor.y) < NEARBY);
  const nearby = near.length ? near : district;
  const visible = inView ? nearby.filter(inView) : [];
  const ordered: Poi[] = [];
  for (const group of [visible, nearby, district]) {
    for (let offset = 0; offset < group.length; offset++) {
      const poi = group[(seed + offset) % group.length];
      if (poi && !ordered.some((item) => item.id === poi.id)) ordered.push(poi);
    }
  }
  return ordered.slice(0, 8);
}

function closest(world: World, actor: Actor, activity: Poi["activity"]): Poi | undefined {
  return world.pois
    .filter((poi) => poi.activity === activity)
    .sort(
      (a, b) => Math.hypot(a.x - actor.x, a.y - actor.y) - Math.hypot(b.x - actor.x, b.y - actor.y),
    )[0];
}

export function commandActor(
  world: World,
  actor: Actor,
  action: CityAction,
  inView?: (point: Point) => boolean,
): Actor {
  if (action === "walk") {
    const moved = { ...actor, seed: (actor.seed * 1103 + 12345) % 9973, waitingForSignal: false };
    for (const poi of nextDestinations(world, actor, inView)) {
      const trip = planTrip(world, moved, poi);
      if (trip.action === "walk") return trip;
    }
    return { ...moved, action: "idle", elapsed: 0, path: [], goal: null };
  }
  if (action === "sit" || action === "visit") {
    const poi = closest(world, actor, action);
    return poi ? planTrip(world, actor, poi) : actor;
  }
  // Leaving a shop or bench first: the resident stands where they were.
  return {
    ...actor,
    action,
    elapsed: 0,
    path: [],
    goal: action === "idle" ? actor.goal : null,
    heading: action === "turn" ? actor.heading + Math.PI / 2 : actor.heading,
    waitingForSignal: false,
  };
}

export function stepActor(
  world: World,
  actor: Actor,
  seconds: number,
  moving: boolean,
  traffic?: { signals: PedestrianSignal[]; time: number },
): Actor {
  if (!moving) return actor;
  const delta = Math.max(0, seconds);
  const next = { ...actor, elapsed: actor.elapsed + delta, waitingForSignal: false };
  const poi = poiById(world, actor.goal);
  if (actor.action === "walk") {
    let budget = speed * delta;
    let path = actor.path;
    while (path.length && budget > 0) {
      const target = path[0] as Point;
      const dx = target.x - next.x;
      const dy = target.y - next.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 0.01) next.heading = Math.atan2(dy, dx);
      if (traffic && distance > 0.01) {
        const travel = Math.min(distance, budget);
        const proposed = {
          x: next.x + (dx / distance) * travel,
          y: next.y + (dy / distance) * travel,
        };
        const stop = pedestrianStopFraction(
          next,
          proposed,
          heightAt(world.grid, next.x, next.y),
          traffic.signals,
          traffic.time,
        );
        if (stop !== null) {
          next.x += (proposed.x - next.x) * stop;
          next.y += (proposed.y - next.y) * stop;
          next.path = path;
          next.waitingForSignal = true;
          return next;
        }
      }
      if (distance > budget) {
        next.x += (dx / distance) * budget;
        next.y += (dy / distance) * budget;
        budget = 0;
      } else {
        next.x = target.x;
        next.y = target.y;
        budget -= distance;
        path = path.slice(1);
      }
    }
    next.path = path;
    if (path.length) return next;
    // Arrived at the destination: start its activity.
    return {
      ...next,
      elapsed: 0,
      heading: poi?.heading ?? next.heading,
      action: poi?.activity === "sit" ? "sit" : poi?.activity === "visit" ? "visit" : "idle",
    };
  }
  if ((actor.action === "sit" || actor.action === "visit") && next.elapsed >= (poi?.seconds ?? 6)) {
    // Step back out, facing the street.
    return { ...next, action: "idle", elapsed: 0, heading: next.heading + Math.PI };
  }
  if (
    (actor.action === "talk" || actor.action === "wave" || actor.action === "turn") &&
    next.elapsed >= 2.4
  )
    return { ...next, action: "idle", elapsed: 0 };
  return next;
}

/** Public, generic description for the profile card. Never includes resident-supplied text. */
export function describeActivity(world: World, actor: Actor): string {
  if (actor.waitingForSignal) return "信号が青になるのを待っています";
  const poi = poiById(world, actor.goal);
  if (actor.action === "walk") return poi ? `${poi.place}へ向かっています` : "街を散歩中";
  if (actor.action === "talk") return "近くの住民とおしゃべり中";
  if (actor.action === "wave") return "手を振っています";
  if (poi && (actor.action === "sit" || actor.action === "visit")) return poi.doing;
  if (poi && actor.action === "idle" && Math.hypot(poi.x - actor.x, poi.y - actor.y) < 2)
    return poi.doing;
  return "御茶ノ水をのんびり散策中";
}
