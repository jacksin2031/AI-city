import type { PublicResident } from "@ai-city/contracts";
import { developmentCitySnapshot } from "@ai-city/contracts/development";

export function getDevelopmentResidents(): PublicResident[] {
  const residents = structuredClone(developmentCitySnapshot.residents);
  const template = residents[0];
  if (!template) return residents;
  const names = [
    "あおい",
    "かえで",
    "みなと",
    "ひなた",
    "ゆい",
    "れん",
    "さくら",
    "なぎ",
    "りく",
    "つむぎ",
  ];
  return residents.concat(
    names.map((name, index) => ({
      ...template,
      residentId: `fixture-crowd-${index + 1}`,
      nickname: `見本 ${name}`,
      avatarVersion: "fixture-guest-v1",
      personalityLabel: "サンプル",
      interests: [],
    })),
  );
}

export type { AnimatedCharacter } from "./animated-character";
export { type ScenePresentationFrame, speechBounds } from "./focus";
export {
  closePresentation,
  openProfile,
  type ResidentPresentation,
  updatePresentation,
} from "./presentation";
export { createDevelopmentCity, type IllustratedCity } from "./renderer";
export { type CityRoster, reconcileRoster } from "./roster";
export type { CityAction, Direction } from "./simulation";
export { prepareSpineBundle } from "./spine-bundle";
export { clampSpeechToViewport } from "./viewport";
