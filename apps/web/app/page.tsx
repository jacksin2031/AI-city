import Link from "next/link";
export const dynamic = "force-dynamic";

export default function Home() {
  const localDevelopment =
    process.env.AI_CITY_LOOPBACK_PREVIEW === "1" && process.env.AI_CITY_ENABLE_VISITORS !== "1";
  return (
    <main>
      <p>AI CITY</p>
      <h1>あなたの分身を、この街へ。</h1>
      <p>
        写真から生まれたアバターが、街を歩き、ほかの住民と交流する。AIの力を体験するための展示をつくっています。
      </p>
      <p className="notice">
        開発プレビューです。現在は架空のサンプルのみを使用しています。写真の送信とAIによる生成はまだ利用できません。
      </p>
      <nav aria-label="プレビュー">
        <Link href="/join">参加画面を確認</Link>
        {localDevelopment && (
          <>
            <Link href="/city">街のサンプルを見る</Link>
            <Link href="/integration">連携サンプルを見る</Link>
          </>
        )}
      </nav>
    </main>
  );
}
