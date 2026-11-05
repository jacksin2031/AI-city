import { describe, expect, it } from "vitest";
import { derivePersonality, questionCount, validAnswers } from "./personality";

describe("validAnswers", () => {
  it("accepts six answers in range, including skipped nulls", () => {
    expect(validAnswers([0, 1, 2, 0, 1, 2])).toBe(true);
    expect(validAnswers([null, null, null, null, null, null])).toBe(true);
    expect(validAnswers([0, null, 2, 1, null, 0])).toBe(true);
  });

  it("rejects the wrong length", () => {
    expect(validAnswers([])).toBe(false);
    expect(validAnswers([0, 1, 2, 0, 1])).toBe(false);
    expect(validAnswers([0, 1, 2, 0, 1, 2, 0])).toBe(false);
  });

  it("rejects out-of-range and non-integer values", () => {
    expect(validAnswers([3, 0, 0, 0, 0, 0])).toBe(false);
    expect(validAnswers([-1, 0, 0, 0, 0, 0])).toBe(false);
    expect(validAnswers([0.5, 0, 0, 0, 0, 0])).toBe(false);
    expect(validAnswers(["0", 0, 0, 0, 0, 0])).toBe(false);
  });

  it("rejects non-arrays", () => {
    expect(validAnswers(null)).toBe(false);
    expect(validAnswers(undefined)).toBe(false);
    expect(validAnswers({ 0: 1 })).toBe(false);
    expect(validAnswers("012012")).toBe(false);
  });

  it("expects exactly six questions", () => {
    expect(questionCount).toBe(6);
  });
});

describe("derivePersonality", () => {
  it("treats skipped or partial answers as unanswered and derives nothing", () => {
    const skipped = derivePersonality(null);
    expect(skipped.personalityLabel).toBe("未回答");
    expect(skipped.interests).toEqual([]);

    const partial = derivePersonality([0, 1, null, 0, 1, 2]);
    expect(partial.personalityLabel).toBe("未回答");
    expect(partial.interests).toEqual([]);
  });

  it("maps an all-first-option run to the adventurous label", () => {
    // Both axes must score positive. adventurous = [0,2,4] = +1 each; creative = [1,3,5] = +1 each.
    expect(derivePersonality([0, 0, 0, 0, 0, 0]).personalityLabel).toBe("ひらめき探検家");
  });

  it("maps a decisive but uncreative run to the practical label", () => {
    // adventurous = +3 (answers 0 on 0,2,4); creative = -3 (answers 1 on 1,3,5)
    expect(derivePersonality([0, 1, 0, 1, 0, 1]).personalityLabel).toBe("実践チャレンジャー");
  });

  it("maps a cautious but creative run to the thoughtful label", () => {
    // adventurous = -3 (answers 1); creative = +3 (answers 0)
    expect(derivePersonality([1, 0, 1, 0, 1, 0]).personalityLabel).toBe("じっくりアイデア家");
  });

  it("maps an all-second-option run to the supportive label", () => {
    // adventurous = -3, creative = -3
    expect(derivePersonality([1, 1, 1, 1, 1, 1]).personalityLabel).toBe("しっかりサポーター");
  });

  it("falls back to the balanced label when either axis scores zero", () => {
    // third option scores 0, so every question answered 2 is balanced on both axes
    expect(derivePersonality([2, 2, 2, 2, 2, 2]).personalityLabel).toBe("バランス型");
  });

  it("produces at most six unique, non-empty interests", () => {
    const { interests } = derivePersonality([0, 1, 2, 0, 1, 2]);
    expect(interests.length).toBeGreaterThan(0);
    expect(interests.length).toBeLessThanOrEqual(6);
    expect(new Set(interests).size).toBe(interests.length);
    for (const interest of interests) expect(interest).not.toBe("");
  });

  it("is deterministic: the same answers always produce the same result", () => {
    const answers = [0, 1, 2, 1, 0, 1];
    expect(derivePersonality(answers)).toEqual(derivePersonality(answers));
  });
});
