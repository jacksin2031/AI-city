import Link from "next/link";

export default function Join() {
  return (
    <main>
      <h1>AIシティへの参加</h1>
      <p>写真・質問・アバター確認の流れを準備しています。</p>
      <p className="notice">この開発画面では、写真や個人情報を収集しません。</p>
      <Link href="/">戻る</Link>
    </main>
  );
}
