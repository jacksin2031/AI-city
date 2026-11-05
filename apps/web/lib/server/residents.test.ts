import { describe, expect, it } from "vitest";
import { publicView, type ResidentDoc, sanitizeNickname } from "./residents";

function resident(overrides: Partial<ResidentDoc> = {}): ResidentDoc {
  return {
    residentId: "r1",
    sid: "secret-session-id",
    eventId: "ochanomizu-dev",
    nickname: "みみ",
    personalityLabel: "ひらめき探検家",
    interests: ["アイデア"],
    consentVersion: 1,
    publicConsent: true,
    hasPhoto: true,
    color: "green",
    mark: "star",
    avatarState: "READY",
    avatarSource: "generated",
    visible: true,
    createdAt: 1,
    ...overrides,
  };
}

describe("publicView", () => {
  it("never exposes the session id, the photo flag or the consent record", () => {
    const view = publicView(resident());
    expect(view).not.toHaveProperty("sid");
    expect(view).not.toHaveProperty("hasPhoto");
    expect(view).not.toHaveProperty("consentVersion");
    expect(view).not.toHaveProperty("createdAt");
    expect(view).not.toHaveProperty("visible");
    expect(JSON.stringify(view)).not.toContain("secret-session-id");
  });

  it("exposes exactly the agreed public fields", () => {
    expect(Object.keys(publicView(resident())).sort()).toEqual(
      [
        "avatarSource",
        "avatarUrl",
        "interests",
        "nickname",
        "personalityLabel",
        "residentId",
      ].sort(),
    );
  });

  it("points the avatar at the same-origin route, not at a storage bucket", () => {
    expect(publicView(resident({ residentId: "abc" })).avatarUrl).toBe("/avatars/abc/front.png");
  });

  it("keeps the avatar source honest about generated versus sample", () => {
    expect(publicView(resident({ avatarSource: "sample" })).avatarSource).toBe("sample");
    expect(publicView(resident({ avatarSource: "generated" })).avatarSource).toBe("generated");
  });
});

describe("sanitizeNickname", () => {
  it("keeps ordinary Japanese and Unicode nicknames", () => {
    expect(sanitizeNickname("みみ")).toBe("みみ");
    expect(sanitizeNickname("とりさげ")).toBe("とりさげ");
    expect(sanitizeNickname("José ☕")).toBe("José ☕");
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeNickname("  みみ  ")).toBe("みみ");
    expect(sanitizeNickname("\t\nみみ\n")).toBe("みみ");
  });

  it("strips control characters that could disturb logs or display", () => {
    expect(sanitizeNickname("み\u0000み")).toBe("みみ");
    expect(sanitizeNickname("a\u0007b\u001fc")).toBe("abc");
  });

  it("strips bidi override characters so a name cannot disguise itself", () => {
    expect(sanitizeNickname("a\u202eb")).toBe("ab");
    expect(sanitizeNickname("a\u2066b\u2069")).toBe("ab");
  });

  it("caps the length at 20 characters", () => {
    expect(sanitizeNickname("あ".repeat(50))).toBe("あ".repeat(20));
  });

  it("returns an empty string for input that must not continue", () => {
    expect(sanitizeNickname("")).toBe("");
    expect(sanitizeNickname("   ")).toBe("");
    expect(sanitizeNickname("\u0000\u0001")).toBe("");
  });
});
