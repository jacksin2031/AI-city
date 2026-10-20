import { describe, expect, it } from "vitest";
import { removeResidents } from "./actions";

describe("manager batch withdrawal", () => {
  it("removes each selected resident once, in order", async () => {
    const calls: string[] = [];
    const result = await removeResidents(["a", "b", "a"], async (id) => {
      calls.push(id);
    });
    expect(calls).toEqual(["a", "b"]);
    expect(result).toEqual({ removed: ["a", "b"], remaining: [] });
  });

  it("stops after an uncertain failure and keeps the failed and unattempted residents", async () => {
    const calls: string[] = [];
    const result = await removeResidents(["a", "b", "c"], async (id) => {
      calls.push(id);
      if (id === "b") throw new Error("connection lost after request");
    });
    expect(calls).toEqual(["a", "b"]);
    expect(result).toEqual({ removed: ["a"], remaining: ["b", "c"] });
  });
});
