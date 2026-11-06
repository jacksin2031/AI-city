import { traitValues } from "./trait-values";

/** The public profile the city shows for a Spine participant. */
export type SpineProfile = {
  nickname: string;
  personalityLabel: string | null;
  interests: string[];
  traits?: number[];
};

export type ProfileInputs = {
  stored: SpineProfile | null;
  nickname: string;
  answers: readonly (number | null)[];
  styleLabel: string;
  interest: string | undefined;
};

export const DEFAULT_NICKNAME = "ゲスト";

/**
 * Decide what the final card shows and whether anything must be sent.
 * A profile the server already holds wins over local state, because after a reload the typed
 * name and the answers are gone and local state would only be defaults or neutral values.
 */
export function resolveSpineProfile(input: ProfileInputs): {
  profile: SpineProfile;
  send: boolean;
} {
  const answered = input.answers.some((answer) => answer !== null);
  const complete = input.answers.length === 6 && input.answers.every((answer) => answer !== null);
  const typedName = input.nickname.trim();
  if (input.stored) {
    // Only fill what the stored profile lacks, and only from real answers or a typed name.
    const upgradeTraits = !input.stored.traits && complete;
    const upgradeName = input.stored.nickname === DEFAULT_NICKNAME && typedName !== "";
    if (!upgradeTraits && !upgradeName) return { profile: input.stored, send: false };
    const profile: SpineProfile = {
      ...input.stored,
      nickname: upgradeName ? typedName : input.stored.nickname,
      ...(upgradeTraits
        ? {
            traits: [...traitValues(input.answers, input.styleLabel)],
            personalityLabel: input.styleLabel,
            interests: input.interest ? [input.interest] : input.stored.interests,
          }
        : {}),
    };
    return { profile, send: true };
  }
  return {
    profile: {
      nickname: typedName || DEFAULT_NICKNAME,
      personalityLabel: answered ? input.styleLabel : null,
      interests: input.interest ? [input.interest] : [],
      // Without any answer there are no real scores to show or to claim.
      ...(answered ? { traits: [...traitValues(input.answers, input.styleLabel)] } : {}),
    },
    send: true,
  };
}

const DRAFT_KEY = "ai-city-spine-draft";

export type SpineDraft = { nickname: string; answers: (number | null)[] };

/** Tab-local draft so a reload keeps the typed name and the answers; never leaves the device. */
export function loadDraft(storage: Pick<Storage, "getItem">): SpineDraft | null {
  try {
    const parsed = JSON.parse(storage.getItem(DRAFT_KEY) ?? "null");
    if (
      !parsed ||
      typeof parsed.nickname !== "string" ||
      !Array.isArray(parsed.answers) ||
      parsed.answers.length !== 6 ||
      !parsed.answers.every((a: unknown) => a === null || a === 0 || a === 1 || a === 2)
    )
      return null;
    return { nickname: parsed.nickname.slice(0, 80), answers: parsed.answers };
  } catch {
    return null;
  }
}

export function saveDraft(storage: Pick<Storage, "setItem">, draft: SpineDraft): void {
  try {
    storage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Storage unavailable: the draft just does not survive a reload.
  }
}

export function clearDraft(storage: Pick<Storage, "removeItem">): void {
  try {
    storage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing stored.
  }
}
