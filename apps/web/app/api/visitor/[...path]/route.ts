import { getCloudSpine } from "../../../../lib/spine/cloud-runtime";
import { getLocalSpineStorage } from "../../../../lib/spine/local-runtime";
import { handleVisitorRequest } from "../../../../lib/visitor/http";
import {
  getVisitorBoundary,
  getVisitorService,
  visitorsEnabled,
} from "../../../../lib/visitor/runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  try {
    return await handleVisitorRequest(
      request,
      getVisitorService(),
      visitorsEnabled,
      process.env.AI_CITY_PUBLIC_ORIGIN,
      getVisitorBoundary(),
      process.env.AI_CITY_VISITOR_CODE_FREE === "1",
      new URL(request.url).pathname.startsWith("/api/visitor/spine/")
        ? getCloudSpine()
          ? null
          : await getLocalSpineStorage()
        : null,
      // The public photo-upload switch also needs to know whether real cloud intake exists.
      new URL(request.url).pathname === "/api/visitor/photo-upload-settings" ||
        new URL(request.url).pathname.startsWith("/api/visitor/spine/")
        ? getCloudSpine()
        : null,
    );
  } catch {
    return Response.json(
      {
        mode: "MOCK",
        error: {
          code: "STORE_UNAVAILABLE",
          message: "参加情報に接続できません。しばらく待ってからお試しください。",
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export { handle as GET, handle as POST };
