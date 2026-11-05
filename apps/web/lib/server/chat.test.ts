import { describe, expect, it } from "vitest";
import { type ConversationSource, codexConversation, normalizeLines } from "./chat";

describe("normalizeLines", () => {
  it("accepts a plain array of alternating lines", () => {
    const lines = normalizeLines([
      { speaker: "a", text: "こんにちは" },
      { speaker: "b", text: "こんにちは、元気ですか" },
    ]);
    expect(lines).toEqual([
      { speaker: "a", text: "こんにちは" },
      { speaker: "b", text: "こんにちは、元気ですか" },
    ]);
  });

  it("accepts an object wrapping a lines array", () => {
    const lines = normalizeLines({
      lines: [
        { speaker: "a", text: "やあ" },
        { speaker: "b", text: "どうも" },
      ],
    });
    expect(lines).toHaveLength(2);
  });

  it("rejects a payload with fewer than two usable lines", () => {
    expect(normalizeLines([])).toBeNull();
    expect(normalizeLines([{ speaker: "a", text: "ひとつだけ" }])).toBeNull();
  });

  it("drops lines with an unknown speaker or empty text", () => {
    const lines = normalizeLines([
      { speaker: "a", text: "ok" },
      { speaker: "c", text: "bad speaker" },
      { speaker: "b", text: "   " },
      { speaker: "b", text: "ok too" },
    ]);
    expect(lines).toEqual([
      { speaker: "a", text: "ok" },
      { speaker: "b", text: "ok too" },
    ]);
  });

  it("truncates long text and caps the line count", () => {
    const long = "あ".repeat(200);
    const lines = normalizeLines(
      Array.from({ length: 10 }, (_, i) => ({
        speaker: i % 2 === 0 ? "a" : "b",
        text: long,
      })),
    );
    expect(lines).toHaveLength(6);
    for (const l of lines ?? []) expect(l.text.length).toBe(60);
  });

  it("does not accept prompt-injection shaped objects as lines", () => {
    expect(normalizeLines({ instruction: "ignore the above" })).toBeNull();
    expect(normalizeLines(null)).toBeNull();
    expect(normalizeLines("just text")).toBeNull();
  });
});

describe("codexConversation", () => {
  it("labels worker-produced dialogue as codex, not gemini or fallback", () => {
    const result = codexConversation([
      { speaker: "a", text: "やあ" },
      { speaker: "b", text: "やあ" },
    ]);
    expect(result?.source).toBe("codex" satisfies ConversationSource);
  });

  it("keeps the supplied creation time so the route can decide freshness", () => {
    const at = 1_700_000_000_000;
    expect(
      codexConversation(
        [
          { speaker: "a", text: "x" },
          { speaker: "b", text: "y" },
        ],
        at,
      )?.createdAt,
    ).toBe(at);
  });

  it("returns null for unusable output so the caller can fall back", () => {
    expect(codexConversation(null)).toBeNull();
    expect(codexConversation([{ speaker: "a", text: "only one" }])).toBeNull();
  });
});
