import { describe, expect, it } from "vitest";
import { createProductionJob, transitionProductionJob } from "./lifecycle";

describe("photo production lifecycle", () => {
  it("requires explicit processing and automatic publication consent before queueing", () => {
    expect(() => createProductionJob({ processing: false, automaticPublication: true })).toThrow();
    expect(() => createProductionJob({ processing: true, automaticPublication: false })).toThrow();
    expect(createProductionJob({ processing: true, automaticPublication: true }).state).toBe(
      "QUEUED",
    );
  });
  it("publishes only an approved verified result with consent still active", () => {
    const job = transitionProductionJob(
      createProductionJob({ processing: true, automaticPublication: true }),
      { type: "START" },
    );
    expect(() =>
      transitionProductionJob(job, { type: "PUBLISH", verified: true, approved: false }),
    ).toThrow();
    expect(() =>
      transitionProductionJob(job, { type: "PUBLISH", verified: false, approved: true }),
    ).toThrow();
    expect(
      transitionProductionJob(job, { type: "PUBLISH", verified: true, approved: true }).state,
    ).toBe("PUBLISHED");
  });
  it("never republishes after withdrawal, including a late worker result", () => {
    const job = createProductionJob({ processing: true, automaticPublication: true });
    const withdrawn = transitionProductionJob(transitionProductionJob(job, { type: "START" }), {
      type: "WITHDRAW",
    });
    expect(() =>
      transitionProductionJob(withdrawn, { type: "PUBLISH", verified: true, approved: true }),
    ).toThrow();
    expect(transitionProductionJob(withdrawn, { type: "WITHDRAW" })).toEqual(withdrawn);
  });
  it("does not blindly retry an unknown external result", () => {
    const job = transitionProductionJob(
      createProductionJob({ processing: true, automaticPublication: true }),
      { type: "START" },
    );
    const unknown = transitionProductionJob(job, { type: "UNKNOWN" });
    expect(() => transitionProductionJob(unknown, { type: "START" })).toThrow();
    expect(transitionProductionJob(unknown, { type: "WITHDRAW" }).state).toBe("WITHDRAWN");
  });
});

describe("admin requeue", () => {
  const base = createProductionJob({ processing: true, automaticPublication: true });
  it("returns the four recoverable states to QUEUED", () => {
    for (const state of ["UNKNOWN", "REQUIRES_REVIEW", "FAILED", "RUNNING"] as const)
      expect(transitionProductionJob({ ...base, state }, { type: "REQUEUE" }).state).toBe("QUEUED");
  });
  it("rejects every other state", () => {
    for (const state of ["PUBLISHED", "WITHDRAWN", "QUEUED", "PREPARED"] as const)
      expect(() => transitionProductionJob({ ...base, state }, { type: "REQUEUE" })).toThrow(
        "INVALID_TRANSITION",
      );
  });
});

describe("requeue of a genuinely withdrawn record", () => {
  it("reports INVALID_TRANSITION, not CONSENT_REQUIRED", () => {
    const withdrawn = transitionProductionJob(
      createProductionJob({ processing: true, automaticPublication: true }),
      { type: "WITHDRAW" },
    );
    expect(withdrawn.processingConsent).toBe(false);
    expect(() => transitionProductionJob(withdrawn, { type: "REQUEUE" })).toThrow(
      "INVALID_TRANSITION",
    );
  });
});
