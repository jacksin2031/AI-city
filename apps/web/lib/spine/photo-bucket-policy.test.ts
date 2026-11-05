import { describe, expect, it, vi } from "vitest";
import { assertPhotoBucketPolicy, verifyPhotoBucket } from "./photo-bucket-policy";

const safe = () => ({
  name: "ai-city-photo-test",
  location: "ASIA-NORTHEAST1",
  softDeletePolicy: { retentionDurationSeconds: "0" },
  iamConfiguration: {
    publicAccessPrevention: "enforced",
    uniformBucketLevelAccess: { enabled: true },
  },
});

describe("private photo bucket policy", () => {
  it("accepts an explicitly private bucket with soft deletion disabled", () => {
    expect(() => assertPhotoBucketPolicy(safe(), "ai-city-photo-test")).not.toThrow();
  });
  it.each([
    { softDeletePolicy: undefined },
    { softDeletePolicy: { retentionDurationSeconds: "604800" } },
    { softDeletePolicy: { retentionDurationSeconds: "0", hardDeletePause: { enabled: true } } },
    { versioning: { enabled: true } },
    { defaultEventBasedHold: true },
    { retentionPolicy: { retentionPeriod: "60" } },
    { objectRetention: { mode: "Enabled" } },
    {
      iamConfiguration: {
        publicAccessPrevention: "inherited",
        uniformBucketLevelAccess: { enabled: true },
      },
    },
    {
      iamConfiguration: {
        publicAccessPrevention: "enforced",
        uniformBucketLevelAccess: { enabled: false },
      },
    },
    { location: "US" },
    { name: "another-bucket" },
  ])("rejects an unsafe or unverified setting %#", (override) => {
    expect(() => assertPhotoBucketPolicy({ ...safe(), ...override }, "ai-city-photo-test")).toThrow(
      "PHOTO_BUCKET_UNSAFE",
    );
  });
  it("does not accept malformed metadata", () => {
    for (const metadata of [null, {}, [], "bucket"]) {
      expect(() => assertPhotoBucketPolicy(metadata, "ai-city-photo-test")).toThrow(
        "PHOTO_BUCKET_UNSAFE",
      );
    }
  });
  it("fetches metadata and fails closed when the metadata request fails", async () => {
    const fetchMetadata = vi.fn(async () => safe());
    await verifyPhotoBucket("ai-city-photo-test", fetchMetadata);
    expect(fetchMetadata).toHaveBeenCalledWith("ai-city-photo-test");
    await expect(
      verifyPhotoBucket("ai-city-photo-test", async () => {
        throw new Error("network");
      }),
    ).rejects.toThrow("PHOTO_BUCKET_UNSAFE");
  });
});
