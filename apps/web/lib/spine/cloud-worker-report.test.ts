import { describe, expect, it } from "vitest";
import {
  buildTaskListing,
  PollReporter,
  type PollSummary,
  pollWarnings,
} from "./cloud-worker-report";

const id = (n: number) => `spine-00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const doc = (n: number, data: Record<string, unknown>) => ({
  id: `spine-${id(n)}`,
  data: { photoStorage: "CLOUD_PRIVATE", ...data },
});
const NOW = 10_000_000;

describe("buildTaskListing", () => {
  it("visits queued jobs first, oldest first, then everything that may need cleanup", () => {
    const listing = buildTaskListing(
      [
        doc(1, { state: "PUBLISHED", stateSince: 5 }),
        doc(2, { state: "QUEUED", stateSince: NOW - 1_000, queuedAt: NOW - 1_000 }),
        doc(3, { state: "QUEUED", stateSince: NOW - 9_000, queuedAt: NOW - 9_000 }),
        doc(4, { state: "RUNNING", stateSince: NOW - 60_000 }),
      ],
      NOW,
    );
    expect(listing.tasks).toEqual([id(3), id(2), id(1), id(4)]);
    expect(listing.oldestQueuedSeconds).toBe(9);
    expect(listing.oldestRunningSeconds).toBe(60);
    expect(listing.byState).toEqual({ QUEUED: 2, PUBLISHED: 1, RUNNING: 1 });
  });

  it("does not visit a withdrawn job whose cleanup is finished, but still counts it", () => {
    const listing = buildTaskListing(
      [
        doc(1, { state: "WITHDRAWN", cleanupPending: false, toolCleanupPending: false }),
        doc(2, { state: "WITHDRAWN", cleanupPending: true }),
        doc(3, { state: "WITHDRAWN", cleanupPending: false, toolCleanupPending: true }),
        doc(4, { state: "WITHDRAWN" }),
      ],
      NOW,
    );
    expect(listing.settled).toBe(1);
    expect(listing.tasks).toEqual([id(2), id(3), id(4)]);
    expect(listing.byState).toEqual({ WITHDRAWN: 4 });
  });

  it("ignores documents that are not cloud photo jobs and tolerates odd fields", () => {
    const listing = buildTaskListing(
      [
        { id: "spine-not-a-task", data: { photoStorage: "CLOUD_PRIVATE", state: "QUEUED" } },
        { id: `spine-${id(1)}`, data: { state: "QUEUED" } },
        doc(2, { state: 7, stateSince: "bad" }),
      ],
      NOW,
    );
    expect(listing.tasks).toEqual([id(2)]);
    expect(listing.byState).toEqual({ INVALID: 1 });
  });
});

describe("PollReporter", () => {
  const base: PollSummary = { claimed: 0, cleaned: 0, skipped: { NOT_QUEUED: 4 } };
  it("is quiet while nothing changes, then repeats every few minutes", () => {
    let now = 1_000_000;
    const reporter = new PollReporter(() => now);
    expect(reporter.line(base)).not.toBeNull();
    now += 5_000;
    expect(reporter.line(base)).toBeNull();
    now += 5 * 60_000;
    expect(reporter.line(base)).not.toBeNull();
  });
  it("reports at once when the picture changes or work was done", () => {
    let now = 1_000_000;
    const reporter = new PollReporter(() => now);
    reporter.line(base);
    now += 5_000;
    expect(reporter.line({ ...base, skipped: { PHOTO_MISSING: 1 } })).toContain("PHOTO_MISSING");
    now += 5_000;
    expect(reporter.line({ claimed: 1, cleaned: 0, skipped: {} })).not.toBeNull();
    now += 5_000;
    expect(reporter.line({ claimed: 1, cleaned: 0, skipped: {} })).not.toBeNull();
  });
  it("emits one line of counts and codes with no identifiers", () => {
    const reporter = new PollReporter(() => 0);
    const line =
      reporter.line({
        claimed: 0,
        cleaned: 0,
        skipped: { BAD_PHOTO_DIGEST: 1 },
        listing: {
          listed: 2,
          settled: 0,
          byState: { QUEUED: 1 },
          oldestQueuedSeconds: 3,
          oldestRunningSeconds: null,
        },
      }) ?? "";
    expect(line.split("\n")).toHaveLength(1);
    expect(line).not.toMatch(/spine-|[0-9a-f]{32}|https?:/);
    expect(JSON.parse(line)).toMatchObject({ skipped: { BAD_PHOTO_DIGEST: 1 }, listed: 2 });
  });
  it("warns about an unclaimed old queue and a long run, without retrying anything", () => {
    const listing = {
      listed: 2,
      settled: 0,
      byState: { QUEUED: 1, RUNNING: 1 },
      oldestQueuedSeconds: 11 * 60,
      oldestRunningSeconds: 16 * 60,
    };
    expect(pollWarnings({ claimed: 0, cleaned: 0, skipped: {}, listing })).toEqual([
      "QUEUED_NOT_CLAIMED",
      "RUNNING_LONG",
    ]);
    expect(pollWarnings({ claimed: 1, cleaned: 0, skipped: {}, listing })).toEqual([
      "RUNNING_LONG",
    ]);
    expect(pollWarnings({ claimed: 0, cleaned: 0, skipped: {} })).toEqual([]);
  });
});
