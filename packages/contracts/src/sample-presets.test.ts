import { describe, expect, it } from "vitest";
import {
  avatarForSample,
  PRESET_SAMPLE_IDS,
  presetSampleAvatars,
  SampleIdSchema,
  sampleAvatars,
} from "./development";
import { PRESET_CHARACTERS } from "./device-link";

describe("prepared sample characters", () => {
  it("stay in sync with the admin preset list", () => {
    expect([...PRESET_SAMPLE_IDS]).toEqual(PRESET_CHARACTERS.map((preset) => preset.id));
  });
  it("give every character its own avatar version, so the tablet can pick the skin", () => {
    const versions = sampleAvatars.map((avatar) => avatar.manifest.avatarVersion);
    expect(new Set(versions).size).toBe(versions.length);
    expect(presetSampleAvatars.map((avatar) => avatar.manifest.avatarVersion)).toEqual(
      PRESET_SAMPLE_IDS.map((id) => `sample-${id}-v1`),
    );
    for (const id of PRESET_SAMPLE_IDS)
      expect(avatarForSample(id).manifest.avatarVersion).toBe(`sample-${id}-v1`);
  });
  it("no longer accepts the old sora and haru samples", () => {
    expect(SampleIdSchema.safeParse("sora").success).toBe(false);
    expect(SampleIdSchema.safeParse("haru").success).toBe(false);
  });
});
