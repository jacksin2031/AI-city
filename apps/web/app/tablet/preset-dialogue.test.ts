import { type DialoguePlace, type DialogueResult, DialogueResultSchema } from "@ai-city/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  presetDialogueCount,
  presetDialogueForEncounter,
  resolveEncounterDialogue,
} from "./preset-dialogue";

const places: DialoguePlace[] = [
  "station",
  "bridge",
  "river",
  "sola",
  "nikolai",
  "yushima",
  "meiji",
  "street",
];
const ids: [string, string] = ["preset-aoi", "preset-kaede"];
const liveResult: DialogueResult = {
  schemaVersion: 1,
  requestId: "generated_1",
  source: "LIVE",
  safety: "PASSED",
  lines: [
    { residentId: ids[0], text: "こんにちは！" },
    { residentId: ids[1], text: "よろしくね。" },
  ],
};

describe("reviewed offline exhibition dialogues", () => {
  it("ships 48 varied four-line scripts for the eight landmarks", () => {
    expect(presetDialogueCount).toBe(48);
    for (const place of places) {
      const variants = new Set<string>();
      for (let sequence = 0; sequence < 6; sequence++) {
        const result = presetDialogueForEncounter(ids, place, sequence);
        expect(DialogueResultSchema.safeParse(result).success).toBe(true);
        expect(result?.source).toBe("PRESET");
        expect(result?.safety).toBe("PASSED");
        expect(result?.lines).toHaveLength(4);
        expect(result?.lines.map((line) => line.residentId)).toEqual([
          ids[0],
          ids[1],
          ids[0],
          ids[1],
        ]);
        for (const line of result?.lines ?? []) {
          expect(line.text.length).toBeGreaterThan(0);
          expect(line.text.length).toBeLessThanOrEqual(80);
        }
        variants.add(result?.lines.map((line) => line.text).join("|") ?? "");
      }
      expect(variants.size).toBe(6);
    }
  });

  it("only builds offline conversations for fictional, distinct residents", () => {
    expect(presetDialogueForEncounter(["real-participant", ids[0]], "street", 0)).toBeNull();
    expect(presetDialogueForEncounter([ids[0], ids[0]], "street", 0)).toBeNull();
    expect(presetDialogueForEncounter(["fixture-sora", "fixture-haru"], "station", 0)?.source).toBe(
      "PRESET",
    );
  });

  it("uses no API at all with the AI switch off", async () => {
    const requestLive = vi.fn(async () => liveResult);
    const result = await resolveEncounterDialogue({
      residentIds: ids,
      place: "river",
      sequence: 0,
      allowLive: () => false,
      isActive: () => true,
      requestLive,
    });
    expect(requestLive).not.toHaveBeenCalled();
    expect(result?.source).toBe("PRESET");
  });

  it("uses actual model lines when enabled and available", async () => {
    const requestLive = vi.fn(async () => liveResult);
    expect(
      await resolveEncounterDialogue({
        residentIds: ids,
        place: "station",
        sequence: 1,
        allowLive: () => true,
        isActive: () => true,
        requestLive,
      }),
    ).toEqual(liveResult);
    expect(requestLive).toHaveBeenCalledOnce();
  });

  it("recovers to preset lines when the AI provider fails", async () => {
    const result = await resolveEncounterDialogue({
      residentIds: ids,
      place: "meiji",
      sequence: 2,
      allowLive: () => true,
      isActive: () => true,
      requestLive: async () => {
        throw new Error("503 from AI provider");
      },
    });
    expect(result?.source).toBe("PRESET");
  });

  it("switches to the preset if AI is disabled during an in-flight request", async () => {
    let finish: (value: DialogueResult) => void = () => {};
    let liveEnabled = true;
    const task = resolveEncounterDialogue({
      residentIds: ids,
      place: "sola",
      sequence: 3,
      allowLive: () => liveEnabled,
      isActive: () => true,
      requestLive: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    liveEnabled = false;
    finish(liveResult);
    expect((await task)?.source).toBe("PRESET");
  });

  it("discards an in-flight request when the scene is torn down", async () => {
    let finish: (value: DialogueResult) => void = () => {};
    let active = true;
    const task = resolveEncounterDialogue({
      residentIds: ids,
      place: "bridge",
      sequence: 4,
      allowLive: () => true,
      isActive: () => active,
      requestLive: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    active = false;
    finish(liveResult);
    expect(await task).toBeNull();
  });
});
