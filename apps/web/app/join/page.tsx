import Link from "next/link";
import { ParticipantExperience } from "./participant-experience";
import { ParticipationFlow } from "./participation-flow";
export const dynamic = "force-dynamic";

export default function Join() {
  const hosted = Boolean(process.env.AI_CITY_PUBLIC_ORIGIN);
  const persistent = process.env.AI_CITY_ENABLE_VISITORS === "1";
  const codeFree = persistent && process.env.AI_CITY_VISITOR_CODE_FREE === "1";
  if (codeFree) return <ParticipantExperience />;
  return (
    <main className="participation">
      <h1>AIシティへの参加</h1>
      <p className="notice">
        {codeFree
          ? "ニックネームとキャラクターを選んで始めましょう。公開前に内容を確認できます。"
          : persistent
            ? "管理者から受け取った参加用コードで始めます。このブラウザーだけの参加情報を24時間保存します。確認した項目だけが管理者と、参加者の街に切り替えた展示タブレットに公開されます。共有端末では終了前に参加情報を削除してください。"
            : hosted
              ? "管理者専用の接続サンプルです。先にスマホの管理画面で接続してください。確認した項目は、管理者と接続済みの展示タブレットに公開されます。"
              : "ローカル開発サンプルです。"}
        写真の送信やAIによる生成は行いません。架空の名前だけでお試しください。
      </p>
      {codeFree && (
        <details className="sample-options">
          <summary>参加情報と公開について</summary>
          <p>
            このブラウザーだけの参加情報を24時間保存します。確認した項目だけが管理者と展示タブレットに公開されます。共有端末では終了前に参加情報を削除してください。
          </p>
        </details>
      )}
      <ParticipationFlow
        hosted={hosted || persistent}
        persistent={persistent}
        codeFree={codeFree}
      />
      <nav aria-label="サンプルの移動">
        <Link href="/">戻る</Link>
        {!persistent && <Link href="/integration">連携用の一覧を見る</Link>}
      </nav>
    </main>
  );
}
