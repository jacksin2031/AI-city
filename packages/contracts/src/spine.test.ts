import { describe, expect, it } from "vitest";
import {
  SpineAdjustmentSchema,
  SpineCurrentResponseSchema,
  SpinePhotoConsentSchema,
  SpineTaskViewSchema,
} from "./spine";

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

describe("spine adjustment contract", () => {
  const part = { dx: 0.1, dy: -0.1, scale: 1.2 };
  const ok = { version: 1, parts: { hair: part, footLeft: { dx: 0, dy: 0, scale: 1 } } };
  it("accepts in-range values", () => {
    expect(SpineAdjustmentSchema.safeParse(ok).success).toBe(true);
    expect(SpineAdjustmentSchema.safeParse({ version: 1, parts: {} }).success).toBe(true);
  });
  it("rejects out-of-range, non-finite, unknown and extra input", () => {
    const bad = (value: unknown) => SpineAdjustmentSchema.safeParse(value).success;
    expect(bad({ version: 1, parts: { hair: { ...part, dx: 0.2 } } })).toBe(false);
    expect(bad({ version: 1, parts: { hair: { ...part, scale: 2 } } })).toBe(false);
    expect(bad({ version: 1, parts: { hair: { ...part, scale: Number.NaN } } })).toBe(false);
    expect(bad({ version: 1, parts: { hair: { ...part, dy: Number.POSITIVE_INFINITY } } })).toBe(
      false,
    );
    expect(bad({ version: 1, parts: { head: part } })).toBe(false);
    expect(bad({ ...ok, version: 2 })).toBe(false);
    expect(bad({ ...ok, extra: 1 })).toBe(false);
    expect(bad({ version: 1, parts: { hair: { ...part, extra: 1 } } })).toBe(false);
  });
});

describe("SpineAdminActionSchema", () => {
  const task = "spine-12345678-1234-4123-8123-123456789abc";
  it("accepts each action and rejects unsafe variants", async () => {
    const { SpineAdminActionSchema } = await import("./spine");
    const ok = [
      { action: "cancel", task },
      { action: "requeue", task, confirmCost: true },
      { action: "preset", task, presetId: "aoi" },
      { action: "adjust", task, adjustment: { version: 1, parts: {} } },
      { action: "resetAdjust", task },
    ];
    for (const value of ok) expect(SpineAdminActionSchema.safeParse(value).success).toBe(true);
    const bad = [
      { action: "requeue", task },
      { action: "requeue", task, confirmCost: false },
      { action: "preset", task, presetId: "nobody" },
      { action: "cancel", task, extra: 1 },
      {
        action: "adjust",
        task,
        adjustment: { version: 1, parts: { hair: { dx: Number.NaN, dy: 0, scale: 1 } } },
      },
    ];
    for (const value of bad) expect(SpineAdminActionSchema.safeParse(value).success).toBe(false);
  });
});
