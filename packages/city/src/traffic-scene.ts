import * as THREE from "three";
import {
  advanceVehicle,
  type PedestrianSignal,
  type Point3,
  pedestrianPhase,
  samplePath,
  signalPhase,
  type TrafficStop,
  type VehicleState,
} from "./traffic";

type Route = {
  name: string;
  kind: "road" | "rail";
  line?: string;
  pts: Point3[];
  length: number;
  stops?: TrafficStop[];
  stationCentre?: number | null;
};
type Vehicle = {
  controller: string;
  sourceController?: string;
  path: string;
  s: number;
  cars?: number;
  car_length?: number;
  gap?: number;
};
export type TrafficData = {
  paths: Route[];
  vehicles: Vehicle[];
  pedestrianSignals: PedestrianSignal[];
};
type RunningVehicle = {
  route: Route;
  state: VehicleState;
  stops: TrafficStop[];
  speed: number;
  train: boolean;
  parts: { object: THREE.Object3D; offset: number; halfSpan: number }[];
};

/** Simulated, local-only traffic. Coordinates in the source data are Blender ENU metres. */
export function createTraffic(
  data: TrafficData,
  model: THREE.Object3D,
  city: THREE.Object3D,
  metroRailHeightOffset = 0,
) {
  const routes = new Map(data.paths.map((route) => [route.name, route]));
  const running: RunningVehicle[] = [];
  for (const entry of data.vehicles) {
    const route = routes.get(entry.path);
    if (!route || route.pts.length < 2) continue;
    const train = route.kind === "rail";
    const parts: RunningVehicle["parts"] = [];
    if (train) {
      for (let i = 0; i < (entry.cars ?? 0); i++) {
        const object = model.getObjectByName(
          `${entry.controller}_car${String(i + 1).padStart(2, "0")}`,
        );
        if (object)
          parts.push({
            object,
            offset: (entry.car_length ?? 0) / 2 + i * ((entry.car_length ?? 0) + (entry.gap ?? 0)),
            halfSpan: (entry.car_length ?? 0) * 0.4,
          });
      }
    } else {
      let object = model.getObjectByName(`${entry.controller}_body`);
      if (!object && entry.sourceController) {
        const source = model.getObjectByName(`${entry.sourceController}_body`);
        if (source) {
          object = source.clone();
          object.name = `${entry.controller}_body`;
          model.add(object);
        }
      }
      if (object) parts.push({ object, offset: 0, halfSpan: 0 });
    }
    const halfTrain =
      ((entry.cars ?? 0) * ((entry.car_length ?? 0) + (entry.gap ?? 0)) - (entry.gap ?? 0)) / 2;
    const stops =
      train && route.stationCentre != null
        ? [
            {
              distance: Math.min(route.length - 1, route.stationCentre + halfTrain),
              group: "station",
            },
          ]
        : (route.stops ?? []);
    running.push({
      route,
      state: { distance: entry.s, dwell: 0, lastStop: -1 },
      stops,
      speed: train ? 10 : 8.33,
      train,
      parts,
    });
  }
  const lamps = new Map<string, THREE.MeshStandardMaterial>();
  city.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const material = mesh.material as THREE.MeshStandardMaterial;
    if (/^SG_(Veh|Ped)[AB]_[GYR]$/.test(material.name)) lamps.set(material.name, material);
  });
  let time = 0;
  const direction = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3();
  const up = new THREE.Vector3();
  const orientation = new THREE.Matrix4();
  const setPose = (v: RunningVehicle) => {
    for (const part of v.parts) {
      const distance = v.state.distance - part.offset;
      part.object.visible =
        distance - part.halfSpan >= 0 && distance + part.halfSpan <= v.route.length;
      if (!part.object.visible) continue;
      const sample = samplePath(v.route.pts, distance);
      part.object.position.set(sample.position[0], sample.position[2], -sample.position[1]);
      direction.set(sample.direction[0], sample.direction[2], -sample.direction[1]).normalize();
      if (part.halfSpan > 0) {
        // A carriage is rigid: use its two bogie positions rather than one short track segment.
        const rear = samplePath(v.route.pts, distance - part.halfSpan).position;
        const front = samplePath(v.route.pts, distance + part.halfSpan).position;
        part.object.position.set(
          (front[0] + rear[0]) / 2,
          (front[2] + rear[2]) / 2,
          -(front[1] + rear[1]) / 2,
        );
        direction.set(front[0] - rear[0], front[2] - rear[2], rear[1] - front[1]);
        if (direction.lengthSq() > 1e-12) direction.normalize();
        else
          direction.set(sample.direction[0], sample.direction[2], -sample.direction[1]).normalize();
      }
      // The exported visible Metro track has its own vertical transform; path data does not.
      if (v.route.kind === "rail" && v.route.line === "marunouchi")
        part.object.position.y += metroRailHeightOffset;
      // Preserve world-up while aligning the vehicle's +X axis with the path.
      // A shortest-arc rotation alone can turn the roof upside down near -X.
      side.crossVectors(direction, worldUp);
      if (side.lengthSq() < 1e-12) side.set(0, 0, 1);
      side.normalize();
      up.crossVectors(side, direction).normalize();
      part.object.quaternion.setFromRotationMatrix(orientation.makeBasis(direction, up, side));
    }
  };
  const setLamps = () => {
    const phase = ((time % 40) + 40) % 40;
    for (const [name, material] of lamps) {
      const group = name.includes("VehA") || name.includes("PedA") ? "A" : "B";
      const colour = name.at(-1) ?? "R";
      let lit = false;
      if (name.includes("Veh")) lit = signalPhase(group, time) === colour;
      else {
        const ped = pedestrianPhase(group, time);
        const green = ped === "walk" || (ped === "flash" && Math.floor(phase * 2) % 2 === 0);
        lit = colour === "G" ? green : ped === "stop";
      }
      material.emissive.setHex(colour === "G" ? 0x00c2a8 : colour === "Y" ? 0xffb000 : 0xff2a1e);
      material.emissiveIntensity = lit ? 3 : 0;
    }
  };
  for (const v of running) setPose(v);
  setLamps();
  return {
    update(seconds: number) {
      let remaining = seconds;
      while (remaining > 0) {
        const dt = Math.min(remaining, 0.1);
        for (const v of running) {
          const previous = v.state.distance;
          const next = advanceVehicle(v.state, dt, time, v.speed, v.stops, v.route.length, v.train);
          if (!v.train && next.distance < previous) {
            // The road is an open path; do not respawn on top of a car near its start.
            const blocked = running.some(
              (other) =>
                other !== v &&
                !other.train &&
                other.route === v.route &&
                other.state.distance < next.distance + 7,
            );
            if (blocked) next.distance = previous;
          }
          if (!v.train && next.distance >= previous) {
            for (const other of running) {
              if (
                other === v ||
                other.route !== v.route ||
                other.train ||
                other.state.distance <= previous
              )
                continue;
              next.distance = Math.max(previous, Math.min(next.distance, other.state.distance - 7));
            }
          }
          v.state = next;
        }
        time += dt;
        remaining -= dt;
      }
      for (const v of running) setPose(v);
      setLamps();
    },
  };
}
