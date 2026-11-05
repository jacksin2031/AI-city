import { describe, expect, it } from "vitest";
import { SpineCurrentResponseSchema, SpinePhotoConsentSchema, SpineTaskViewSchema } from "./spine";

describe("photo character task contract", () => {
  const task = "spine-123e4567-e89b-42d3-a456-426614174000";
  it("requires separate processing, external upload and publication consent", () => {
    const consent = {
      version: 2,
      processing: true,
      externalModelUpload: true,
      automaticPublication: true,
    };
    expect(SpinePhotoConsentSchema.safeParse(consent).success).toBe(true);
    for (const key of ["processing", "externalModelUpload", "automaticPublication"])
      expect(SpinePhotoConsentSchema.safeParse({ ...consent, [key]: false }).success).toBe(false);
    expect(SpinePhotoConsentSchema.safeParse({ ...consent, version: 1 }).success).toBe(false);
  });
  it("rejects private fields and requires cleanup status after withdrawal", () => {
    expect(
      SpineCurrentResponseSchema.safeParse({
        mode: "LOCAL_PRIVATE_TEST",
        job: { task, state: "PREPARED" },
      }).success,
    ).toBe(true);
    expect(SpineTaskViewSchema.safeParse({ task, state: "WITHDRAWN" }).success).toBe(false);
    expect(
      SpineTaskViewSchema.safeParse({ task, state: "WITHDRAWN", photoCleanup: "PENDING" }).success,
    ).toBe(true);
    expect(
      SpineTaskViewSchema.safeParse({ task, state: "PREPARED", photo: "private" }).success,
    ).toBe(false);
    expect(
      SpineTaskViewSchema.safeParse({ task, state: "PREPARED", photoCleanup: "COMPLETE" }).success,
    ).toBe(false);
  });
});
