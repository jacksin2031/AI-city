import { describe, expect, it } from "vitest";
import { traitLabels, traitValues } from "./trait-values";

describe("traitValues", () => {
  it("gives one value per hexagon axis, from the six answers when all are given", () => {
    const values = traitValues([0, 1, 0, 2, 0, 1], "ひらめき探検家");
    expect(values).toHaveLength(traitLabels.length);
    expect(values).toEqual([0.9, 0.5, 0.9, 0.7, 0.9, 0.5]);
  });

  it("falls back to the shape of the AI style once the answers are gone after a reload", () => {
    const explorer = traitValues([null, null, null, null, null, null], "ひらめき探検家");
    const supporter = traitValues([], "しっかりサポーター");
    expect(explorer).toHaveLength(6);
    expect(supporter).toHaveLength(6);
    expect(explorer).not.toEqual(supporter);
  });

  it("is flat for an unanswered or unknown label and always stays within 0–1", () => {
    for (const label of ["未回答", "見本の性格", "バランス型"]) {
      const values = traitValues([], label);
      expect(values).toHaveLength(6);
      expect(values.every((v) => v >= 0 && v <= 1)).toBe(true);
      expect(new Set(values).size).toBe(1);
    }
  });
});
