import { handleDialogueRequest } from "../../../../lib/link/dialogue";
import { deviceLinkService, dialogueService, previewEnabled } from "../../../../lib/link/runtime";
import { withSharedDeviceState } from "../../../../lib/link/shared-state";
import { getCloudSpine } from "../../../../lib/spine/cloud-runtime";
import { handlePersistentDeviceRequest } from "../../../../lib/visitor/device-http";
import {
  getVisitorBoundary,
  getVisitorService,
  getVisitorStore,
} from "../../../../lib/visitor/runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  try {
    const origin = process.env.AI_CITY_PUBLIC_ORIGIN;
    // Share sessions through the visitor store when persistence is configured; otherwise stay local.
    getVisitorService();
    deviceLinkService.attachStore(getVisitorStore());
    return await withSharedDeviceState(request, deviceLinkService, origin, () =>
      new URL(request.url).pathname === "/api/link/dialogue"
        ? handleDialogueRequest(request, deviceLinkService, dialogueService, previewEnabled, origin)
        : handlePersistentDeviceRequest(
            request,
            deviceLinkService,
            getVisitorService(),
            previewEnabled,
            origin,
            process.env.AI_CITY_LOOPBACK_PREVIEW === "1",
            getVisitorBoundary(),
            () => getCloudSpine()?.photos,
          ),
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
