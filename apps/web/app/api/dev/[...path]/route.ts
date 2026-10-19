import { handleDevelopmentRequest } from "../../../../lib/development/http";
import { participationService } from "../../../../lib/development/runtime";
import { deviceLinkService, previewEnabled, readLinkToken } from "../../../../lib/link/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function handle(request: Request) {
  let authorized = false;
  if (process.env.AI_CITY_PUBLIC_ORIGIN) {
    try {
      deviceLinkService.authorizeParticipant(readLinkToken(request));
      authorized = true;
    } catch {
      /* The HTTP boundary returns the Japanese 403. */
    }
  }
  return handleDevelopmentRequest(
    request,
    participationService,
    previewEnabled,
    process.env.AI_CITY_PUBLIC_ORIGIN,
    authorized,
  );
}

export { handle as GET, handle as POST };
