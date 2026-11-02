import { expect, it } from "vitest";
import { findEncounter } from "./encounter";
import type { Actor } from "./simulation";

it("only starts fictional conversations when characters are nearby and on the same level", () => {
  const actor = (x: number, overrides: Partial<Actor> = {}): Actor => ({
    x,
    y: 0,
    heading: 0,
    action: "idle",
    elapsed: 0,
    path: [],
    goal: null,
    seed: 1,
    ...overrides,
  });
  const residents = [
    { id: "fixture-sora", actor: actor(0) },
    { id: "fixture-haru", actor: actor(6) },
  ];
  expect(findEncounter(residents, null, () => 0)).toEqual(["fixture-sora", "fixture-haru"]);
  expect(findEncounter(residents, "fixture-sora", () => 0)).toBeNull();
  expect(findEncounter(residents, null, (x) => x)).toBeNull();
  expect(
    findEncounter(
      [
        { id: "fixture-sora", actor: actor(0, { waitingForSignal: true }) },
        { id: "fixture-haru", actor: actor(6) },
      ],
      null,
      () => 0,
    ),
  ).toBeNull();
  expect(
    findEncounter(
      [
        { id: "fixture-sora", actor: actor(0) },
        { id: "real-participant", actor: actor(1) },
      ],
      null,
      () => 0,
    ),
  ).toBeNull();
  expect(
    findEncounter(
      [
        { id: "fixture-sora", actor: actor(0) },
        { id: "preset-aoi", actor: actor(20) },
      ],
      null,
      () => 0,
    ),
  ).toBeNull();
});
