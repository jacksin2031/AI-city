import Link from "next/link";
import { ParticipationFlow } from "./participation-flow";

export default function Join() {
  return (
    <main className="participation">
      <h1>AIシティへの参加</h1>
      <p className="notice">
        ローカル開発サンプルです。写真の送信やAIによる生成は行いません。架空の名前だけでお試しください。
      </p>
      <ParticipationFlow />
      <nav aria-label="サンプルの移動">
        <Link href="/">戻る</Link>
        <Link href="/integration">連携用の一覧を見る</Link>
      </nav>
    </main>
  );
}
