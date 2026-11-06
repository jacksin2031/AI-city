import type { SpineTaskView } from "@ai-city/contracts/spine";

/**
 * The generator reports only a coarse job state: no percentage and no measured ETA. The display is
 * therefore driven by that state alone. It never animates with elapsed time, never shows a
 * percentage, and names no duration. Only PUBLISHED may say the character is complete.
 */
export type ProgressStep = 1 | 2 | 3;

export type ProgressView = {
  /** Discrete position in the three fixed steps: waiting, making, complete. Null for problems. */
  step: ProgressStep | null;
  /** Fixed number of steps, for "n / total" labels. */
  total: 3;
  heading: string;
  label: string;
  /** One honest sentence about what is happening; never a time estimate. */
  detail: string;
  phase: "waiting" | "running" | "done" | "attention";
};

export const PROGRESS_STEPS = ["順番待ち", "制作中", "完成"] as const;

export function describeProgress(state: SpineTaskView["state"]): ProgressView {
  switch (state) {
    case "QUEUED":
      return {
        step: 1,
        total: 3,
        heading: "キャラクターの順番を待っています",
        label: "順番待ち",
        detail:
          "写真は受け付け済みで、制作が始まるのを待っています。混雑状況により、始まるまでの時間は変わります。",
        phase: "waiting",
      };
    case "PREPARED":
      return {
        step: 1,
        total: 3,
        heading: "キャラクターの順番を待っています",
        label: "準備完了・制作の開始待ち",
        detail: "制作の準備ができました。制作が始まるのを待っています。",
        phase: "waiting",
      };
    case "RUNNING":
      return {
        step: 2,
        total: 3,
        heading: "キャラクターを作っています",
        label: "制作中",
        detail:
          "制作しています。終わるまでの時間は分かりません。この画面は開いたままで大丈夫です。",
        phase: "running",
      };
    case "PUBLISHED":
      return {
        step: 3,
        total: 3,
        heading: "キャラクターが完成しました",
        label: "完成",
        detail: "あなたのキャラクターが街に公開されました。",
        phase: "done",
      };
    default:
      // REQUIRES_REVIEW, FAILED, UNKNOWN, WITHDRAWN: no step may imply progress.
      return {
        step: null,
        total: 3,
        heading: "確認が必要です",
        label: "",
        detail: "",
        phase: "attention",
      };
  }
}

export const attentionMessages: Partial<Record<SpineTaskView["state"], string>> = {
  REQUIRES_REVIEW:
    "自動チェックを通過できなかったため、公開を保留しています。運営スタッフにお声がけください。",
  FAILED:
    "キャラクターを作れませんでした。運営スタッフにお声がけください。参加を取り消して、もう一度お試しいただくこともできます。",
  UNKNOWN: "制作の結果を確認できません。写真を再送せず、運営スタッフにお声がけください。",
  WITHDRAWN: "公開を取り消しました。",
};
