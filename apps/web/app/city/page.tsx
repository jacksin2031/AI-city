import Link from "next/link";
import { CityPreview } from "./preview";

export default async function City({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const mode = (await searchParams).mode === "participants" ? "participants" : "sample";
  return (
    <main className="city-page">
      <h1>街の開発サンプル</h1>
      <p className="notice">
        簡易イラストと用意された会話は動作確認用です。写真からの生成やAIの会話ではありません。交通と列車の時刻はシミュレーションです。
      </p>
      <nav className="city-tabs" aria-label="街の表示モード">
        <Link href="/city" aria-current={mode === "sample" ? "page" : undefined}>
          イラストの見本
        </Link>
        <Link
          href="/city?mode=participants"
          aria-current={mode === "participants" ? "page" : undefined}
        >
          参加者の街
        </Link>
        <Link href="/join">参加してみる</Link>
      </nav>
      <CityPreview key={mode} mode={mode} />
      <Link href="/">戻る</Link>
    </main>
  );
}
