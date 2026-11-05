// Deterministic mapping from questionnaire answers to a public label and interests.
// Raw answers are never stored or returned; only these derived fields are.
export const questionCount = 6;

const interestByQuestion = [
  ["自由に試す", "説明を読む", "お試し前の確認"],
  ["アイデア", "情報整理", "使い分け"],
  ["言い換え", "理由の確認", "別の方法"],
  ["創作", "便利なもの作り", "楽しさと実用"],
  ["新機能", "評判チェック", "必要なときに"],
  ["意外な発想", "疑問の解決", "気軽な会話"],
] as const;

export type Answers = (number | null)[];

export function validAnswers(value: unknown): value is Answers {
  return (
    Array.isArray(value) &&
    value.length === questionCount &&
    value.every((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 2))
  );
}

export function derivePersonality(answers: Answers | null) {
  if (!answers || answers.some((a) => a === null)) {
    return { personalityLabel: "未回答", interests: [] as string[] };
  }
  const score = (indices: number[]) =>
    indices.reduce((sum, i) => sum + (answers[i] === 0 ? 1 : answers[i] === 1 ? -1 : 0), 0);
  const adventurous = score([0, 2, 4]);
  const creative = score([1, 3, 5]);
  const personalityLabel =
    adventurous === 0 || creative === 0
      ? "バランス型"
      : adventurous > 0
        ? creative > 0
          ? "ひらめき探検家"
          : "実践チャレンジャー"
        : creative > 0
          ? "じっくりアイデア家"
          : "しっかりサポーター";
  const interests = answers.slice(0, 3).map((a, i) => interestByQuestion[i]?.[a ?? 0] ?? "");
  interests.push(...answers.slice(3).map((a, i) => interestByQuestion[i + 3]?.[a ?? 0] ?? ""));
  return { personalityLabel, interests: [...new Set(interests.filter(Boolean))].slice(0, 6) };
}
