import { describe, expect, it } from "vitest";
import { ABSENT, residentDetailRows } from "./resident-details";

describe("administrator resident details", () => {
  it("shows persisted fields", () => {
    const rows = residentDetailRows({
      residentId: "spine-1",
      personalityLabel: "実践チャレンジャー",
      interests: ["a", "b"],
      traits: [0.9, 0.5, 0.7, 0.9, 0.5, 0.7],
      consentVersion: 1,
    });
    expect(rows.find((row) => row.label === "AIスタイル")?.value).toBe("実践チャレンジャー");
    expect(rows.find((row) => row.label === "興味")?.value).toBe("a、b");
    expect(rows.find((row) => row.label === "特性")?.value).toContain("挑戦 90");
    expect(rows.some((row) => row.absent)).toBe(false);
  });
  it("marks missing fields as absent without inventing answers", () => {
    const rows = residentDetailRows({
      residentId: "spine-2",
      personalityLabel: "非公開",
      interests: [],
      consentVersion: 1,
    });
    for (const label of ["AIスタイル", "興味", "特性"])
      expect(rows.find((row) => row.label === label)).toMatchObject({
        value: ABSENT,
        absent: true,
      });
  });
});
