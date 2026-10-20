import { describe, expect, it } from "vitest";
import {
  VisitorInvitationSchema,
  VisitorSessionRequestSchema,
  visitorInvitationFixture,
} from "./visitor";

describe("visitor admission contracts", () => {
  it("validates explicitly fictional fixtures and rejects role/private fields", () => {
    expect(VisitorInvitationSchema.safeParse(visitorInvitationFixture).success).toBe(true);
    expect(VisitorSessionRequestSchema.safeParse({ invitation: "a".repeat(64) }).success).toBe(
      true,
    );
    expect(
      VisitorSessionRequestSchema.safeParse({ invitation: "a".repeat(64), role: "ADMIN" }).success,
    ).toBe(false);
    expect(VisitorSessionRequestSchema.safeParse({ invitation: "1234" }).success).toBe(false);
    expect(
      VisitorInvitationSchema.safeParse({ ...visitorInvitationFixture, sessionToken: "private" })
        .success,
    ).toBe(false);
  });
});
