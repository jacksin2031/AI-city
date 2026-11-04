import { describe, expect, it } from "vitest";
import { animationFor, characterAspect } from "./animated-character";

describe("animated character action mapping", () => {
  it("maps direction and walking to the corresponding movement animation", () => {
    expect(animationFor("walk", "left", false)).toBe("movement/trot-left");
    expect(animationFor("walk", "back", false)).toBe("movement/trot-back");
  });
  it("uses front-facing idle when presenting and keeps motion disabled at idle", () => {
    expect(animationFor("walk", "right", true)).toBe("movement/idle-front");
    expect(animationFor("idle", "back", false)).toBe("movement/idle-back");
  });
});

describe("character texture proportions", () => {
  it("preserves the actual canvas aspect ratio and the original illustration ratio", () => {
    expect(characterAspect({ width: 256, height: 256 })).toBe(1);
    expect(characterAspect({ width: 192, height: 256 })).toBe(0.75);
    expect(characterAspect(undefined)).toBe(0.75);
  });
});
