import { z } from "zod";

// Cloud Storage bucket metadata is external input. Reject ambiguous deletion settings.
const bucketPolicySchema = z.object({
  name: z.string(),
  location: z.string(),
  softDeletePolicy: z.object({
    retentionDurationSeconds: z.union([z.literal("0"), z.literal(0)]),
    hardDeletePause: z.object({ enabled: z.literal(false).optional() }).optional(),
  }),
  versioning: z.object({ enabled: z.literal(false).optional() }).optional(),
  defaultEventBasedHold: z.literal(false).optional(),
  retentionPolicy: z.never().optional(),
  objectRetention: z.object({ mode: z.literal("Disabled") }).optional(),
  iamConfiguration: z.object({
    publicAccessPrevention: z.literal("enforced"),
    uniformBucketLevelAccess: z.object({ enabled: z.literal(true) }),
  }),
});

/** Check fresh metadata before use; this alone does not prove IAM or deletion of old objects. */
export function assertPhotoBucketPolicy(metadata: unknown, expectedBucket: string): void {
  const parsed = bucketPolicySchema.safeParse(metadata);
  if (
    !parsed.success ||
    !/^[a-z0-9][a-z0-9.-]{1,220}[a-z0-9]$/.test(expectedBucket) ||
    parsed.data.name !== expectedBucket ||
    parsed.data.location !== "ASIA-NORTHEAST1"
  )
    throw new Error("PHOTO_BUCKET_UNSAFE");
}

/** The adapter supplies a fresh authenticated metadata read. No access means no admission. */
export async function verifyPhotoBucket(
  bucket: string,
  fetchMetadata: (bucket: string) => Promise<unknown>,
): Promise<void> {
  try {
    assertPhotoBucketPolicy(await fetchMetadata(bucket), bucket);
  } catch {
    throw new Error("PHOTO_BUCKET_UNSAFE");
  }
}
