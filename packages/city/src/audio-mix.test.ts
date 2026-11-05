import { describe, expect, it } from "vitest";
import {
  type AudioFrame,
  audibleSignals,
  cueBeat,
  pedestrianCue,
  proximity,
  railBeat,
  reach,
  streetMix,
  zoomGain,
} from "./audio-mix";

const frame = (over: Partial<AudioFrame> = {}): AudioFrame => ({
  time: 0,
  listener: { x: 0, y: 0 },
  zoomRatio: 1,
  signals: [],
  vehicles: [],
  ...over,
});

describe("proximity", () => {
  it("is full at the listener and silent at and beyond the radius", () => {
    expect(proximity(0, 50)).toBe(1);
    expect(proximity(50, 50)).toBe(0);
    expect(proximity(80, 50)).toBe(0);
    expect(proximity(25, 50)).toBeCloseTo(0.25);
  });
});

describe("pedestrian signal sounds", () => {
  it("sound only while pedestrians may cross, matching the lamps", () => {
    // Group B walks 0.5–11s, flashes 11–15s, stops after. Group A walks 21–31s.
    expect(pedestrianCue("B", 5)).toMatchObject({ kind: "chirp" });
    expect(pedestrianCue("B", 20)).toBeNull();
    expect(pedestrianCue("A", 25)).toMatchObject({ kind: "cuckoo" });
    expect(pedestrianCue("A", 5)).toBeNull();
  });

  it("hurry while the green is flashing", () => {
    const walk = pedestrianCue("B", 5);
    const flash = pedestrianCue("B", 12);
    expect(walk && flash && flash.interval < walk.interval).toBe(true);
  });

  it("advances the beat once per interval", () => {
    const cue = pedestrianCue("B", 5);
    if (!cue) throw new Error("expected a cue");
    expect(cueBeat(cue, 5)).not.toBe(cueBeat(cue, 5 + cue.interval));
    expect(cueBeat(cue, 5)).toBe(cueBeat(cue, 5 + cue.interval / 10));
  });

  it("keeps only the nearest signals audible", () => {
    const signals = [0, 10, 20, 30, 200].map((x) => ({
      x,
      y: 0,
      height: 0,
      dx: 1,
      dy: 0,
      group: "A" as const,
    }));
    const heard = audibleSignals(frame({ signals }), 2);
    expect(heard.map((entry) => entry.index)).toEqual([0, 1]);
    expect(audibleSignals(frame({ signals: signals.slice(4) })).length).toBe(0);
  });
});

describe("street mix", () => {
  const car = (x: number, moving: boolean, id = 0) => ({
    id,
    x,
    y: 0,
    train: false,
    moving,
    distance: 0,
    dwelling: false,
  });

  it("is silent when nothing is near", () => {
    const mix = streetMix(frame({ vehicles: [car(500, true)] }));
    expect(mix).toEqual({ cars: 0, train: 0, nearestTrain: null });
  });

  it("makes a driving car louder than an idling one", () => {
    const driving = streetMix(frame({ vehicles: [car(10, true)] })).cars;
    const idling = streetMix(frame({ vehicles: [car(10, false)] })).cars;
    expect(driving).toBeGreaterThan(idling);
    expect(idling).toBeGreaterThan(0);
  });

  it("hears a train from further away than a car and reports its station stop", () => {
    const train = {
      id: 7,
      x: 90,
      y: 0,
      train: true,
      moving: false,
      distance: 321,
      dwelling: true,
    };
    const mix = streetMix(frame({ vehicles: [train, car(90, true, 8)] }));
    expect(mix.cars).toBe(0);
    expect(mix.train).toBe(0);
    expect(mix.nearestTrain).toMatchObject({ id: 7, dwelling: true, distance: 321 });
  });

  it("is louder zoomed in, within limits", () => {
    expect(zoomGain(4)).toBeGreaterThan(zoomGain(1));
    expect(zoomGain(100)).toBe(1.5);
    expect(zoomGain(0.0001)).toBe(0.6);
  });
});

describe("reach", () => {
  it("hears further when zoomed out and only nearby sounds when zoomed in", () => {
    expect(reach(0.35)).toBeGreaterThan(1);
    expect(reach(4)).toBeLessThan(1);
    expect(reach(0.0001)).toBe(2.2);
    expect(reach(1000)).toBe(0.8);
  });
});

describe("rail joints", () => {
  it("click over once every few metres", () => {
    expect(railBeat(0)).toBe(0);
    expect(railBeat(4.9)).toBe(0);
    expect(railBeat(5)).toBe(1);
  });
});
