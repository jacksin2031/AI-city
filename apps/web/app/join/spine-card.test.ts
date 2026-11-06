import { describe, expect, it } from "vitest";
import { computeStyle, questions } from "./questions";
import { traitLabels, traitValues } from "./trait-values";

/**
 * The photo flow keeps its six answers on the phone, so the card's hexagon comes straight
 * from them. This mirrors how the done view builds the card's values.
 */
describe("the photo flow's summary card hexagon", () => {
  it("turns six answers into six labelled values with the style's own label", () => {
    const answers = [0, 1, 0, 2, 0, 1];
    const style = computeStyle(answers);
    const values = traitValues(answers, style);
    expect(values).toHaveLength(traitLabels.length);
    expect(traitLabels).toHaveLength(6);
    expect(values.every((value) => value >= 0 && value <= 1)).toBe(true);
    // A varied set of answers must not collapse to the neutral shape.
    expect(new Set(values).size).toBeGreaterThan(1);
  });

  it("still draws six axes for a participant who skipped the questions", () => {
    const skipped: (number | null)[] = Array(questions.length).fill(null);
    const style = computeStyle(skipped);
    const values = traitValues(skipped, style);
    expect(values).toHaveLength(6);
    expect(values.every((value) => value >= 0 && value <= 1)).toBe(true);
  });
});
