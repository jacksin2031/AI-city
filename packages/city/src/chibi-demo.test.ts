import { describe, expect, it } from "vitest";
import { chibiAnimationForScreen } from "./chibi-demo";

describe("official Chibi animation directions", () => {
  it("maps screen-left and screen-right to the visually matching official animations", () => {
    expect(chibiAnimationForScreen("movement/trot-left")).toBe("movement/trot-right");
    expect(chibiAnimationForScreen("movement/trot-right")).toBe("movement/trot-left");
    expect(chibiAnimationForScreen("movement/idle-left")).toBe("movement/idle-right");
    expect(chibiAnimationForScreen("movement/idle-right")).toBe("movement/idle-left");
    expect(chibiAnimationForScreen("movement/trot-front")).toBe("movement/trot-front");
    expect(chibiAnimationForScreen("movement/trot-back")).toBe("movement/trot-back");
  });
});
