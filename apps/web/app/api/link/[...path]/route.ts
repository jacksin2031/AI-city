import { handleLinkRequest } from "../../../../lib/link/http";
import { deviceLinkService, previewEnabled } from "../../../../lib/link/runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function handle(request: Request) {
  return handleLinkRequest(
    request,
    deviceLinkService,
    previewEnabled,
    process.env.AI_CITY_PUBLIC_ORIGIN,
    process.env.AI_CITY_LOOPBACK_PREVIEW === "1",
  );
}

export { handle as GET, handle as POST };
