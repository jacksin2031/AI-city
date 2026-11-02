import { expect, it } from "vitest";
import { dialogueCooldown, encounterPlace, findEncounter } from "./encounter";
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

it("uses both personalities to apply individual cooldowns", () => {
  const actor = {
    x: 0,
    y: 0,
    heading: 0,
    action: "idle",
    elapsed: 0,
    path: [],
    goal: null,
    seed: 1,
  } as Actor;
  const people = [
    { id: "preset-kaede", actor, personality: "好奇心いっぱい" },
    { id: "preset-ren", actor, personality: "おだやか" },
  ];
  const last = new Map([
    ["preset-kaede", 0],
    ["preset-ren", 0],
  ]);
  expect(dialogueCooldown("好奇心いっぱい")).toBeLessThan(dialogueCooldown("おだやか"));
  expect(findEncounter(people, null, () => 0, 90, last)).toBeNull();
  expect(findEncounter(people, null, () => 0, 180, last)).toEqual(["preset-kaede", "preset-ren"]);
});

it("maps nearby recognised locations to fixed codes and falls back outside the range", () => {
  const actor = { x: 3, y: 4 } as Actor;
  const points = [
    { id: "jr-ocha", x: 0, y: 0 } as never,
    { id: "shop-untrusted", x: 3, y: 4 } as never,
  ];
  expect(encounterPlace(actor, actor, points)).toBe("station");
  expect(encounterPlace({ ...actor, x: 100 }, { ...actor, x: 100 }, points)).toBe("street");
});
