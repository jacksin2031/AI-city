import { describe, expect, it } from "vitest";
import {
  CitySnapshotSchema,
  CreateJobRequestSchema,
  DevelopmentJobSchema,
  developmentCitySnapshot,
  PublishRequestSchema,
} from "./development";

describe("local integration boundaries", () => {
  it("accepts only fixed entertainment styles and preserves legacy job inputs", () => {
    const input = {
      eventId: "fixture-event",
      requestId: "fixture",
      nickname: "架空",
      sampleId: "aoi",
      answers: null,
      scenario: "SUCCESS",
    };
    expect(CreateJobRequestSchema.safeParse(input).success).toBe(true);
    expect(
      CreateJobRequestSchema.safeParse({ ...input, aiStyle: "INSPIRED_EXPLORER" }).success,
    ).toBe(true);
    expect(
      CreateJobRequestSchema.safeParse({ ...input, aiStyle: "private arbitrary text" }).success,
    ).toBe(false);
  });
  it("keeps local consent v1 and requires hosted scope for v2", () => {
    const fields = { nickname: true, personality: false, interests: false };
    expect(
      PublishRequestSchema.safeParse({ avatarPublicConsent: true, consentVersion: 2, fields })
        .success,
    ).toBe(false);
    expect(
      PublishRequestSchema.safeParse({
        avatarPublicConsent: true,
        consentVersion: 2,
        publicationScope: "HOSTED_PREVIEW",
        fields,
      }).success,
    ).toBe(true);
    expect(
      PublishRequestSchema.safeParse({
        avatarPublicConsent: true,
        consentVersion: 1,
        publicationScope: "HOSTED_PREVIEW",
        fields,
      }).success,
    ).toBe(false);
  });
  it("provides a validated, fictional snapshot with unambiguous asset versions", () => {
    const snapshot = CitySnapshotSchema.parse(developmentCitySnapshot);
    expect(snapshot.mode).toBe("MOCK");
    expect(snapshot.residents).toHaveLength(2);
    expect(new Set(snapshot.avatars.map((avatar) => avatar.manifest.avatarVersion)).size).toBe(2);
    expect(snapshot.avatars.every((avatar) => avatar.assetStatus === "REFERENCE_ONLY")).toBe(true);
  });

  it("rejects private fields and residents from another exhibition", () => {
    expect(
      CitySnapshotSchema.safeParse({ ...developmentCitySnapshot, token: "private" }).success,
    ).toBe(false);
    const resident = developmentCitySnapshot.residents[0];
    expect(
      CitySnapshotSchema.safeParse({
        ...developmentCitySnapshot,
        residents: [{ ...resident, eventId: "other" }],
      }).success,
    ).toBe(false);
    expect(
      CitySnapshotSchema.safeParse({
        ...developmentCitySnapshot,
        residents: [{ ...resident, photo: "private" }],
      }).success,
    ).toBe(false);
  });
  it("accepts verified Spine assets only in an explicitly marked local test snapshot", () => {
    const base = "/avatars/r1/v1/";
    const avatar = developmentCitySnapshot.avatars[0];
    if (!avatar) throw new Error("FIXTURE_MISSING");
    const spine = {
      runtime: "4.3",
      skeleton: `${base}skeleton.json`,
      atlas: `${base}skeleton.atlas`,
      pages: [`${base}page.png`],
      orientationPolicy: `${base}orientation-policy.json`,
      buildManifest: `${base}build-manifest.json`,
      sha256: "a".repeat(64),
    };
    const verified = {
      ...avatar,
      assetStatus: "VERIFIED_SPINE",
      manifest: { ...avatar.manifest, directions: undefined, spine },
    };
    const snapshot = {
      ...developmentCitySnapshot,
      avatars: [verified, ...developmentCitySnapshot.avatars.slice(1)],
    };
    expect(CitySnapshotSchema.safeParse(snapshot).success).toBe(false);
    expect(CitySnapshotSchema.safeParse({ ...snapshot, mode: "LOCAL_PRIVATE_TEST" }).success).toBe(
      true,
    );
  });

  it("requires a usable READY result while keeping the old general contract compatible", () => {
    const job = {
      schemaVersion: 1,
      jobId: "job-1",
      state: "READY",
      attempt: 1,
      deadline: "2026-10-18T01:00:30Z",
      updatedAt: "2026-10-18T01:00:01Z",
    };
    expect(DevelopmentJobSchema.safeParse(job).success).toBe(false);
    expect(
      DevelopmentJobSchema.safeParse({
        ...job,
        result: { avatarVersion: "fixture-sora-v1", mode: "FAST", fallback: true },
      }).success,
    ).toBe(true);
  });

  it("requires all six questionnaire answers or an explicit skip and never accepts a photo", () => {
    const input = {
      requestId: "request-1",
      eventId: "fixture-event",
      nickname: "そら",
      sampleId: "aoi",
      answers: null,
      scenario: "SUCCESS",
    };
    expect(CreateJobRequestSchema.safeParse(input).success).toBe(true);
    expect(CreateJobRequestSchema.safeParse({ ...input, answers: [0, 1] }).success).toBe(false);
    expect(
      CreateJobRequestSchema.safeParse({ ...input, photo: "data:image/png;base64,private" })
        .success,
    ).toBe(false);
    expect(CreateJobRequestSchema.safeParse({ ...input, eventId: "other" }).success).toBe(false);
  });

  it("requires explicit avatar consent and field-by-field disclosure choices", () => {
    expect(PublishRequestSchema.safeParse({ publicConsent: true }).success).toBe(false);
    expect(
      PublishRequestSchema.safeParse({
        avatarPublicConsent: true,
        consentVersion: 1,
        fields: { nickname: false, personality: false, interests: false },
      }).success,
    ).toBe(true);
  });
});
