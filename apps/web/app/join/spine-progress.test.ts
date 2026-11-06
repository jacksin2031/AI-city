import { describe, expect, it } from "vitest";
import { attentionMessages, describeProgress, PROGRESS_STEPS } from "./spine-progress";

const states = [
  "QUEUED",
  "RUNNING",
  "PREPARED",
  "UNKNOWN",
  "REQUIRES_REVIEW",
  "FAILED",
  "PUBLISHED",
  "WITHDRAWN",
] as const;

describe("state-based character progress", () => {
  it("is a pure function of the job state with fixed discrete steps", () => {
    expect(PROGRESS_STEPS).toHaveLength(3);
    expect(describeProgress("QUEUED")).toMatchObject({ step: 1, phase: "waiting" });
    expect(describeProgress("PREPARED")).toMatchObject({ step: 1, phase: "waiting" });
    expect(describeProgress("RUNNING")).toMatchObject({ step: 2, phase: "running" });
    expect(describeProgress("PUBLISHED")).toMatchObject({ step: 3, phase: "done" });
    for (const state of states) expect(describeProgress(state)).toEqual(describeProgress(state));
  });

  it("only PUBLISHED says the character is complete", () => {
    for (const state of states) {
      const view = describeProgress(state);
      const text = `${view.heading}${view.label}${view.detail}`;
      expect(text.includes("完成")).toBe(state === "PUBLISHED");
      expect(view.phase === "done").toBe(state === "PUBLISHED");
    }
  });

  it("shows no percentage and no invented duration in any state", () => {
    for (const state of states) {
      const view = describeProgress(state);
      expect(view).not.toHaveProperty("percent");
      const text = `${view.heading}${view.label}${view.detail}`;
      expect(text).not.toMatch(/[%％]|\d+\s*分|\d+\s*秒|目安/);
    }
  });

  it("makes the queue and the running step distinct and honest", () => {
    expect(describeProgress("QUEUED").detail).toContain("待って");
    expect(describeProgress("RUNNING").detail).toContain("分かりません");
    expect(describeProgress("RUNNING").detail).not.toContain("待って");
  });

  it("gives no step to problem states and tells the participant to ask staff", () => {
    for (const state of ["REQUIRES_REVIEW", "FAILED", "UNKNOWN", "WITHDRAWN"] as const) {
      expect(describeProgress(state)).toMatchObject({ step: null, phase: "attention" });
      expect(attentionMessages[state]).toBeTruthy();
    }
    for (const state of ["REQUIRES_REVIEW", "FAILED", "UNKNOWN"] as const)
      expect(attentionMessages[state]).toContain("スタッフ");
  });
});
