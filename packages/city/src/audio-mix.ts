import { type PedestrianSignal, pedestrianPhase } from "./traffic";

/** Everything the street-sound mixer needs, in Blender ENU metres. */
export type AudioFrame = {
  /** Traffic clock; drives the signal phases, so sound and lamps always agree. */
  time: number;
  listener: { x: number; y: number };
  /** Camera zoom relative to the default view. Zooming in brings the street closer. */
  zoomRatio: number;
  signals: PedestrianSignal[];
  vehicles: VehicleSource[];
};
export type VehicleSource = {
  id: number;
  x: number;
  y: number;
  train: boolean;
  moving: boolean;
  /** Distance travelled along the route; rail joints are heard every few metres. */
  distance: number;
  /** A train standing at its platform. */
  dwelling: boolean;
};

export const RADIUS = { signal: 45, car: 55, train: 120 };
const MIN_AUDIBLE = 0.02;

/** 1 at the listener, fading smoothly to 0 at the radius. */
export function proximity(distance: number, radius: number): number {
  if (radius <= 0 || distance >= radius) return 0;
  const t = 1 - distance / radius;
  return t * t;
}

/**
 * Zoomed out, the view covers a wide area, so sounds are heard from further away; zoomed in, only
 * what is close is heard. Keeps the quiet opening tour from being silent.
 */
export function reach(zoomRatio: number): number {
  return Math.min(2.2, Math.max(0.8, 1 / Math.sqrt(Math.max(zoomRatio, 0.01))));
}

/** Zooming in makes the street louder, zooming out quieter, within sensible limits. */
export function zoomGain(zoomRatio: number): number {
  return Math.min(1.5, Math.max(0.6, Math.sqrt(Math.max(zoomRatio, 0.01))));
}

export type PedestrianCue = { kind: "cuckoo" | "chirp"; interval: number } | null;

/**
 * Japanese acoustic pedestrian signals: group A sounds the cuckoo "カッコー", group B the chirping
 * "ピヨピヨ". They sound only while pedestrians may cross, and hurry once the green is flashing.
 */
export function pedestrianCue(group: "A" | "B", time: number): PedestrianCue {
  const phase = pedestrianPhase(group, time);
  if (phase === "stop") return null;
  const kind = group === "A" ? "cuckoo" : "chirp";
  const base = kind === "cuckoo" ? 1.8 : 1.1;
  return { kind, interval: phase === "flash" ? base * 0.55 : base };
}

/** Index of the current beat; a new index means the sound should play once more. */
export function cueBeat(cue: NonNullable<PedestrianCue>, time: number): number {
  return Math.floor(time / cue.interval);
}

/** The loudest signals near the listener, at most `limit`, so crowded junctions stay clear. */
export function audibleSignals(frame: AudioFrame, limit = 2) {
  const boost = zoomGain(frame.zoomRatio);
  return frame.signals
    .map((signal, index) => ({
      index,
      signal,
      gain: Math.min(
        1,
        proximity(
          Math.hypot(signal.x - frame.listener.x, signal.y - frame.listener.y),
          RADIUS.signal * reach(frame.zoomRatio),
        ) * boost,
      ),
    }))
    .filter((entry) => entry.gain > MIN_AUDIBLE)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, limit);
}

export type StreetMix = {
  /** Continuous road noise and engines of nearby cars; idling cars count for less. */
  cars: number;
  /** Continuous rumble of the nearest moving train. */
  train: number;
  /** Nearest audible train, for rail clacks and the station chime. */
  nearestTrain: { id: number; gain: number; distance: number; dwelling: boolean } | null;
};

export function streetMix(frame: AudioFrame): StreetMix {
  const boost = zoomGain(frame.zoomRatio);
  let cars = 0;
  let train = 0;
  let nearestTrain: StreetMix["nearestTrain"] = null;
  for (const vehicle of frame.vehicles) {
    const distance = Math.hypot(vehicle.x - frame.listener.x, vehicle.y - frame.listener.y);
    if (vehicle.train) {
      const gain = proximity(distance, RADIUS.train * reach(frame.zoomRatio)) * boost;
      if (gain <= MIN_AUDIBLE) continue;
      if (vehicle.moving) train = Math.max(train, gain);
      if (!nearestTrain || gain > nearestTrain.gain)
        nearestTrain = {
          id: vehicle.id,
          gain: Math.min(1, gain),
          distance: vehicle.distance,
          dwelling: vehicle.dwelling,
        };
    } else {
      cars +=
        proximity(distance, RADIUS.car * reach(frame.zoomRatio)) *
        (vehicle.moving ? 1 : 0.25) *
        boost;
    }
  }
  return { cars: Math.min(1, cars), train: Math.min(1, train), nearestTrain };
}

/** Metres between rail joints; each pair of wheels crossing one makes a "ガタン". */
export const RAIL_JOINT_SPACING = 5;
export function railBeat(distance: number): number {
  return Math.floor(distance / RAIL_JOINT_SPACING);
}
