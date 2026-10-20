import type { PublicResident } from "@ai-city/contracts";
import { developmentCitySnapshot } from "@ai-city/contracts/development";

export function getDevelopmentResidents(): PublicResident[] {
  return structuredClone(developmentCitySnapshot.residents);
}

export {
  closePresentation,
  openProfile,
  type ResidentPresentation,
  updatePresentation,
} from "./presentation";
export { createDevelopmentCity, type IllustratedCity } from "./renderer";
export { type CityRoster, reconcileRoster } from "./roster";
export type { CityAction, Direction } from "./simulation";
