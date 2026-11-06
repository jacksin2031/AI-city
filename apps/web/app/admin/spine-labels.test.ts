import { SpineTaskStateSchema } from "@ai-city/contracts/spine";
import { describe, expect, it } from "vitest";
import { describeState, formatSince } from "./spine-labels";

describe("describeState", () => {
  it("has a Japanese label for every state", () => {
    for (const state of SpineTaskStateSchema.options) {
      expect(describeState(state).label).toMatch(/\S/);
    }
  });
  it("marks trouble states as alert, progress as wait and done as ok", () => {
    for (const s of ["FAILED", "UNKNOWN", "REQUIRES_REVIEW"] as const)
      expect(describeState(s).tone).toBe("alert");
    for (const s of ["QUEUED", "PREPARED", "RUNNING"] as const)
      expect(describeState(s).tone).toBe("wait");
    expect(describeState("PUBLISHED").tone).toBe("ok");
    expect(describeState("FAILED").label).toBe("失敗");
    expect(describeState("QUEUED").label).toBe("順番待ち");
  });
});

describe("formatSince", () => {
  const now = Date.parse("2026-11-06T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();
  it("handles null, seconds, minutes and hours", () => {
    expect(formatSince(null, now)).toBe("不明");
    expect(formatSince(ago(30_000), now)).toBe("たった今");
    expect(formatSince(ago(5 * 60_000), now)).toBe("5分前");
    expect(formatSince(ago(2 * 3_600_000), now)).toBe("1時間以上");
  });
});
