import Link from "next/link";
import { ParticipationFlow } from "./participation-flow";

export default function Join() {
  const hosted = Boolean(process.env.AI_CITY_PUBLIC_ORIGIN);
  return (
    <main className="participation">
      <h1>AIシティへの参加</h1>
      <p className="notice">
        {hosted
          ? "管理者専用の接続サンプルです。先にスマホの管理画面で接続してください。確認した項目は、管理者と接続済みの展示タブレットに公開されます。"
          : "ローカル開発サンプルです。"}
        写真の送信やAIによる生成は行いません。架空の名前だけでお試しください。
      </p>
      <ParticipationFlow hosted={hosted} />
      <nav aria-label="サンプルの移動">
        <Link href="/">戻る</Link>
        <Link href="/integration">連携用の一覧を見る</Link>
      </nav>
    </main>
  );
}
