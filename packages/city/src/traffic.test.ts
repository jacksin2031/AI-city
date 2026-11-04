import { describe, expect, it } from "vitest";
import { advanceVehicle, pedestrianPhase, samplePath, signalPhase } from "./traffic";

describe("traffic simulation", () => {
  it("keeps vehicle signals complementary including amber and all-red", () => {
    expect(signalPhase("A", 15)).toBe("G");
    expect(signalPhase("A", 17)).toBe("Y");
    expect(signalPhase("A", 20)).toBe("R");
    expect(signalPhase("B", 20)).toBe("R");
    expect(signalPhase("B", 22)).toBe("G");
    expect(signalPhase("A", 40)).toBe("G");
  });
  it("stops at a red light and resumes on green without crossing the stop line", () => {
    const car = { distance: 4, dwell: 0, lastStop: -1 };
    const stopped = advanceVehicle(car, 2, 20, 10, [{ distance: 10, group: "A" }], 100, false);
    expect(stopped.distance).toBe(10);
    expect(
      advanceVehicle(stopped, 2, 22, 10, [{ distance: 10, group: "A" }], 100, false).distance,
    ).toBe(10);
    expect(
      advanceVehicle(stopped, 2, 40, 10, [{ distance: 10, group: "A" }], 100, false).distance,
    ).toBeGreaterThan(10);
  });
  it("holds a train at the platform before departure and does not stop twice", () => {
    const stop = [{ distance: 10, group: "station" }];
    let train = advanceVehicle({ distance: 4, dwell: 0, lastStop: -1 }, 1, 44, 10, stop, 100, true);
    expect(train.distance).toBe(10);
    expect(train.dwell).toBeGreaterThan(0);
    train = advanceVehicle(train, 5, 45, 10, stop, 100, true);
    expect(train.distance).toBe(10);
    train = advanceVehicle(train, 11, 50, 10, stop, 100, true);
    expect(train.distance).toBeGreaterThan(10);
  });
  it("samples position and direction on the road including endpoints", () => {
    const pts: [number, number, number][] = [
      [0, 0, 0],
      [10, 0, 0],
      [10, 10, 0],
    ];
    expect(samplePath(pts, 15).position).toEqual([10, 5, 0]);
    expect(samplePath(pts, -1).position).toEqual([0, 0, 0]);
  });
});

it("uses the pedestrian lamp's steady, flashing and stop phases", () => {
  expect(pedestrianPhase("A", 20)).toBe("stop");
  expect(pedestrianPhase("A", 21)).toBe("walk");
  expect(pedestrianPhase("A", 31)).toBe("flash");
  expect(pedestrianPhase("A", 35)).toBe("stop");
  expect(pedestrianPhase("B", 0.5)).toBe("walk");
  expect(pedestrianPhase("B", 11)).toBe("flash");
  expect(pedestrianPhase("B", 15)).toBe("stop");
});
