import { describe, expect, it } from "vitest";
import {
  AvatarManifestSchema,
  CityEventSchema,
  GenerationJobSchema,
  PublicResidentSchema,
} from "./index";

const resident = {
  schemaVersion: 1,
  residentId: "fixture-resident-1",
  eventId: "fixture-event",
  nickname: "そら",
  avatarVersion: "fixture-v1",
  publicConsent: true,
  consentVersion: 1,
  interests: ["音楽"],
  personalityLabel: "のんびり探検家",
};

describe("public resident trust boundary", () => {
  it("accepts an explicitly authorized fictional resident", () => {
    expect(PublicResidentSchema.safeParse(resident).success).toBe(true);
  });
  it("rejects publishing without explicit consent", () => {
    expect(PublicResidentSchema.safeParse({ ...resident, publicConsent: false }).success).toBe(
      false,
    );
    const { publicConsent: _consent, ...missing } = resident;
    expect(PublicResidentSchema.safeParse(missing).success).toBe(false);
  });
  it.each(["photoUrl", "rawAnswers", "email", "sessionToken"])(
    "rejects private field %s",
    (field) => {
      expect(PublicResidentSchema.safeParse({ ...resident, [field]: "private" }).success).toBe(
        false,
      );
    },
  );
  it("rejects unexpected nested private data", () => {
    expect(
      PublicResidentSchema.safeParse({ ...resident, profile: { rawAnswers: [] } }).success,
    ).toBe(false);
  });
  it("rejects incompatible schema versions and unbounded nicknames", () => {
    expect(PublicResidentSchema.safeParse({ ...resident, schemaVersion: 2 }).success).toBe(false);
    expect(PublicResidentSchema.safeParse({ ...resident, nickname: "あ".repeat(81) }).success).toBe(
      false,
    );
  });
});

describe("asset and event contracts", () => {
  const manifest = {
    schemaVersion: 1,
    avatarVersion: "v1",
    rigVersion: "v1",
    directions: {
      front: "/avatars/r1/front.png",
      back: "/avatars/r1/back.png",
      left: "/avatars/r1/left.webp",
      right: "/avatars/r1/right.png",
    },
  };
  it("accepts scoped avatar paths with all four directions", () => {
    expect(AvatarManifestSchema.safeParse(manifest).success).toBe(true);
  });
  it("keeps private signed URLs and traversal out of a public manifest", () => {
    for (const front of [
      "https://storage.googleapis.com/private/photo.png?X-Goog-Signature=secret",
      "/private/photo.png",
      "/avatars/../private/photo.png",
    ]) {
      expect(
        AvatarManifestSchema.safeParse({
          ...manifest,
          directions: { ...manifest.directions, front },
        }).success,
      ).toBe(false);
    }
  });
  it("requires all four directions", () => {
    expect(
      AvatarManifestSchema.safeParse({
        schemaVersion: 1,
        avatarVersion: "v1",
        rigVersion: "v1",
        directions: { front: "/front.png" },
      }).success,
    ).toBe(false);
  });
  it("rejects executable asset URL schemes", () => {
    expect(
      AvatarManifestSchema.safeParse({
        schemaVersion: 1,
        avatarVersion: "v1",
        rigVersion: "v1",
        directions: {
          front: "javascript:alert(1)",
          back: "/b.png",
          left: "/l.png",
          right: "/r.png",
        },
      }).success,
    ).toBe(false);
  });
  it("accepts only known generation states", () => {
    const job = { schemaVersion: 1, jobId: "job-1", state: "QUEUED", attempt: 0 };
    expect(GenerationJobSchema.safeParse(job).success).toBe(true);
    expect(GenerationJobSchema.safeParse({ ...job, state: "PUBLISHED" }).success).toBe(false);
  });
  it("rejects unknown event types and negative ordering", () => {
    const event = {
      schemaVersion: 1,
      id: "e1",
      eventId: "fixture-event",
      eventSeq: 1,
      residentId: "r1",
      version: 1,
      type: "RESIDENT_REMOVED",
    };
    expect(CityEventSchema.safeParse(event).success).toBe(true);
    expect(CityEventSchema.safeParse({ ...event, type: "ARBITRARY" }).success).toBe(false);
    expect(CityEventSchema.safeParse({ ...event, eventSeq: -1 }).success).toBe(false);
  });
});
