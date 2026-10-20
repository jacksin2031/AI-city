"use client";
import { DevelopmentApiError } from "@ai-city/contracts/development-client";
import type { createDeviceClient } from "@ai-city/contracts/device-client";
import type { DeviceAdmin } from "@ai-city/contracts/device-link";
import { type FormEvent, useEffect, useState } from "react";
import { useDeviceFeed } from "../device-feed";
import { removeResidents } from "./actions";
import ManagedResidents from "./residents";

const modes = { DEMO: "イラストの見本", LIVE: "参加者の街", MAINTENANCE: "展示を休止" } as const;
export default function Admin({
  persistent = false,
  codeFree = false,
}: {
  persistent?: boolean;
  codeFree?: boolean;
}) {
  const feed = useDeviceFeed("admin");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const [revokeConfirm, setRevokeConfirm] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [now, setNow] = useState(0);
  const [invitation, setInvitation] = useState<{ code: string; expiresAt: string } | null>(null);
  useEffect(() => {
    if (!pairing) return;
    const timer = setInterval(() => {
      const timestamp = Date.now();
      setNow(timestamp);
      if (timestamp >= Date.parse(pairing.expiresAt)) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [pairing]);
  const remainingSeconds = pairing
    ? Math.max(0, Math.ceil((Date.parse(pairing.expiresAt) - now) / 1000))
    : 0;
  async function run(action: (api: ReturnType<typeof createDeviceClient>) => Promise<unknown>) {
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      const result = await action(feed.api.current);
      if (!feed.mounted.current) return;
      if (result && typeof result === "object" && "control" in result)
        feed.accept(result as DeviceAdmin);
    } catch (failure) {
      if (feed.mounted.current)
        setActionError(
          failure instanceof DevelopmentApiError
            ? failure.message
            : "操作を確認できませんでした。接続が戻ったら状態を確認してください。",
        );
    } finally {
      if (feed.mounted.current) setBusy(false);
    }
  }
  async function withdraw(ids: string[]) {
    let remaining = ids;
    await run(async (api) => {
      const result = await removeResidents(ids, (id) => api.remove(id));
      remaining = result.remaining;
      if (!feed.mounted.current) return;
      setNotice(`${result.removed.length}人を公開一覧から削除しました。`);
      if (remaining.length)
        setActionError(
          `残り${remaining.length}人の削除は完了を確認できませんでした。一覧を確認してから、必要な人だけ再選択してください。`,
        );
      return api.admin();
    });
    return remaining;
  }
  function login(event: FormEvent) {
    event.preventDefault();
    void run(async (api) => {
      await api.login(key);
      setKey("");
      feed.reconnect();
    });
  }
  const state = feed.state;
  return (
    <main className="device-page flow">
      <header>
        <p className="device-kicker">街のコントローラー</p>
        <h1>スマホで街を管理</h1>
        <p className="muted">
          スマホで操作、タブレットに表示。同じ接続先なら、別のWi-Fiやモバイル回線からも利用できます。
        </p>
      </header>
      {feed.error && (
        <p className="flow-error" role="alert">
          {feed.error}
        </p>
      )}
      {actionError && (
        <p className="flow-error" role="alert">
          {actionError}
        </p>
      )}
      {notice && (
        <p className="admin-notice" role="status">
          {notice}
        </p>
      )}
      {feed.loading ? (
        <p role="status">接続を確認しています。</p>
      ) : !state ? (
        <form className="flow-panel" onSubmit={login}>
          <h2>管理者として接続</h2>
          <label className="field">
            管理キー
            <input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              maxLength={256}
              required
            />
          </label>
          <button type="submit" disabled={busy}>
            管理画面に接続
          </button>
          <p className="muted">
            主催者から受け取ったキーを入力してください。ローカル開発ではコンピューターの準備画面で確認できます。
          </p>
        </form>
      ) : (
        <>
          <div className="device-status" role="status">
            <strong>接続中</strong>
            <span>
              タブレット {state.connectedDisplays}台を確認・登録 {state.pairedDisplays}台
            </span>
          </div>
          <section className="flow-panel">
            <h2>展示の操作</h2>
            <p>
              現在：{modes[state.control.displayMode]} ／ 動き
              {state.control.motionEnabled ? "あり" : "停止"}
            </p>
            <div className="admin-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async (api) => {
                    const next = await api.update({
                      expectedRevision: state.control.revision,
                      displayMode: "LIVE",
                      motionEnabled: true,
                    });
                    setNotice("参加者の街で展示を開始しました。");
                    return next;
                  })
                }
              >
                展示を開始
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void run(async (api) => {
                    const next = await api.update({
                      expectedRevision: state.control.revision,
                      displayMode: "MAINTENANCE",
                      motionEnabled: false,
                    });
                    setNotice("展示を休止し、動きを止めました。");
                    return next;
                  })
                }
              >
                休場する
              </button>
            </div>
            <p className="muted">
              接続中のタブレットに反映します。端末側の省動作設定を優先します。
            </p>
            <p className="muted">
              最終通信：
              {feed.lastReceivedAt
                ? new Date(feed.lastReceivedAt).toLocaleTimeString("ja-JP")
                : "確認中"}
            </p>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() =>
                void run(async (api) => {
                  const next = await api.admin();
                  setNotice("現在の状態を確認しました。");
                  return next;
                })
              }
            >
              今すぐ同期
            </button>
            <p className="muted">
              通信は約1秒ごとに確認します。接続台数は通信の確認数で、描画完了の通知ではありません。
            </p>
          </section>
          <section className="flow-panel">
            <h2>タブレットをつなぐ</h2>
            <p>タブレットで専用の展示画面を開き、コードを入力します。</p>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async (api) => {
                  const value = await api.pairing();
                  if (feed.mounted.current) {
                    setNow(Date.now());
                    setPairing(value);
                  }
                })
              }
            >
              タブレットの接続コードを発行
            </button>
            {pairing && remainingSeconds > 0 && (
              <div className="pairing-code">
                <strong data-testid="pair-code">{pairing.code}</strong>
                <p>3分間・1回だけ有効。新しく発行すると前のコードは使えません。</p>
                <p>有効期限：{new Date(pairing.expiresAt).toLocaleTimeString("ja-JP")}</p>
                <p data-testid="pair-countdown">残り{remainingSeconds}秒</p>
              </div>
            )}
            {pairing && remainingSeconds === 0 && (
              <p role="status">コードの有効期限が切れました。新しいコードを発行してください。</p>
            )}
          </section>
          {persistent && !codeFree && (
            <section className="flow-panel">
              <h2>参加者を招待する</h2>
              <p>参加者の画面に入力する、3分間・1回だけ有効なコードです。</p>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async (api) => {
                    const next = await api.visitorInvitation();
                    if (feed.mounted.current) setInvitation(next);
                  })
                }
              >
                参加用コードを発行
              </button>
              {invitation && (
                <>
                  <code className="visitor-code" data-testid="visitor-invitation">
                    {invitation.code}
                  </code>
                  <p>参加者へこのコードを渡し、参加画面に入力してください。</p>
                </>
              )}
            </section>
          )}
          <section className="flow-panel">
            <h2>タブレットに何を表示する？</h2>
            <div className="mode-controls">
              {Object.entries(modes).map(([mode, label]) => (
                <button
                  type="button"
                  className={state.control.displayMode === mode ? "" : "secondary"}
                  key={mode}
                  aria-pressed={state.control.displayMode === mode}
                  disabled={busy}
                  onClick={() =>
                    void run((api) =>
                      api.update({
                        expectedRevision: state.control.revision,
                        displayMode: mode as keyof typeof modes,
                      }),
                    )
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="muted">
              現在：{modes[state.control.displayMode]}。参加者の街も仮のイラストです。
            </p>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() =>
                void run((api) =>
                  api.update({
                    expectedRevision: state.control.revision,
                    motionEnabled: !state.control.motionEnabled,
                  }),
                )
              }
            >
              {state.control.motionEnabled ? "動きを止める" : "動きを再開"}
            </button>
          </section>
          <ManagedResidents residents={state.snapshot.residents} busy={busy} remove={withdraw} />
          <details className="flow-panel">
            <summary>接続を終了する</summary>
            <p>解除したタブレットには街の情報が表示されなくなります。</p>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => setRevokeConfirm(true)}
            >
              タブレットの接続をすべて解除
            </button>
            {revokeConfirm && (
              <fieldset className="admin-confirm" aria-label="タブレットの解除確認">
                <p>
                  登録中のタブレット{state.pairedDisplays}
                  台をすべて解除します。再接続には新しいコードが必要です。
                </p>
                <div className="admin-actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async (api) => {
                        const next = await api.revoke();
                        setPairing(null);
                        setRevokeConfirm(false);
                        setNotice("タブレットの接続をすべて解除しました。");
                        return next;
                      })
                    }
                  >
                    解除を確定
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => setRevokeConfirm(false)}
                  >
                    解除をやめる
                  </button>
                </div>
              </fieldset>
            )}
            <p>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void run(async (api) => {
                    await api.logout();
                    setPairing(null);
                    setInvitation(null);
                    setRevokeConfirm(false);
                    feed.reconnect();
                  })
                }
              >
                管理画面からログアウト
              </button>
            </p>
          </details>
        </>
      )}
      <p className="muted">
        開発サンプル・写真やAI生成は未接続です。接続の有効期限が切れた場合は、もう一度接続してください。
      </p>
    </main>
  );
}
