import { GoogleAuth } from "google-auth-library";
import { verifyPhotoBucket } from "../lib/spine/photo-bucket-policy";

async function main() {
  const bucket = process.argv[2];
  if (!bucket || process.argv.length !== 3 || !/^[a-z0-9][a-z0-9.-]{1,220}[a-z0-9]$/.test(bucket))
    throw new Error("INVALID_BUCKET");
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/devstorage.read_only"] });
  const client = await auth.getClient();
  await verifyPhotoBucket(bucket, async (name) => {
    const response = await client.request({
      url: `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(name)}`,
      timeout: 10_000,
    });
    return response.data;
  });
  process.stdout.write(
    "Photo bucket policy passed. IAM and deletion still require separate verification.\n",
  );
}

main().catch(() => {
  process.stderr.write("Photo bucket policy could not be verified; do not admit photos.\n");
  process.exitCode = 1;
});
