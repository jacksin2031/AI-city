import { describe, expect, it } from "vitest";
import {
  developmentAvatarManifests,
  developmentCityEvents,
  developmentDialogue,
  developmentGenerationJobs,
  developmentResidents,
} from "./fixtures";
import {
  AvatarManifestSchema,
  AvatarSpecSchema,
  CityEventSchema,
  CityModeEventSchema,
  CityStreamEventSchema,
  DialogueRequestSchema,
  DialogueResultSchema,
  GenerationJobSchema,
  PublicResidentSchema,
} from "./index";

// v0.2 fields are optional so that every v0.1 document stays valid.

describe("AvatarSpec v0.2", () => {
  const spec = {
    schemaVersion: 1,
    hairId: "hair-short",
    clothingId: "shirt-basic",
    hairColor: "#332211",
    clothingColor: "#4466aa",
    accessoryIds: [],
  };
  it("keeps v0.1 specs valid", () => {
    expect(AvatarSpecSchema.safeParse(spec).success).toBe(true);
  });
  it("accepts template, palette and asymmetry markers", () => {
    expect(
      AvatarSpecSchema.safeParse({
        ...spec,
        templateId: "template-a",
        palette: ["#ffffff", "#000000"],
        asymmetryIds: ["hair-part-left"],
      }).success,
    ).toBe(true);
  });
  it("rejects invalid palette colors and oversized palettes", () => {
    expect(AvatarSpecSchema.safeParse({ ...spec, palette: ["red"] }).success).toBe(false);
    expect(
      AvatarSpecSchema.safeParse({ ...spec, palette: Array(17).fill("#ffffff") }).success,
    ).toBe(false);
  });
});

describe("AvatarManifest v0.2", () => {
  const manifest = {
    schemaVersion: 1,
    avatarVersion: "v1",
    rigVersion: "v1",
    directions: {
      front: "/avatars/r1/front.png",
      back: "/avatars/r1/back.png",
      left: "/avatars/r1/left.png",
      right: "/avatars/r1/right.png",
    },
  };
  const extended = {
    ...manifest,
    animationVersion: "anim-v1",
    frameSize: { width: 256, height: 512 },
    anchor: { x: 0.5, y: 1 },
    atlas: { image: "/avatars/r1/atlas.png", data: "/avatars/r1/atlas.json" },
    fallback: false,
  };
  it("keeps v0.1 manifests valid", () => {
    expect(AvatarManifestSchema.safeParse(manifest).success).toBe(true);
  });
  it("accepts size, anchor, atlas, animation version and fallback marker", () => {
    expect(AvatarManifestSchema.safeParse(extended).success).toBe(true);
  });
  it("rejects anchors outside the normalized frame and non-positive sizes", () => {
    expect(AvatarManifestSchema.safeParse({ ...extended, anchor: { x: 1.5, y: 1 } }).success).toBe(
      false,
    );
    expect(
      AvatarManifestSchema.safeParse({ ...extended, frameSize: { width: 0, height: 512 } }).success,
    ).toBe(false);
  });
  it("keeps atlas data scoped to the public avatar path", () => {
    for (const data of [
      "https://example.com/atlas.json",
      "/avatars/../private/atlas.json",
      "/avatars/r1/atlas.js",
    ]) {
      expect(
        AvatarManifestSchema.safeParse({
          ...extended,
          atlas: { image: "/avatars/r1/atlas.png", data },
        }).success,
      ).toBe(false);
    }
  });
});

describe("GenerationJob v0.2", () => {
  const job = { schemaVersion: 1, jobId: "job-1", state: "QUEUED", attempt: 0 };
  it("keeps v0.1 jobs valid", () => {
    expect(GenerationJobSchema.safeParse(job).success).toBe(true);
  });
  it("accepts deadline, progress time, cancel flag and a READY result", () => {
    expect(
      GenerationJobSchema.safeParse({
        ...job,
        state: "READY",
        deadline: "2026-10-17T03:00:30Z",
        updatedAt: "2026-10-17T03:00:12Z",
        cancelRequested: false,
        result: { avatarVersion: "v1", mode: "FAST", fallback: false },
      }).success,
    ).toBe(true);
  });
  it("accepts an error code on FAILED", () => {
    expect(
      GenerationJobSchema.safeParse({ ...job, state: "FAILED", errorCode: "PHOTO_UNCLEAR" })
        .success,
    ).toBe(true);
  });
  it("rejects a result before READY and an error code outside FAILED", () => {
    expect(
      GenerationJobSchema.safeParse({
        ...job,
        state: "RUNNING",
        result: { avatarVersion: "v1", mode: "FAST", fallback: false },
      }).success,
    ).toBe(false);
    expect(GenerationJobSchema.safeParse({ ...job, errorCode: "TIMEOUT" }).success).toBe(false);
  });
  it("rejects free-form error text, unknown modes and non-ISO times", () => {
    expect(
      GenerationJobSchema.safeParse({ ...job, state: "FAILED", errorCode: "photo was bad" })
        .success,
    ).toBe(false);
    expect(
      GenerationJobSchema.safeParse({
        ...job,
        state: "READY",
        result: { avatarVersion: "v1", mode: "MAGIC", fallback: false },
      }).success,
    ).toBe(false);
    expect(GenerationJobSchema.safeParse({ ...job, deadline: "tomorrow" }).success).toBe(false);
  });
});

describe("PublicResident v0.2", () => {
  const resident = developmentResidents[0];
  it("accepts an explicit public state", () => {
    expect(PublicResidentSchema.safeParse({ ...resident, publicState: "HIDDEN" }).success).toBe(
      true,
    );
  });
  it("rejects unknown public states", () => {
    expect(PublicResidentSchema.safeParse({ ...resident, publicState: "DELETED" }).success).toBe(
      false,
    );
  });
});

describe("city mode events", () => {
  const envelope = {
    schemaVersion: 1,
    id: "e2",
    eventId: "fixture-event",
    eventSeq: 2,
    version: 1,
  };
  it("accepts a mode change without a resident", () => {
    expect(
      CityModeEventSchema.safeParse({ ...envelope, type: "MODE_CHANGED", mode: "DEMO" }).success,
    ).toBe(true);
  });
  it("rejects unknown modes and resident data on mode events", () => {
    expect(
      CityModeEventSchema.safeParse({ ...envelope, type: "MODE_CHANGED", mode: "PARTY" }).success,
    ).toBe(false);
    expect(
      CityModeEventSchema.safeParse({
        ...envelope,
        type: "MODE_CHANGED",
        mode: "LIVE",
        residentId: "r1",
      }).success,
    ).toBe(false);
  });
  it("keeps resident events out of the mode schema and vice versa", () => {
    expect(
      CityEventSchema.safeParse({ ...envelope, type: "MODE_CHANGED", mode: "LIVE" }).success,
    ).toBe(false);
  });
  it("streams both resident and mode events", () => {
    expect(
      CityStreamEventSchema.safeParse({
        ...envelope,
        type: "RESIDENT_JOINED",
        residentId: "r1",
      }).success,
    ).toBe(true);
    expect(
      CityStreamEventSchema.safeParse({ ...envelope, type: "MODE_CHANGED", mode: "MAINTENANCE" })
        .success,
    ).toBe(true);
  });
});

describe("dialogue contracts", () => {
  const request = {
    schemaVersion: 1,
    requestId: "dialogue-1",
    eventId: "fixture-event",
    residentIds: ["fixture-sora", "fixture-haru"],
    locale: "ja-JP",
    maxLines: 4,
  };
  const result = {
    schemaVersion: 1,
    requestId: "dialogue-1",
    source: "PRESET",
    safety: "PASSED",
    lines: [
      { residentId: "fixture-sora", text: "こんにちは！" },
      { residentId: "fixture-haru", text: "いい天気だね。" },
    ],
  };
  it("accepts a two-resident Japanese request", () => {
    expect(DialogueRequestSchema.safeParse(request).success).toBe(true);
    expect(DialogueRequestSchema.safeParse({ ...request, place: "station" }).success).toBe(true);
    expect(
      DialogueRequestSchema.safeParse({ ...request, place: "untrusted arbitrary text" }).success,
    ).toBe(false);
    expect(DialogueRequestSchema.safeParse({ ...request, x: 1, y: 2 }).success).toBe(false);
  });
  it("rejects self-talk, crowds and private context in requests", () => {
    expect(
      DialogueRequestSchema.safeParse({ ...request, residentIds: ["fixture-sora", "fixture-sora"] })
        .success,
    ).toBe(false);
    expect(
      DialogueRequestSchema.safeParse({ ...request, residentIds: ["a", "b", "c"] }).success,
    ).toBe(false);
    expect(DialogueRequestSchema.safeParse({ ...request, rawAnswers: [] }).success).toBe(false);
    expect(DialogueRequestSchema.safeParse({ ...request, locale: "en-US" }).success).toBe(false);
  });
  it("accepts a preset result and a blocked result without lines", () => {
    expect(DialogueResultSchema.safeParse(result).success).toBe(true);
    expect(
      DialogueResultSchema.safeParse({ ...result, source: "LIVE", safety: "BLOCKED", lines: [] })
        .success,
    ).toBe(true);
  });
  it("rejects blocked output that still carries lines, empty passes and long lines", () => {
    expect(DialogueResultSchema.safeParse({ ...result, safety: "BLOCKED" }).success).toBe(false);
    expect(DialogueResultSchema.safeParse({ ...result, lines: [] }).success).toBe(false);
    expect(
      DialogueResultSchema.safeParse({
        ...result,
        lines: [{ residentId: "fixture-sora", text: "あ".repeat(81) }],
      }).success,
    ).toBe(false);
  });
});

describe("shared fixtures", () => {
  it("parse through the published schemas", () => {
    for (const manifest of developmentAvatarManifests)
      expect(AvatarManifestSchema.safeParse(manifest).success).toBe(true);
    for (const job of developmentGenerationJobs)
      expect(GenerationJobSchema.safeParse(job).success).toBe(true);
    for (const event of developmentCityEvents)
      expect(CityStreamEventSchema.safeParse(event).success).toBe(true);
    expect(DialogueRequestSchema.safeParse(developmentDialogue.request).success).toBe(true);
    expect(DialogueResultSchema.safeParse(developmentDialogue.result).success).toBe(true);
  });
  it("cover every job state and the mode change event", () => {
    expect(new Set(developmentGenerationJobs.map((job) => job.state))).toEqual(
      new Set(["QUEUED", "RUNNING", "READY", "FAILED", "CANCELLED"]),
    );
    expect(developmentCityEvents.some((event) => event.type === "MODE_CHANGED")).toBe(true);
  });
  it("reference only fixture residents and label dialogue as preset", () => {
    const ids = new Set(developmentResidents.map((resident) => resident.residentId));
    for (const event of developmentCityEvents)
      if ("residentId" in event) expect(ids.has(event.residentId)).toBe(true);
    for (const line of developmentDialogue.result.lines)
      expect(ids.has(line.residentId)).toBe(true);
    expect(developmentDialogue.result.source).toBe("PRESET");
  });
  it("keep event sequence numbers strictly increasing", () => {
    const seqs = developmentCityEvents.map((event) => event.eventSeq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
  });
});
