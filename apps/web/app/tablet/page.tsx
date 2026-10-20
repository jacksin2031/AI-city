"use client";
import { type FormEvent, useState } from "react";
import { useDeviceFeed } from "../device-feed";
import { TabletCity } from "./city";
export default function Tablet() {
  const feed = useDeviceFeed("display");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  async function pair(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await feed.api.current.pair(code);
      if (feed.mounted.current) {
        setCode("");
        feed.reconnect();
      }
    } catch {
      if (feed.mounted.current)
        feed.setError("接続コードを確認してください。無効な場合はスマホで発行し直してください。");
    } finally {
      if (feed.mounted.current) setBusy(false);
    }
  }
  const state = feed.state;
  if (!state)
    return (
      <main className="device-page flow">
        <h1>タブレットを接続</h1>
        <p>スマホの管理画面で発行したコードを入力してください。</p>
        {feed.error && (
          <p role="alert" className="flow-error">
            {feed.error}
          </p>
        )}
        {feed.loading ? (
          <p role="status">接続を確認しています。</p>
        ) : (
          <form className="flow-panel" onSubmit={pair}>
            <label className="field">
              8桁の接続コード
              <input
                inputMode="numeric"
                autoComplete="off"
                pattern="[0-9]{8}"
                minLength={8}
                maxLength={8}
                required
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, ""))}
              />
            </label>
            <button type="submit" disabled={busy}>
              街に接続
            </button>
          </form>
        )}
        <p className="muted">
          同じHTTPSの接続先を使えば、スマホと別のネットワークでもつながります。接続中は管理情報を表示しません。
        </p>
      </main>
    );
  const control = state.control;
  return (
    <main className="tablet-display">
      <header className="tablet-bar">
        <div>
          <h1>AIシティ</h1>
          <p>
            {control.displayMode === "DEMO"
              ? "架空の住民・イラスト見本"
              : control.displayMode === "LIVE"
                ? "参加者の街"
                : "展示を休止中"}
          </p>
        </div>
        <div>
          <span role="status" className="connection-pill">
            スマホと連携中
          </span>
          <button
            type="button"
            onClick={async () => {
              try {
                if (document.fullscreenElement) await document.exitFullscreen();
                else await document.documentElement.requestFullscreen();
                setFullscreenError("");
              } catch {
                setFullscreenError("この端末では全画面に切り替えられません。");
              }
            }}
          >
            全画面
          </button>
        </div>
      </header>
      {fullscreenError && <p role="status">{fullscreenError}</p>}
      {control.displayMode === "MAINTENANCE" ? (
        <section className="tablet-maintenance">
          <h2>ただいま準備中です</h2>
          <p>再開までしばらくお待ちください。</p>
        </section>
      ) : (
        state.snapshot && (
          <>
            <TabletCity
              key={`${control.serverId}:${control.displayMode}:${state.snapshot.streamId}`}
              snapshot={state.snapshot}
              motion={control.motionEnabled}
              sample={control.displayMode === "DEMO"}
            />
            <footer className="tablet-footer">
              <span>
                {!control.motionEnabled
                  ? "動きは停止中"
                  : "街の動きは端末の設定に合わせて表示します"}
              </span>
              <span>{state.snapshot.residents.length}人 · 仮のイラストと用意された会話</span>
            </footer>
          </>
        )
      )}
      <p className="tablet-note">
        住民をタップすると公開プロフィールを表示します。写真からの生成・AIの会話ではありません。展示の管理はスマホから行います。
      </p>
    </main>
  );
}
