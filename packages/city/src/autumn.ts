import * as THREE from "three";

export type TimeOfDay = "morning" | "afternoon" | "dusk" | "night";
type Lighting = {
  sky: THREE.Color;
  ground: THREE.Color;
  sun: THREE.Color;
  background: THREE.Color;
  hemisphereIntensity: number;
  sunIntensity: number;
  exposure: number;
  direction: THREE.Vector3;
};

// Stylised autumn light, not an astronomical or weather simulation.
const presets: Record<TimeOfDay, Lighting> = {
  morning: {
    sky: new THREE.Color(0xe2e8ef),
    ground: new THREE.Color(0x9c806a),
    sun: new THREE.Color(0xffd49d),
    background: new THREE.Color(0xc6c5bb),
    hemisphereIntensity: 1.8,
    sunIntensity: 3.4,
    exposure: 1.2,
    direction: new THREE.Vector3(0.58, 0.58, -0.57).normalize(),
  },
  afternoon: {
    sky: new THREE.Color(0xfff3e0),
    ground: new THREE.Color(0x8a7d6a),
    sun: new THREE.Color(0xffd9ad),
    background: new THREE.Color(0xd5c9b8),
    hemisphereIntensity: 2.1,
    sunIntensity: 4.6,
    exposure: 1.25,
    direction: new THREE.Vector3(-0.47, 0.574, 0.671).normalize(),
  },
  dusk: {
    sky: new THREE.Color(0xe6a59b),
    ground: new THREE.Color(0x745969),
    sun: new THREE.Color(0xff9a5f),
    background: new THREE.Color(0xa38988),
    hemisphereIntensity: 1.35,
    sunIntensity: 2.8,
    exposure: 1.15,
    direction: new THREE.Vector3(-0.7, 0.3, 0.64).normalize(),
  },
  night: {
    sky: new THREE.Color(0x899fc8),
    ground: new THREE.Color(0x53546b),
    sun: new THREE.Color(0x9bb5e5),
    background: new THREE.Color(0x404b67),
    hemisphereIntensity: 0.95,
    sunIntensity: 0.65,
    exposure: 1.1,
    direction: new THREE.Vector3(-0.4, 0.65, 0.65).normalize(),
  },
};
const starts: { minute: number; period: TimeOfDay; previous: TimeOfDay }[] = [
  { minute: 360, period: "morning", previous: "night" },
  { minute: 600, period: "afternoon", previous: "morning" },
  { minute: 960, period: "dusk", previous: "afternoon" },
  { minute: 1140, period: "night", previous: "dusk" },
];

export function timeOfDay(date: Date): TimeOfDay {
  const minute = date.getHours() * 60 + date.getMinutes();
  if (minute >= 360 && minute < 600) return "morning";
  if (minute >= 600 && minute < 960) return "afternoon";
  if (minute >= 960 && minute < 1140) return "dusk";
  return "night";
}

export function autumnLighting(date: Date): Lighting {
  const minute = date.getHours() * 60 + date.getMinutes();
  const upcoming = starts.find((start) => minute >= start.minute - 30 && minute < start.minute);
  const target = presets[upcoming?.period ?? timeOfDay(date)];
  const previous = presets[upcoming?.previous ?? timeOfDay(date)];
  const amount = upcoming ? (minute - (upcoming.minute - 30)) / 30 : 1;
  const mix = (a: number, b: number) => a + (b - a) * amount;
  return {
    sky: previous.sky.clone().lerp(target.sky, amount),
    ground: previous.ground.clone().lerp(target.ground, amount),
    sun: previous.sun.clone().lerp(target.sun, amount),
    background: previous.background.clone().lerp(target.background, amount),
    hemisphereIntensity: mix(previous.hemisphereIntensity, target.hemisphereIntensity),
    sunIntensity: mix(previous.sunIntensity, target.sunIntensity),
    exposure: mix(previous.exposure, target.exposure),
    direction: previous.direction.clone().lerp(target.direction, amount).normalize(),
  };
}
