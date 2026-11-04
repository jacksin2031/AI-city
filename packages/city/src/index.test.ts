import { describe, expect, it } from "vitest";
import { getDevelopmentResidents } from "./index";

describe("sample residents", () => {
  it("provides twelve distinct fictional residents without modifying the fixture between calls", () => {
    const first = getDevelopmentResidents();
    expect(first).toHaveLength(12);
    expect(new Set(first.map((resident) => resident.residentId)).size).toBe(12);
    expect(first.slice(2).every((resident) => resident.nickname.startsWith("見本"))).toBe(true);
    const firstResident = first[0];
    if (!firstResident) throw new Error("missing sample resident");
    firstResident.nickname = "changed";
    expect(getDevelopmentResidents()[0]?.nickname).not.toBe("changed");
  });
});
