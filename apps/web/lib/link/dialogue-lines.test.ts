import { describe, expect, it } from "vitest";
import { parseLines } from "./dialogue-lines";

describe("worker dialogue parsing", () => {
  it("maps speakers to resident ids and tolerates surrounding prose", () => {
    const text = '結果:\n[{"speaker":"a","text":"こんにちは"},{"speaker":"b","text":"やあ"}]\n以上';
    expect(parseLines(text, "x", "y")).toEqual([
      { residentId: "x", text: "こんにちは" },
      { residentId: "y", text: "やあ" },
    ]);
  });
  it("strips a leading speaker name", () => {
    const t = '[{"speaker":"a","text":"そら：やあ"},{"speaker":"b","text":"はる：こんにちは"}]';
    expect(parseLines(t, "x", "y")?.map((l) => l.text)).toEqual(["やあ", "こんにちは"]);
  });
  it("rejects too few lines, bad JSON and the same speaker twice in a row", () => {
    expect(parseLines('[{"speaker":"a","text":"のみ"}]', "x", "y")).toBeNull();
    expect(parseLines("not json", "x", "y")).toBeNull();
    expect(
      parseLines('[{"speaker":"a","text":"1"},{"speaker":"a","text":"2"}]', "x", "y"),
    ).toBeNull();
  });
});
