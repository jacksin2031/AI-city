export type TrafficStop = { distance: number; group: string };
export type VehicleState = { distance: number; dwell: number; lastStop: number };
export type Point3 = [number, number, number];
const pathDistances = new WeakMap<Point3[], number[]>();

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
