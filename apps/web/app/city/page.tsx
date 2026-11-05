import { CityPreview } from "./preview";

// The city is the venue tablet's display; it is separate from the participant pages and links to none of them.
export const dynamic = "force-dynamic";

export default function City() {
  return (
    <>
      <header className="site-header">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true" />
          バーチャル御茶ノ水
        </span>
        <span className="badge">テスト運用</span>
      </header>
      <main className="page">
        <p className="eyebrow reveal">CITY</p>
        <h1 className="reveal">街の住民たち</h1>
        <p className="notice reveal">
          参加者が同意して公開したキャラクターが表示されます。会話はAIまたは用意された文章によるもので、本人の発言ではありません。
        </p>
        <div className="city-frame reveal">
          <CityPreview />
        </div>
      </main>
    </>
  );
}
