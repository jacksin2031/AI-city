import {
  AvatarManifestSchema,
  CityStreamEventSchema,
  DialogueRequestSchema,
  DialogueResultSchema,
  GenerationJobSchema,
  PublicResidentSchema,
} from "./index";

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

// Asset paths are references only; no image files ship with these fixtures yet.
export const developmentAvatarManifests = developmentResidents.map((resident, index) =>
  AvatarManifestSchema.parse({
    schemaVersion: 1,
    avatarVersion: resident.avatarVersion,
    rigVersion: "fixture-rig-v1",
    animationVersion: "fixture-anim-v1",
    directions: {
      front: `/avatars/${resident.residentId}/front.png`,
      back: `/avatars/${resident.residentId}/back.png`,
      left: `/avatars/${resident.residentId}/left.png`,
      right: `/avatars/${resident.residentId}/right.png`,
    },
    frameSize: { width: 256, height: 512 },
    anchor: { x: 0.5, y: 1 },
    atlas: {
      image: `/avatars/${resident.residentId}/atlas.png`,
      data: `/avatars/${resident.residentId}/atlas.json`,
    },
    fallback: index === 1,
  }),
);

export const developmentGenerationJobs = [
  { jobId: "fixture-job-queued", state: "QUEUED", attempt: 0 },
  { jobId: "fixture-job-running", state: "RUNNING", attempt: 1 },
  {
    jobId: "fixture-job-ready",
    state: "READY",
    attempt: 1,
    result: { avatarVersion: "fixture-v1", mode: "FAST", fallback: false },
  },
  { jobId: "fixture-job-failed", state: "FAILED", attempt: 2, errorCode: "PHOTO_UNCLEAR" },
  { jobId: "fixture-job-cancelled", state: "CANCELLED", attempt: 0, cancelRequested: true },
].map((job) =>
  GenerationJobSchema.parse({
    ...job,
    schemaVersion: 1,
    deadline: "2026-10-17T03:00:30Z",
    updatedAt: "2026-10-17T03:00:12Z",
  }),
);

export const developmentCityEvents = [
  { id: "fixture-e1", eventSeq: 1, type: "RESIDENT_JOINED", residentId: "fixture-sora" },
  { id: "fixture-e2", eventSeq: 2, type: "RESIDENT_JOINED", residentId: "fixture-haru" },
  { id: "fixture-e3", eventSeq: 3, type: "MODE_CHANGED", mode: "DEMO" },
  { id: "fixture-e4", eventSeq: 4, type: "RESIDENT_HIDDEN", residentId: "fixture-haru" },
].map((event) =>
  CityStreamEventSchema.parse({ ...event, schemaVersion: 1, eventId: "fixture-event", version: 1 }),
);

// A reviewed preset exchange, never presented as live model output.
export const developmentDialogue = {
  request: DialogueRequestSchema.parse({
    schemaVersion: 1,
    requestId: "fixture-dialogue-1",
    eventId: "fixture-event",
    residentIds: ["fixture-sora", "fixture-haru"],
    locale: "ja-JP",
    maxLines: 4,
  }),
  result: DialogueResultSchema.parse({
    schemaVersion: 1,
    requestId: "fixture-dialogue-1",
    source: "PRESET",
    safety: "PASSED",
    lines: [
      { residentId: "fixture-sora", text: "こんにちは！今日はどこへ行くの？" },
      { residentId: "fixture-haru", text: "広場でゲームの話をしようかな。" },
    ],
  }),
};
