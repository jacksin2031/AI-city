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
