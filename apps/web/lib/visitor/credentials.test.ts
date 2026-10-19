import { describe, expect, it } from "vitest";
import { createVisitorBoundary } from "./credentials";

describe("visitor credentials reject unissued capabilities before datastore access", () => {
  it("rejects unsigned/tampered/wrong-purpose credentials and binds the namespace", () => {
    const security = createVisitorBoundary("fixture-only-secret".repeat(3), "test");
    const other = createVisitorBoundary("fixture-only-secret".repeat(3), "other");
    const token = "a".repeat(64);
    const signed = security.signSession(token);
    expect(signed).not.toBe(token);
    expect(security.readSession(signed)).toBe(token);
    expect(security.readSession(token)).toBeNull();
    expect(security.readSession(`${signed.slice(0, -1)}!`)).toBeNull();
    expect(other.readSession(signed)).toBeNull();
    const code = "b".repeat(32);
    const invitation = security.signInvitation(code);
    expect(invitation).toHaveLength(64);
    expect(security.readInvitation(invitation)).toBe(code);
    expect(security.readInvitation(token)).toBeNull();
    expect(security.readSession(invitation)).toBeNull();
  });
  it("bounds repeated reads by an issued capability and releases the bucket after a minute", () => {
    let now = 1000;
    const security = createVisitorBoundary("fixture-only-secret".repeat(3), "test", () => now);
    for (let i = 0; i < 60; i++) security.allow("issued-credential");
    expect(() => security.allow("issued-credential")).toThrow();
    now += 60001;
    expect(() => security.allow("issued-credential")).not.toThrow();
  });
});
