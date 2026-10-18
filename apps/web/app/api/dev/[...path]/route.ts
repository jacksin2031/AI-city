import { handleDevelopmentRequest } from "../../../../lib/development/http";
import { LocalParticipationService } from "../../../../lib/development/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const local = globalThis as typeof globalThis & {
  aiCityLocalParticipation?: LocalParticipationService;
};
local.aiCityLocalParticipation ??= new LocalParticipationService();
const service = local.aiCityLocalParticipation;

function handle(request: Request) {
  return handleDevelopmentRequest(
    request,
    service,
    process.env.NODE_ENV === "development" || process.env.AI_CITY_ENABLE_LOCAL_MOCK === "1",
  );
}

export { handle as GET, handle as POST };
