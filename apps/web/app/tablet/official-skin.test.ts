import { describe, expect, it } from "vitest";
import { officialSkinFor } from "./official-skin";

describe("officialSkinFor", () => {
  it("reads an admin preset from its resident id", () => {
    expect(officialSkinFor({ residentId: "preset-aoi", avatarVersion: "fixture-sora-v1" })).toBe(
      "spineboy",
    );
    expect(officialSkinFor({ residentId: "preset-kaede-2", avatarVersion: "x" })).toBe("davide");
  });
  it("reads a participant who joined as a prepared character from the avatar version", () => {
    expect(
      officialSkinFor({
        residentId: "8369cc49-ee80-4808-9768-05d47a6a4422",
        avatarVersion: "sample-ren-v1",
      }),
    ).toBe("misaki");
  });
  it("gives ordinary residents no official skin", () => {
    expect(officialSkinFor({ residentId: "abc", avatarVersion: "fixture-haru-v1" })).toBeNull();
    expect(officialSkinFor({ residentId: "preset-nobody", avatarVersion: "x" })).toBeNull();
    expect(officialSkinFor({ residentId: "abc", avatarVersion: "sample-nobody-v1" })).toBeNull();
  });
});
