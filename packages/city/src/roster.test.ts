import { developmentCitySnapshot } from "@ai-city/contracts/development";
import { describe, expect, it } from "vitest";
import { reconcileRoster } from "./roster";

describe("illustrated city's public roster", () => {
  it("restores the snapshot without replaying historical welcomes", () => {
    const state = reconcileRoster(null, developmentCitySnapshot);
    expect(state.residents.map((resident) => resident.nickname)).toEqual(["そら", "はる"]);
    expect(state.addedIds).toEqual([]);
  });
  it("welcomes a newly confirmed resident once and never revives a removal from an old snapshot", () => {
    const empty = { ...developmentCitySnapshot, eventSeq: 0, residents: [], avatars: [] };
    let state = reconcileRoster(null, empty);
    state = reconcileRoster(state, developmentCitySnapshot);
    expect(state.addedIds).toEqual(["fixture-sora", "fixture-haru"]);
    state = reconcileRoster(state, developmentCitySnapshot);
    expect(state.addedIds).toEqual([]);
    state = reconcileRoster(state, { ...empty, eventSeq: 4 });
    expect(state.removedIds).toEqual(["fixture-sora", "fixture-haru"]);
    state = reconcileRoster(state, developmentCitySnapshot);
    expect(state.residents).toEqual([]);
    expect(state.eventSeq).toBe(4);
  });
  it("replaces the roster on server restart, even if the new sequence is lower", () => {
    const initial = reconcileRoster(null, developmentCitySnapshot);
    const state = reconcileRoster(initial, {
      ...developmentCitySnapshot,
      streamId: "new-process",
      eventSeq: 0,
      residents: [],
      avatars: [],
    });
    expect(state.residents).toEqual([]);
    expect(state.streamId).toBe("new-process");
    expect(state.removedIds).toHaveLength(2);
  });
  it("refuses private data and hidden residents instead of displaying them", () => {
    const resident = developmentCitySnapshot.residents[0];
    expect(() =>
      reconcileRoster(null, {
        ...developmentCitySnapshot,
        residents: [{ ...resident, answers: [1, 2, 0] }],
      }),
    ).toThrow();
    expect(() =>
      reconcileRoster(null, {
        ...developmentCitySnapshot,
        residents: [{ ...resident, publicState: "HIDDEN" }],
      }),
    ).toThrow();
  });
});

describe("sceneResidentCount", () => {
  it("caps the drawn residents and never goes negative", async () => {
    const { SCENE_RESIDENT_LIMIT, sceneResidentCount } = await import("./roster");
    expect(sceneResidentCount(3)).toBe(3);
    expect(sceneResidentCount(500)).toBe(SCENE_RESIDENT_LIMIT);
    expect(sceneResidentCount(-4)).toBe(0);
  });
});
