import { developmentCitySnapshot } from "@ai-city/contracts/development";
import { describe, expect, it } from "vitest";
import { closePresentation, openProfile, updatePresentation } from "./presentation";

const residents = developmentCitySnapshot.residents;
const empty = { ...developmentCitySnapshot, eventSeq: 0, residents: [], avatars: [] };
describe("tablet resident presentation", () => {
  it("does not welcome restored residents and ignores duplicate snapshots", () => {
    let state = updatePresentation(null, developmentCitySnapshot);
    expect(state.active).toBeNull();
    state = updatePresentation(state, developmentCitySnapshot);
    expect(state.queue).toEqual([]);
  });
  it("welcomes new arrivals in order, once per addition", () => {
    let state = updatePresentation(updatePresentation(null, empty), developmentCitySnapshot);
    expect(state.active).toEqual({ kind: "welcome", id: residents[0]?.residentId });
    expect(state.queue).toEqual([residents[1]?.residentId]);
    state = updatePresentation(state, developmentCitySnapshot);
    state = closePresentation(state);
    expect(state.active).toEqual({ kind: "welcome", id: residents[1]?.residentId });
    expect(closePresentation(state).active).toBeNull();
  });
  it("lets profile reading finish before presenting queued arrivals", () => {
    const one = { ...developmentCitySnapshot, eventSeq: 1, residents: residents.slice(0, 1) };
    let state = openProfile(updatePresentation(null, one), "fixture-sora");
    state = updatePresentation(state, { ...developmentCitySnapshot, eventSeq: 2 });
    expect(state.active).toEqual({ kind: "profile", id: "fixture-sora" });
    expect(state.queue).toEqual(["fixture-haru"]);
    expect(closePresentation(state).active).toEqual({ kind: "welcome", id: "fixture-haru" });
  });
  it("drops withdrawn profiles and queued residents, without accepting stale data", () => {
    let state = updatePresentation(updatePresentation(null, empty), developmentCitySnapshot);
    state = openProfile(state, "fixture-sora");
    state = updatePresentation(state, { ...empty, eventSeq: 3 });
    expect(state.active).toBeNull();
    expect(state.queue).toEqual([]);
    state = updatePresentation(state, developmentCitySnapshot);
    expect(state.roster.residents).toEqual([]);
    expect(openProfile(state, "fixture-sora").active).toBeNull();
  });
  it("clears all presentation on a new stream and treats it as restoration", () => {
    const state = openProfile(updatePresentation(null, developmentCitySnapshot), "fixture-sora");
    const restored = updatePresentation(state, {
      ...developmentCitySnapshot,
      streamId: "replacement",
    });
    expect(restored.active).toBeNull();
    expect(restored.queue).toEqual([]);
  });
});
