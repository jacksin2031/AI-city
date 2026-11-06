/** Parse the worker model's JSON array into dialogue lines the tablet will accept. */
export function parseLines(text: string, a: string, b: string) {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const lines = parsed
    .filter(
      (l): l is { speaker: "a" | "b"; text: string } =>
        Boolean(l) &&
        (l.speaker === "a" || l.speaker === "b") &&
        typeof l.text === "string" &&
        l.text.trim() !== "",
    )
    .slice(0, 6)
    .map((l) => ({
      residentId: l.speaker === "a" ? a : b,
      text: l.text
        .trim()
        .replace(/^[^\s：:「]{1,12}[：:]\s*/, "")
        .slice(0, 80),
    }));
  if (lines.length < 2) return null;
  // The tablet rejects the same resident speaking twice in a row.
  return lines.every((line, i) => i === 0 || line.residentId !== lines[i - 1]?.residentId)
    ? lines
    : null;
}
