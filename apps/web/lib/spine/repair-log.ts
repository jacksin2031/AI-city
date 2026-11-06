import { type SpineRepairEntry, SpineRepairEntrySchema } from "@ai-city/contracts/spine";
import type { VisitorTransaction } from "../visitor/store";
import { REPAIR_LOG_PATH } from "./admin-view";

export const MAX_REPAIR_LOG = 50;

/**
 * Appends one entry (newest last, capped) inside the caller's transaction. It records only the
 * time, the action and the 8-hex task code; never who acted.
 */
export async function appendRepairLog(
  tx: VisitorTransaction,
  action: SpineRepairEntry["action"],
  task: string,
  now: number,
): Promise<void> {
  const raw = await tx.get(REPAIR_LOG_PATH);
  const previous = Array.isArray(raw?.entries) ? (raw.entries as unknown[]) : [];
  const kept = previous.flatMap((entry) => {
    const parsed = SpineRepairEntrySchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
  const entry = SpineRepairEntrySchema.parse({
    at: new Date(now).toISOString(),
    action,
    code: task.slice("spine-".length, "spine-".length + 8),
  });
  tx.set(REPAIR_LOG_PATH, { entries: [...kept, entry].slice(-MAX_REPAIR_LOG) });
}
