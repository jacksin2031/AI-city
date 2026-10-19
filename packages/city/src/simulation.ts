export type Direction = "front" | "left" | "back" | "right";
export type CityAction = "idle" | "walk" | "turn" | "talk" | "wave";
export type Actor = {
  x: number;
  y: number;
  direction: Direction;
  action: CityAction;
  elapsed: number;
  waypoint: number;
};
// A small, explicit loop around the plaza; this is a waypoint demo, not general pathfinding.
const route = [
  { x: 250, y: 365 },
  { x: 710, y: 365 },
  { x: 710, y: 505 },
  { x: 250, y: 505 },
];
const directions: Direction[] = ["front", "left", "back", "right"];

export function createActor(index: number): Actor {
  const waypoint = index % route.length;
  const start = route[waypoint] ?? route[0];
  return {
    x: start?.x ?? 250,
    y: (start?.y ?? 365) + Math.floor(index / 4) * 9,
    direction: "front",
    action: "idle",
    elapsed: 0,
    waypoint,
  };
}
export function commandActor(actor: Actor, action: CityAction): Actor {
  return {
    ...actor,
    action,
    elapsed: 0,
    direction:
      action === "turn"
        ? (directions[(directions.indexOf(actor.direction) + 1) % 4] ?? "front")
        : actor.direction,
  };
}
export function stepActor(actor: Actor, seconds: number, moving: boolean): Actor {
  if (!moving) return actor;
  const next = { ...actor, elapsed: actor.elapsed + Math.max(0, seconds) };
  if (actor.action === "walk") {
    const target = route[(actor.waypoint + 1) % route.length];
    if (!target) return next;
    const dx = target.x - actor.x;
    const dy = target.y - actor.y;
    const distance = Math.hypot(dx, dy);
    const step = 46 * Math.max(0, seconds);
    next.direction =
      Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "front" : "back";
    if (distance <= step)
      return {
        ...next,
        x: target.x,
        y: target.y,
        waypoint: (actor.waypoint + 1) % route.length,
        action: "idle",
        elapsed: 0,
      };
    next.x += (dx / distance) * step;
    next.y += (dy / distance) * step;
  } else if (actor.action !== "idle" && next.elapsed >= 2.4) {
    next.action = "idle";
    next.elapsed = 0;
  }
  return next;
}
