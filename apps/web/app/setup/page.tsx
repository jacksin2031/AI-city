"use client";
import { createDeviceClient } from "@ai-city/contracts/device-client";
import Link from "next/link";
import { useState } from "react";
export default function Setup() {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  return (
    <main className="device-page flow">
      <h1>接続の準備</h1>
      <p>このコンピューターだけで使う、開発サンプルの管理キーです。</p>
      <p className="notice">
        実際のスマホ・平板は同じHTTPSの接続先で開きます。公開サービスではこの画面からキーを取得できません。主催者から管理キーを受け取ってください。
      </p>
      <button
        type="button"
        onClick={async () => {
          try {
            setKey((await createDeviceClient().bootstrap()).key);
            setError("");
          } catch {
            setError("ここでは管理キーを取得できません。主催者に確認してください。");
          }
        }}
      >
        ローカル管理キーを表示
      </button>
      {error && <p role="alert">{error}</p>}
      {key && (
        <div className="flow-panel">
          <p>管理キー（共有・撮影しないでください）</p>
          <code className="bootstrap-key">{key}</code>
          <p>ローカル確認用です。サーバーを再起動すると接続情報は失われます。</p>
          <Link href="/admin">スマホ用管理画面へ</Link>
          <button className="secondary" type="button" onClick={() => setKey("")}>
            キーを隠す
          </button>
        </div>
      )}
      <p>
        <Link href="/">戻る</Link>
      </p>
    </main>
  );
}
