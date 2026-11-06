import { describe, expect, it } from "vitest";
import { attentionMessages, estimateProgress } from "./spine-progress";

describe("character progress estimate", () => {
  it("holds low while queued and never claims completion before publication", () => {
    expect(estimateProgress("QUEUED", 0).percent).toBe(5);
    expect(estimateProgress("QUEUED", 99999).percent).toBe(5);
    for (const seconds of [0, 60, 600, 3600, 86400])
      expect(estimateProgress("RUNNING", seconds).percent).toBeLessThanOrEqual(92);
  });
  it("rises monotonically while running and reaches 100 only when published", () => {
    const values = [0, 30, 120, 300, 900, 1800].map(
      (seconds) => estimateProgress("RUNNING", seconds).percent,
    );
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(values[0]).toBeGreaterThanOrEqual(10);
    expect(estimateProgress("PUBLISHED", 0)).toMatchObject({ percent: 100, phase: "done" });
  });
  it("tolerates bad elapsed time and never implies progress for problem states", () => {
    expect(estimateProgress("RUNNING", Number.NaN).percent).toBe(10);
    expect(estimateProgress("RUNNING", -5).percent).toBe(10);
    for (const state of ["REQUIRES_REVIEW", "FAILED", "UNKNOWN", "WITHDRAWN"] as const) {
      expect(estimateProgress(state, 100)).toMatchObject({ percent: 0, phase: "attention" });
      expect(attentionMessages[state]).toBeTruthy();
    }
  });
});
