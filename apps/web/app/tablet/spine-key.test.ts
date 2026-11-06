import { describe, expect, it } from "vitest";
import { spineBundleKey, staleSpineVersions } from "./spine-key";

const adj = { version: 1 as const, parts: { hair: { dx: 0, dy: 0.1, scale: 1 } } };

describe("tablet spine player keying", () => {
  it("keys by version and adjustment, null when absent", () => {
    expect(spineBundleKey("t1", undefined)).toBe("t1:null");
    expect(spineBundleKey("t1", null)).toBe("t1:null");
    expect(spineBundleKey("t1", adj)).toBe(`t1:${JSON.stringify(adj)}`);
    expect(spineBundleKey("t1", adj)).not.toBe(spineBundleKey("t1", undefined));
  });
  it("reports only versions whose adjustment changed since the player was built", () => {
    const built = new Map([
      ["a", spineBundleKey("a", undefined)],
      ["b", spineBundleKey("b", adj)],
      ["c", spineBundleKey("c", undefined)],
    ]);
    const avatars = [
      { manifest: { avatarVersion: "a", adjustment: adj } }, // saved
      { manifest: { avatarVersion: "b" } }, // cleared
      { manifest: { avatarVersion: "c" } }, // unchanged
      { manifest: { avatarVersion: "d" } }, // no player yet
    ];
    expect(staleSpineVersions(built, avatars)).toEqual(["a", "b"]);
  });
});
