import { handleDialogueRequest } from "../../../../lib/link/dialogue";
import { deviceLinkService, dialogueService, previewEnabled } from "../../../../lib/link/runtime";
import { handlePersistentDeviceRequest } from "../../../../lib/visitor/device-http";
import { getVisitorBoundary, getVisitorService } from "../../../../lib/visitor/runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  try {
    if (new URL(request.url).pathname === "/api/link/dialogue")
      return await handleDialogueRequest(
        request,
        deviceLinkService,
        dialogueService,
        previewEnabled,
        process.env.AI_CITY_PUBLIC_ORIGIN,
      );
    return await handlePersistentDeviceRequest(
      request,
      deviceLinkService,
      getVisitorService(),
      previewEnabled,
      process.env.AI_CITY_PUBLIC_ORIGIN,
      process.env.AI_CITY_LOOPBACK_PREVIEW === "1",
      getVisitorBoundary(),
    );
  } catch {
    return Response.json(
      {
        mode: "MOCK",
        error: {
          code: "STORE_UNAVAILABLE",
          message: "街の情報に接続できません。しばらく待ってお試しください。",
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export { handle as GET, handle as POST };
