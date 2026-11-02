export type TrafficStop = { distance: number; group: string };
export type VehicleState = { distance: number; dwell: number; lastStop: number };
export type Point3 = [number, number, number];
export type PedestrianSignal = {
  x: number;
  y: number;
  height: number;
  dx: number;
  dy: number;
  group: "A" | "B";
};
const pathDistances = new WeakMap<Point3[], number[]>();

/** Flashing green means pedestrians already crossing may finish, but should not start. */
export function pedestrianPhase(group: "A" | "B", seconds: number): "walk" | "flash" | "stop" {
  const t = ((seconds % 40) + 40) % 40;
  if (group === "A") return t >= 21 && t < 31 ? "walk" : t >= 31 && t < 35 ? "flash" : "stop";
  return t >= 0.5 && t < 11 ? "walk" : t >= 11 && t < 15 ? "flash" : "stop";
}

/** Earliest stop-line intersection for a walker approaching a signal, or null. */
export function pedestrianStopFraction(
  from: { x: number; y: number },
  to: { x: number; y: number },
  height: number,
  signals: PedestrianSignal[],
  time: number,
): number | null {
  let earliest: number | null = null;
  for (const signal of signals) {
    if (pedestrianPhase(signal.group, time) === "walk" || Math.abs(height - signal.height) > 3)
      continue;
    const length = Math.hypot(signal.dx, signal.dy);
    if (!length) continue;
    const dx = signal.dx / length,
      dy = signal.dy / length;
    const mx = to.x - from.x,
      my = to.y - from.y;
    const advance = mx * dx + my * dy;
    if (advance <= 0.00001 || advance / Math.hypot(mx, my) < 0.5) continue;
    // One metre back from the signal face, outside the crossing.
    const gx = signal.x - dx,
      gy = signal.y - dy;
    const start = (from.x - gx) * dx + (from.y - gy) * dy;
    if (start > 0.00001 || start + advance < 0) continue;
    const fraction = Math.max(0, -start / advance);
    const lateral = (from.x + fraction * mx - gx) * -dy + (from.y + fraction * my - gy) * dx;
    if (Math.abs(lateral) <= 4 && (earliest === null || fraction < earliest)) earliest = fraction;
  }
  return earliest;
}

export function signalPhase(group: string, seconds: number): "G" | "Y" | "R" {
  const t = ((seconds % 40) + 40) % 40;
  if (group === "A") return t < 16 ? "G" : t < 19 ? "Y" : "R";
  return t >= 21 && t < 36 ? "G" : t >= 36 && t < 39 ? "Y" : "R";
}

/** Advance at most one stop per step. The caller uses small fixed steps. */
export function advanceVehicle(
  state: VehicleState,
  dt: number,
  time: number,
  speed: number,
  stops: TrafficStop[],
  length: number,
  train: boolean,
): VehicleState {
  let { distance, dwell, lastStop } = state;
  if (dwell > 0) {
    const wait = Math.min(dt, dwell);
    dwell -= wait;
    dt -= wait;
    if (dt <= 0) return { distance, dwell, lastStop };
  }
  const next = distance + speed * dt;
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    if (
      !stop ||
      stop.distance < distance - 0.001 ||
      stop.distance > next ||
      (train && lastStop === i)
    )
      continue;
    if (train) {
      const arrival = time + (stop.distance - distance) / speed;
      const departure = Math.ceil((arrival + 15) / 60) * 60;
      return { distance: stop.distance, dwell: departure - arrival, lastStop: i };
    }
    if (signalPhase(stop.group, time) !== "G")
      return { distance: stop.distance, dwell: 0, lastStop };
  }
  if (next >= length) return { distance: next % length, dwell: 0, lastStop: -1 };
  return { distance: next, dwell: 0, lastStop };
}

export function samplePath(
  points: Point3[],
  distance: number,
): { position: Point3; direction: Point3 } {
  if (points.length < 2) return { position: points[0] ?? [0, 0, 0], direction: [1, 0, 0] };
  let distances = pathDistances.get(points);
  if (!distances) {
    distances = [0];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1] as Point3;
      const b = points[i] as Point3;
      distances.push((distances[i - 1] ?? 0) + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    }
    pathDistances.set(points, distances);
  }
  const target = Math.max(0, Math.min(distance, distances.at(-1) ?? 0));
  let lo = 1;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if ((distances[mid] ?? 0) < target) lo = mid + 1;
    else hi = mid;
  }
  const a = points[lo - 1] as Point3;
  const b = points[lo] as Point3;
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    dz = b[2] - a[2];
  const length = Math.hypot(dx, dy, dz);
  const t = length ? (target - (distances[lo - 1] ?? 0)) / length : 0;
  return {
    position: [a[0] + dx * t, a[1] + dy * t, a[2] + dz * t],
    direction: length ? [dx / length, dy / length, dz / length] : [1, 0, 0],
  };
}
