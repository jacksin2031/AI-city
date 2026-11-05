/** Six entertainment traits shown on the hexagon. */
export const traitLabels = ["挑戦", "発想", "柔軟", "創造", "好奇心", "交流"] as const;

/**
 * Hexagon shape for an AI style. Used when the answers themselves are no longer on the phone
 * (after a reload only the style is kept, never the raw answers).
 */
const styleShapes: Record<string, readonly number[]> = {
  ひらめき探検家: [0.9, 0.85, 0.8, 0.9, 0.95, 0.8],
  実践チャレンジャー: [0.9, 0.45, 0.85, 0.5, 0.9, 0.55],
  じっくりアイデア家: [0.45, 0.9, 0.5, 0.85, 0.5, 0.9],
  しっかりサポーター: [0.6, 0.6, 0.65, 0.6, 0.6, 0.65],
  バランス型: [0.65, 0.65, 0.65, 0.65, 0.65, 0.65],
};
const NEUTRAL = 0.5;
const answerValue = [0.9, 0.5, 0.7];

/** One value per questionnaire item when all six are answered, otherwise the style's own shape. */
export function traitValues(
  answers: readonly (number | null)[],
  styleLabel: string,
): readonly number[] {
  if (answers.length === 6 && answers.every((answer) => answer !== null))
    return answers.map((answer) => answerValue[answer ?? 0] ?? NEUTRAL);
  return styleShapes[styleLabel] ?? Array(6).fill(NEUTRAL);
}
