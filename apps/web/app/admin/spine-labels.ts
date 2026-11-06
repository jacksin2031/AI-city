import type { SpineAdminTask } from "@ai-city/contracts/spine";

type SpineTaskState = SpineAdminTask["state"];

type Tone = "ok" | "wait" | "alert";

const STATES: Record<SpineTaskState, { label: string; tone: Tone }> = {
  QUEUED: { label: "順番待ち", tone: "wait" },
  RUNNING: { label: "作成中", tone: "wait" },
  PREPARED: { label: "公開準備中", tone: "wait" },
  UNKNOWN: { label: "状態不明", tone: "alert" },
  REQUIRES_REVIEW: { label: "要確認", tone: "alert" },
  FAILED: { label: "失敗", tone: "alert" },
  PUBLISHED: { label: "公開中", tone: "ok" },
  WITHDRAWN: { label: "取り下げ済み", tone: "ok" },
};

export function describeState(state: SpineTaskState): { label: string; tone: Tone } {
  return STATES[state];
}

/** Coarse age of a state for a glance at the list; the minute is the smallest useful unit. */
export function formatSince(stateSince: string | null, now: number): string {
  if (stateSince === null) return "不明";
  const minutes = Math.floor((now - Date.parse(stateSince)) / 60_000);
  if (!Number.isFinite(minutes)) return "不明";
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  return "1時間以上";
}
