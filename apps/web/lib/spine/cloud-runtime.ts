import { visitorConfig } from "../visitor/config";
import { CloudAssetStorage } from "./cloud-asset-storage";

/**
 * Cloud delivery of published Spine bundles. Off unless explicitly enabled, and only for the
 * approved Firestore exhibition configuration, so local and emulator runs never reach the cloud.
 */
export function getCloudAssetStorage(
  env: Record<string, string | undefined> = process.env,
): CloudAssetStorage | null {
  if (env.AI_CITY_SPINE_CLOUD_ASSETS !== "1") return null;
  const config = visitorConfig(env);
  if (!config || config.emulator) return null;
  const bucket = env.AI_CITY_SPINE_ASSET_BUCKET;
  if (!bucket) throw new Error("SPINE_ASSET_BUCKET_REQUIRED");
  return new CloudAssetStorage(bucket, async () => {
    const { GoogleAuth } = await import("google-auth-library");
    return (
      (await new GoogleAuth({
        projectId: config.projectId,
        scopes: ["https://www.googleapis.com/auth/devstorage.read_write"],
      }).getAccessToken()) ?? null
    );
  });
}
