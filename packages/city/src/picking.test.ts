import { describe, expect, it } from "vitest";
import { type PickTarget, pickResident } from "./picking";

// A small resident, as drawn when the camera is zoomed out: roughly 14x30 scene units.
const small = (id: string, x: number, y: number): PickTarget => ({
  id,
  x,
  y,
  width: 14,
  height: 30,
});
const options = { minWidth: 56, minHeight: 56 };

describe("pickResident", () => {
  it("selects a resident from a tap on their body", () => {
    expect(pickResident([small("a", 100, 100)], { x: 102, y: 95 }, options)).toBe("a");
  });

  it("selects a small resident from a tap beside them, inside the enlarged area", () => {
    const targets = [small("a", 100, 100)];
    expect(pickResident(targets, { x: 120, y: 100 }, options)).toBe("a");
    expect(pickResident(targets, { x: 100, y: 124 }, options)).toBe("a");
  });

  it("ignores a tap outside the enlarged area", () => {
    expect(pickResident([small("a", 100, 100)], { x: 140, y: 100 }, options)).toBeNull();
  });

  it("gives overlapping enlarged areas to the nearest resident", () => {
    const targets = [small("a", 100, 100), small("b", 130, 100)];
    expect(pickResident(targets, { x: 110, y: 100 }, options)).toBe("a");
    expect(pickResident(targets, { x: 121, y: 100 }, options)).toBe("b");
  });

  it("lets a tap on a drawn body beat a neighbour's enlarged area", () => {
    const targets = [small("a", 100, 100), small("b", 112, 100)];
    // x = 117 is on b's body (105..119) and only inside a's enlarged area.
    expect(pickResident(targets, { x: 117, y: 100 }, options)).toBe("b");
  });

  it("does not use the enlarged area where a building was tapped", () => {
    const targets = [small("a", 100, 100)];
    expect(pickResident(targets, { x: 120, y: 100 }, { ...options, exactOnly: true })).toBeNull();
    expect(pickResident(targets, { x: 102, y: 100 }, { ...options, exactOnly: true })).toBe("a");
  });

  it("keeps the drawn size for residents already larger than the minimum", () => {
    const large: PickTarget = { id: "big", x: 300, y: 300, width: 90, height: 120 };
    expect(pickResident([large], { x: 300, y: 355 }, options)).toBe("big");
    expect(pickResident([large], { x: 300, y: 380 }, options)).toBeNull();
  });

  it("returns null when nobody is in the scene", () => {
    expect(pickResident([], { x: 1, y: 1 }, options)).toBeNull();
  });
});
