import { PublicResidentSchema } from "./index";

// Fictional data only. No participant photos, questionnaire answers or tokens.
export const developmentResidents = [
  {
    residentId: "fixture-sora",
    nickname: "そら",
    personalityLabel: "のんびり探検家",
    interests: ["音楽"],
  },
  {
    residentId: "fixture-haru",
    nickname: "はる",
    personalityLabel: "好奇心いっぱい",
    interests: ["ゲーム"],
  },
].map((resident) =>
  PublicResidentSchema.parse({
    ...resident,
    schemaVersion: 1,
    eventId: "fixture-event",
    avatarVersion: "fixture-v1",
    publicConsent: true,
    consentVersion: 1,
  }),
);
