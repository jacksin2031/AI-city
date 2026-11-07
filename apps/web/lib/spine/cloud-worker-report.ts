import { SpineTaskIdSchema } from "@ai-city/contracts/spine";

/**
 * Listing and logging helpers for the cloud worker. Everything here works on counts and reason
 * codes only: it never touches photo bytes, owners, digests, names, URLs or tokens, and it never
 * emits task IDs, because worker logs are readable by more people than the job records are.
 */
export type ListedDoc = { id: string; data: Record<string, unknown> };

/** Operator-only Preview test: never visit withdrawn, running or previously held jobs. */
export function previewOnlyQueued(docs: ListedDoc[]): ListedDoc[] {
  return docs.filter(
    (doc) => doc.data.photoStorage === "CLOUD_PRIVATE" && doc.data.state === "QUEUED",
  );
}

export type TaskListing = {
  /** Tasks that may need work, queued ones first and oldest first. */
  tasks: string[];
  /** Withdrawn jobs whose cleanup is already finished: nothing is left to do, so they are not visited. */
  settled: number;
  /** Count of every listed job by state, including settled ones. */
  byState: Record<string, number>;
  oldestQueuedSeconds: number | null;
  oldestRunningSeconds: number | null;
};

/** A queued job that no pass has claimed for this long is reported, never retried automatically. */
export const QUEUED_UNCLAIMED_WARN_MS = 10 * 60_000;
/** Same threshold as the admin view's stuck marker. */
export const RUNNING_WARN_MS = 15 * 60_000;
const REPORT_EVERY_MS = 5 * 60_000;
const MAX_KEYS = 24;

function epoch(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/**
 * Pure reduction of the job documents the worker already fetched. The job documents are named
 * `spine-<task>` where the task itself is `spine-<uuid>`.
 */
export function buildTaskListing(docs: ListedDoc[], now: number): TaskListing {
  const byState: Record<string, number> = {};
  const queued: { task: string; since: number }[] = [];
  const others: string[] = [];
  let settled = 0;
  let oldestQueued: number | null = null;
  let oldestRunning: number | null = null;
  for (const doc of docs) {
    const task = doc.id.replace(/^spine-/, "");
    if (!SpineTaskIdSchema.safeParse(task).success) continue;
    if (doc.data.photoStorage !== "CLOUD_PRIVATE") continue;
    const state = typeof doc.data.state === "string" ? doc.data.state : "INVALID";
    byState[state] = (byState[state] ?? 0) + 1;
    const since = epoch(doc.data.stateSince);
    if (
      state === "WITHDRAWN" &&
      doc.data.cleanupPending === false &&
      doc.data.toolCleanupPending !== true
    ) {
      settled += 1;
      continue;
    }
    if (state === "QUEUED") {
      const queuedAt = epoch(doc.data.queuedAt) ?? since ?? 0;
      queued.push({ task, since: queuedAt });
      if (queuedAt > 0) oldestQueued = Math.min(oldestQueued ?? queuedAt, queuedAt);
    } else {
      others.push(task);
      if (state === "RUNNING" && since !== null)
        oldestRunning = Math.min(oldestRunning ?? since, since);
    }
  }
  queued.sort((a, b) => a.since - b.since);
  return {
    tasks: [...queued.map((entry) => entry.task), ...others],
    settled,
    byState,
    oldestQueuedSeconds: ageSeconds(oldestQueued, now),
    oldestRunningSeconds: ageSeconds(oldestRunning, now),
  };
}

function ageSeconds(since: number | null, now: number): number | null {
  return since === null ? null : Math.max(0, Math.round((now - since) / 1000));
}

export type PollSummary = {
  claimed: number;
  cleaned: number;
  /** Reason code to count. Codes are fixed names, never derived from job content. */
  skipped: Record<string, number>;
  listing?: Omit<TaskListing, "tasks"> & { listed: number };
};

/** Conditions that need a person, derived from the summary. They never trigger a retry. */
export function pollWarnings(summary: PollSummary): string[] {
  const warnings: string[] = [];
  const listing = summary.listing;
  if (
    listing?.oldestQueuedSeconds != null &&
    summary.claimed === 0 &&
    listing.oldestQueuedSeconds * 1000 >= QUEUED_UNCLAIMED_WARN_MS
  )
    warnings.push("QUEUED_NOT_CLAIMED");
  if (
    listing?.oldestRunningSeconds != null &&
    listing.oldestRunningSeconds * 1000 >= RUNNING_WARN_MS
  )
    warnings.push("RUNNING_LONG");
  return warnings;
}

/**
 * Turns poll summaries into at most one short JSON line: when something was done, when the picture
 * changed, and otherwise once every few minutes, so an idle or stuck worker is never silent.
 */
export class PollReporter {
  private lastSignature = "";
  private lastAt = Number.NEGATIVE_INFINITY;
  constructor(private readonly now: () => number = Date.now) {}

  line(summary: PollSummary): string | null {
    const at = this.now();
    const warnings = pollWarnings(summary);
    const skipped = Object.fromEntries(
      Object.entries(summary.skipped)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, MAX_KEYS),
    );
    const body = {
      claimed: summary.claimed,
      cleaned: summary.cleaned,
      skipped,
      ...(summary.listing
        ? {
            listed: summary.listing.listed,
            settled: summary.listing.settled,
            states: summary.listing.byState,
            oldestQueuedSeconds: summary.listing.oldestQueuedSeconds,
            oldestRunningSeconds: summary.listing.oldestRunningSeconds,
          }
        : {}),
      warnings,
    };
    // Ages move every poll; only the shape decides whether the picture changed.
    const signature = JSON.stringify({
      skipped,
      states: summary.listing?.byState,
      warnings,
      active: summary.claimed + summary.cleaned > 0,
    });
    const changed = signature !== this.lastSignature || summary.claimed + summary.cleaned > 0;
    if (!changed && at - this.lastAt < REPORT_EVERY_MS) return null;
    this.lastSignature = signature;
    this.lastAt = at;
    return JSON.stringify({ at: new Date(at).toISOString(), ...body });
  }
}
