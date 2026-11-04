import { describe, expect, it } from "vitest";
import {
  FocusNextResponseSchema,
  FocusRequestInputSchema,
  FocusStatusResponseSchema,
} from "./focus-link";

const id = "11111111-1111-4111-8111-111111111111";
describe("focus transport contract", () => {
  it("accepts the idempotency key and known status", () => {
    expect(FocusRequestInputSchema.safeParse({ requestId: id }).success).toBe(true);
    expect(
      FocusStatusResponseSchema.safeParse({ mode: "MOCK", requestId: id, status: "APPLIED" })
        .success,
    ).toBe(true);
    expect(
      FocusNextResponseSchema.safeParse({
        mode: "MOCK",
        focus: { requestId: id, residentId: "fixture-resident" },
      }).success,
    ).toBe(true);
  });
  it("rejects added private fields, invalid ids and unknown states", () => {
    expect(FocusRequestInputSchema.safeParse({ requestId: id, residentId: "other" }).success).toBe(
      false,
    );
    expect(FocusRequestInputSchema.safeParse({ requestId: "invalid" }).success).toBe(false);
    expect(
      FocusStatusResponseSchema.safeParse({ mode: "MOCK", requestId: id, status: "CONFIRMED" })
        .success,
    ).toBe(false);
    expect(
      FocusNextResponseSchema.safeParse({
        mode: "MOCK",
        focus: { requestId: id, residentId: "fixture-resident", ownerDigest: "private" },
      }).success,
    ).toBe(false);
  });
});
