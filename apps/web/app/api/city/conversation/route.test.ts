import { describe, expect, it } from "vitest";
import type { Conversation } from "../../../../lib/server/chat";
import { alignToRequest } from "./route";

function stored(order: string): Conversation & { order?: string } {
  return {
    source: "codex",
    createdAt: 1,
    order,
    lines: [
      { speaker: "a", text: "first" },
      { speaker: "b", text: "second" },
    ],
  };
}

// Regression: a conversation is cached per unordered pair. Asking for the same two
// residents in the other order used to look like a cache miss, regenerate via the cloud
// model, and overwrite the worker's dialogue with a fallback.
describe("alignToRequest", () => {
  it("returns the dialogue untouched when the request matches the stored order", () => {
    const result = alignToRequest(stored("A__B"), "A", "B");
    expect(result.lines).toEqual([
      { speaker: "a", text: "first" },
      { speaker: "b", text: "second" },
    ]);
  });

  it("swaps the speakers when the same pair is requested in the other order", () => {
    const result = alignToRequest(stored("A__B"), "B", "A");
    expect(result.lines).toEqual([
      { speaker: "b", text: "first" },
      { speaker: "a", text: "second" },
    ]);
  });

  it("keeps the text, source and creation time while swapping", () => {
    const result = alignToRequest(stored("A__B"), "B", "A");
    expect(result.source).toBe("codex");
    expect(result.createdAt).toBe(1);
    expect(result.lines.map((l) => l.text)).toEqual(["first", "second"]);
  });

  it("still swaps when no order was stored at all", () => {
    const result = alignToRequest(stored(undefined as unknown as string), "B", "A");
    expect(result.lines.map((l) => l.speaker)).toEqual(["b", "a"]);
  });
});
