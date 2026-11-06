import type { AiStyle } from "@ai-city/contracts/development";

export const questions = [
  [
    "AIを初めて使うなら？",
    ["まず自由に試す", "使い方を調べてから始める", "簡単な説明を見てから試す"],
  ],
  [
    "AIに何を手伝ってほしい？",
    ["新しいアイデアを考える", "情報を整理する", "両方を場面に合わせて使う"],
  ],
  ["AIの答えが予想と違ったら？", ["質問を変えて試す", "理由を確認する", "別の方法も考えてみる"]],
  [
    "AIと何かを作るなら？",
    ["想像を広げて作品を作る", "役に立つものを作る", "楽しさと実用性を両立する"],
  ],
  [
    "新しいAI機能を見つけたら？",
    ["すぐ触ってみる", "評判や使い方を確認する", "必要になったら試す"],
  ],
  [
    "AIとの会話で楽しいのは？",
    ["意外な発想に出会うこと", "疑問を一つずつ解決すること", "気軽にやりとりすること"],
  ],
] as const;

export function computeStyle(values: (number | null)[]): AiStyle {
  const score = (indices: number[]) =>
    indices.reduce((sum, i) => sum + (values[i] === 0 ? 1 : values[i] === 1 ? -1 : 0), 0);
  const a = score([0, 2, 4]),
    c = score([1, 3, 5]);
  return !a || !c
    ? "BALANCED"
    : a > 0
      ? c > 0
        ? "INSPIRED_EXPLORER"
        : "PRACTICAL_CHALLENGER"
      : c > 0
        ? "THOUGHTFUL_CREATOR"
        : "STEADY_SUPPORTER";
}
