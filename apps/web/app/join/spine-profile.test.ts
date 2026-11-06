import { describe, expect, it } from "vitest";
import { clearDraft, loadDraft, resolveSpineProfile, saveDraft } from "./spine-profile";

const none = Array(6).fill(null);
const real = [0, 1, 2, 0, 1, 2];

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe("spine profile resolution", () => {
  it("keeps the saved profile after a reload instead of the default name and neutral traits", () => {
    const stored = {
      nickname: "あおい",
      personalityLabel: "実践チャレンジャー",
      interests: ["意外な発想に出会うこと"],
      traits: [0.9, 0.5, 0.7, 0.9, 0.5, 0.7],
    };
    const result = resolveSpineProfile({
      stored,
      nickname: "",
      answers: none,
      styleLabel: "バランス型",
      interest: undefined,
    });
    expect(result).toEqual({ profile: stored, send: false });
  });
  it("sends real scores from complete answers when nothing is saved yet", () => {
    const { profile, send } = resolveSpineProfile({
      stored: null,
      nickname: " あおい ",
      answers: real,
      styleLabel: "バランス型",
      interest: "x",
    });
    expect(send).toBe(true);
    expect(profile.nickname).toBe("あおい");
    expect(profile.traits).toEqual([0.9, 0.5, 0.7, 0.9, 0.5, 0.7]);
    expect(profile.interests).toEqual(["x"]);
  });
  it("does not invent traits or a style when nothing was answered", () => {
    const { profile } = resolveSpineProfile({
      stored: null,
      nickname: "",
      answers: none,
      styleLabel: "バランス型",
      interest: undefined,
    });
    expect(profile).toEqual({ nickname: "ゲスト", personalityLabel: null, interests: [] });
  });
  it("fills in only what a saved profile lacks, from real answers", () => {
    const stored = { nickname: "ゲスト", personalityLabel: null, interests: [] };
    const { profile, send } = resolveSpineProfile({
      stored,
      nickname: "あおい",
      answers: real,
      styleLabel: "ひらめき探検家",
      interest: undefined,
    });
    expect(send).toBe(true);
    expect(profile).toMatchObject({ nickname: "あおい", personalityLabel: "ひらめき探検家" });
    expect(profile.traits).toHaveLength(6);
  });
});

describe("tab-local draft", () => {
  it("round-trips the name and answers and clears them", () => {
    const storage = memory();
    saveDraft(storage, { nickname: "あおい", answers: real });
    expect(loadDraft(storage)).toEqual({ nickname: "あおい", answers: real });
    clearDraft(storage);
    expect(loadDraft(storage)).toBeNull();
  });
  it("rejects malformed drafts", () => {
    const storage = memory();
    storage.setItem(
      "ai-city-spine-draft",
      JSON.stringify({ nickname: "a", answers: [9, 0, 0, 0, 0, 0] }),
    );
    expect(loadDraft(storage)).toBeNull();
    storage.setItem("ai-city-spine-draft", "not json");
    expect(loadDraft(storage)).toBeNull();
  });
});
