import { randomBytes } from "node:crypto";
import { sampleAvatarPng } from "./sample-avatar";
import { getStore } from "./store";

export const EVENT_ID = "ochanomizu-dev";
export const CONSENT_VERSION = 1;

export type AvatarState = "QUEUED" | "RUNNING" | "READY" | "FAILED";

export type ResidentDoc = {
  residentId: string;
  sid: string;
  eventId: string;
  nickname: string;
  personalityLabel: string;
  interests: string[];
  consentVersion: number;
  publicConsent: true;
  hasPhoto: boolean;
  color: string;
  mark: string;
  avatarState: AvatarState;
  avatarSource: "generated" | "sample";
  /** Equals true only once the avatar is READY; the city list queries this field. */
  visible: boolean;
  createdAt: number;
};

export type SessionDoc = {
  sid: string;
  consent: { version: number; terms: true; photo: boolean; public: true; at: number };
  residentId?: string;
};

export const newResidentId = () => randomBytes(9).toString("base64url");

export function sanitizeNickname(raw: string) {
  // Strip control and bidi-override characters; the nickname is shown publicly and fed to prompts.
  return raw
    .replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, "")
    .trim()
    .slice(0, 20);
}

/** Public projection: never includes sid, photo flags or raw answers. */
export function publicView(r: ResidentDoc) {
  return {
    residentId: r.residentId,
    nickname: r.nickname,
    personalityLabel: r.personalityLabel,
    interests: r.interests,
    avatarSource: r.avatarSource,
    avatarUrl: `/avatars/${r.residentId}/front.png`,
  };
}

export async function getSession(sid: string) {
  return (await getStore().get("sessions", sid)) as SessionDoc | null;
}

export async function getResident(id: string) {
  return (await getStore().get("residents", id)) as ResidentDoc | null;
}

/**
 * Offline mock only: there is no worker, so complete the job with the bundled sample sprite
 * after a short delay. Marked `sample`, never presented as a generated avatar.
 */
export function scheduleMockCompletion(residentId: string) {
  setTimeout(async () => {
    const store = getStore();
    if (((await store.get("jobs", residentId)) as { state?: string } | null)?.state === "CANCELLED")
      return;
    await store.putBlob("assets", `avatars/${residentId}.png`, sampleAvatarPng, "image/png");
    await store.update("residents", residentId, {
      avatarState: "READY",
      avatarSource: "sample",
      visible: true,
    });
    await store.update("jobs", residentId, { state: "READY" });
  }, 2500).unref?.();
}
