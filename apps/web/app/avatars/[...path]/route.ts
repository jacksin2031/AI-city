import { handleLocalSpineAsset } from "../../../lib/spine/asset-http";
import { getLocalSpineStorage } from "../../../lib/spine/local-runtime";
import { getSpineJobs } from "../../../lib/visitor/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return await handleLocalSpineAsset(request, getSpineJobs(), await getLocalSpineStorage());
  } catch {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}
