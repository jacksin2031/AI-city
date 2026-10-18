import Link from "next/link";
import { CityIntegrationPreview } from "./preview";

export default function Integration() {
  return (
    <main className="participation">
      <h1>ローカル連携サンプル</h1>
      <p className="notice">
        開発用の一覧です。架空のサンプルのみを使用し、写真やAI生成には接続していません。画像の参照先には、まだ素材がありません。
      </p>
      <CityIntegrationPreview />
      <nav aria-label="サンプルの移動">
        <Link href="/join">参加サンプルを試す</Link>
        <Link href="/city">街の開発サンプルを見る</Link>
        <Link href="/">戻る</Link>
      </nav>
    </main>
  );
}
