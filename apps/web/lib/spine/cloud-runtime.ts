import { visitorConfig } from "../visitor/config";
import { CloudAssetStorage } from "./cloud-asset-storage";
import { CloudPhotoStorage } from "./cloud-photo-storage";

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
  return new CloudAssetStorage(bucket, tokenSource(config.projectId));
}

function tokenSource(projectId: string) {
  return async () => {
    const { GoogleAuth } = await import("google-auth-library");
    return (
      (await new GoogleAuth({
        projectId,
        scopes: ["https://www.googleapis.com/auth/devstorage.read_write"],
      }).getAccessToken()) ?? null
    );
  };
}

/**
 * Hosted photo intake: photos go to the private bucket and a trusted local worker picks them up.
 * Needs its own switch on top of cloud assets, so publishing bundles never implies accepting photos.
 */
export function getCloudSpine(env: Record<string, string | undefined> = process.env) {
  if (env.AI_CITY_SPINE_CLOUD_INTAKE !== "1") return null;
  const assets = getCloudAssetStorage(env);
  const config = visitorConfig(env);
  const bucket = env.AI_CITY_SPINE_PHOTO_BUCKET;
  if (!assets || !config || !bucket) throw new Error("SPINE_CLOUD_INTAKE_CONFIG");
  return { assets, photos: new CloudPhotoStorage(bucket, tokenSource(config.projectId)) };
}
