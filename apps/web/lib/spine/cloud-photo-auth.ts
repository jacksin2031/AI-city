import { GoogleAuth } from "google-auth-library";
import { CloudPhotoStorage } from "./cloud-photo-storage";

/** Explicit runtime factory; creation does not request credentials or contact the network. */
export function createCloudPhotoStorage(projectId: string, bucket: string) {
  if (projectId !== "ai-city-511822") throw new Error("CLOUD_WORKER_CONFIG_INVALID");
  const auth = new GoogleAuth({
    projectId,
    scopes: ["https://www.googleapis.com/auth/devstorage.read_only"],
  });
  return new CloudPhotoStorage(bucket, async () => (await auth.getAccessToken()) ?? null);
}
