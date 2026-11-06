import { SpineAdjustmentSchema, SpineBundleSchema } from "@ai-city/contracts";
import {
  type SpineAdminTask,
  type SpineAdminView,
  SpineAdminViewSchema,
  SpineRepairEntrySchema,
  SpineTaskIdSchema,
  SpineTaskStateSchema,
} from "@ai-city/contracts/spine";
import { z } from "zod";
import type { VisitorStore } from "../visitor/store";
import { evaluateWorker, HEARTBEAT_PATH } from "./heartbeat";

export const STUCK_AFTER_MS = 15 * 60_000;
export const REPAIR_LOG_PATH = "meta/spine-repair-log";
const MAX_TASKS = 200;
const MAX_REPAIRS = 20;
const ATTENTION_STATES = new Set(["FAILED", "UNKNOWN", "REQUIRES_REVIEW"]);

/** Only these fields of a stored job are ever read; everything else stays server-side. */
const jobView = z.object({
  state: SpineTaskStateSchema,
  stateSince: z.number().int().nonnegative().optional(),
  bundle: z.unknown().optional(),
  adjustment: z.unknown().optional(),
});

const heartbeat = z.object({ seenAt: z.number(), running: z.number() });

export async function buildAdminView(store: VisitorStore, now: number): Promise<SpineAdminView> {
  const [beat, log, listed] = await Promise.all([
    store.run((tx) => tx.get(HEARTBEAT_PATH)),
    store.run((tx) => tx.get(REPAIR_LOG_PATH)),
    store.listJobs(MAX_TASKS + 1),
  ]);
  const parsedBeat = heartbeat.safeParse(beat);
  const worker = evaluateWorker(parsedBeat.success ? parsedBeat.data : null, now);

  const tasks: SpineAdminTask[] = [];
  let queued = 0;
  let running = 0;
  for (const { id, value } of listed) {
    const task = SpineTaskIdSchema.safeParse(id);
    const job = jobView.safeParse(value);
    if (!task.success || !job.success || job.data.state === "WITHDRAWN") continue;
    const { state, stateSince } = job.data;
    if (state === "QUEUED") queued++;
    if (state === "RUNNING") running++;
    const stuck =
      state === "RUNNING" && stateSince !== undefined && now - stateSince > STUCK_AFTER_MS;
    const bundle = state === "PUBLISHED" ? SpineBundleSchema.safeParse(job.data.bundle) : null;
    const adjustment = SpineAdjustmentSchema.safeParse(job.data.adjustment);
    const preview = bundle?.success
      ? { bundle: bundle.data, adjustment: adjustment.success ? adjustment.data : null }
      : null;
    tasks.push({
      task: task.data,
      code: task.data.slice("spine-".length, "spine-".length + 8),
      state,
      stateSince: stateSince === undefined ? null : new Date(stateSince).toISOString(),
      needsAttention: ATTENTION_STATES.has(state) || stuck,
      preview,
    });
  }
  // Attention first; stable otherwise.
  tasks.sort((a, b) => Number(b.needsAttention) - Number(a.needsAttention));
  const truncated = listed.length > MAX_TASKS;

  const rawEntries =
    log && typeof log === "object" && Array.isArray((log as { entries?: unknown }).entries)
      ? ((log as { entries: unknown[] }).entries as unknown[])
      : [];
  const repairs = rawEntries
    .flatMap((e) => {
      const r = SpineRepairEntrySchema.safeParse(e);
      return r.success ? [r.data] : [];
    })
    .slice(-MAX_REPAIRS);

  return SpineAdminViewSchema.parse({
    worker,
    queued,
    running,
    tasks: tasks.slice(0, MAX_TASKS),
    truncated,
    repairs,
  });
}
