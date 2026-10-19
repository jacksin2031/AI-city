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
