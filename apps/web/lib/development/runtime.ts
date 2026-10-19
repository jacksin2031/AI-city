import { LocalParticipationService } from "./service";

const local = globalThis as typeof globalThis & {
  aiCityLocalParticipation?: LocalParticipationService;
};
local.aiCityLocalParticipation ??= new LocalParticipationService();
export const participationService = local.aiCityLocalParticipation;
