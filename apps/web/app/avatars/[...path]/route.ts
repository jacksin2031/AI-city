import { handleSpineAsset } from "../../../lib/spine/asset-http";
import { getCloudAssetStorage } from "../../../lib/spine/cloud-runtime";
import { getLocalSpineStorage } from "../../../lib/spine/local-runtime";
import { getSpineJobs } from "../../../lib/visitor/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    // Hosted runs read published bundles from the private bucket; local runs use the worker's disk.
    const cloud = getCloudAssetStorage();
    return await handleSpineAsset(
      request,
      getSpineJobs(),
      cloud ?? (await getLocalSpineStorage()),
      cloud ? process.env.AI_CITY_PUBLIC_ORIGIN : undefined,
    );
  } catch (error) {
    const code =
      error instanceof Error && /^(SPINE_[A-Z_]+|CLOUD_ASSET_[A-Z_]+)$/.test(error.message)
        ? error.message
        : "UNEXPECTED";
    console.error(`[spine-asset] initialization failed: ${code}`);
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
}
