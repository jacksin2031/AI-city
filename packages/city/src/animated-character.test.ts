import { describe, expect, it } from "vitest";
import { animationFor } from "./animated-character";

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
