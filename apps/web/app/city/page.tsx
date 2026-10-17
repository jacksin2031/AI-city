import Link from "next/link";
import { CityPreview } from "./preview";

export default function City() {
  return (
    <main>
      <h1>街の開発サンプル</h1>
      <p className="notice">
        表示している丸い図形は動作確認用です。生成されたアバターやAIの会話ではありません。
      </p>
      <CityPreview />
      <Link href="/">戻る</Link>
    </main>
  );
}
