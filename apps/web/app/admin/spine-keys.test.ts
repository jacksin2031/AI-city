import { describe, expect, it } from "vitest";
import { adjustmentKey, bundleKey } from "./spine-keys";

const make = () => ({
  runtime: "4.3" as const,
  skeleton: "/avatars/a/b/skeleton.json",
  atlas: "/avatars/a/b/skeleton.atlas",
  pages: ["/avatars/a/b/p.png"],
  orientationPolicy: "/avatars/a/b/orientation-policy.json",
  buildManifest: "/avatars/a/b/build-manifest.json",
  sha256: "a".repeat(64),
});

describe("spine keys", () => {
  it("is equal for equal bundles in different objects and differs by sha256", () => {
    expect(bundleKey(make())).toBe(bundleKey(make()));
    expect(bundleKey({ ...make(), sha256: "b".repeat(64) })).not.toBe(bundleKey(make()));
  });
  it("is content based for adjustments", () => {
    const a = { version: 1 as const, parts: { hair: { dx: 0.1, dy: 0, scale: 1 } } };
    expect(adjustmentKey(a)).toBe(adjustmentKey(structuredClone(a)));
    expect(adjustmentKey(null)).not.toBe(adjustmentKey(a));
  });
});
