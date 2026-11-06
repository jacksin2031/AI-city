import type { SpineTaskView } from "@ai-city/contracts/spine";

/**
 * The generator reports only a coarse state, never a percentage, so the bar is an honest estimate:
 * it holds low while the job waits in the queue, then rises slowly while it runs and never claims
 * completion until the character is actually published.
 */
// Measured: one character takes about 7 minutes once its turn comes (6 sequential image calls).
export const TYPICAL_RUN_SECONDS = 7 * 60;

export type ProgressView = {
  percent: number;
  label: string;
  phase: "waiting" | "running" | "done" | "attention";
};

export function estimateProgress(
  state: SpineTaskView["state"],
  runningSeconds: number,
): ProgressView {
  const seconds = Number.isFinite(runningSeconds) ? Math.max(0, runningSeconds) : 0;
  switch (state) {
    case "QUEUED":
      return { percent: 5, label: "順番を待っています", phase: "waiting" };
    case "RUNNING": {
      // 10% to 92%: an exponential approach keeps moving but never reaches the end by itself.
      const fraction = 1 - Math.exp(-seconds / (TYPICAL_RUN_SECONDS * 0.6));
      return {
        percent: Math.min(92, Math.round(10 + 82 * fraction)),
        label: "キャラクターを描いています",
        phase: "running",
      };
    }
    case "PUBLISHED":
      return { percent: 100, label: "キャラクターが完成しました", phase: "done" };
    case "PREPARED":
      return { percent: 8, label: "準備ができました。制作の開始を待っています", phase: "waiting" };
    default:
      // REQUIRES_REVIEW, FAILED, UNKNOWN, WITHDRAWN: the bar must not imply progress.
      return { percent: 0, label: "", phase: "attention" };
  }
}

export const attentionMessages: Partial<Record<SpineTaskView["state"], string>> = {
  REQUIRES_REVIEW:
    "自動チェックを通過できなかったため、公開を保留しています。運営スタッフにお声がけください。",
  FAILED: "キャラクターを作れませんでした。参加を取り消して、もう一度お試しください。",
  UNKNOWN: "制作の結果を確認できません。写真を再送せず、運営スタッフにお声がけください。",
  WITHDRAWN: "公開を取り消しました。",
};
