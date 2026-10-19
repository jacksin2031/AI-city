"use client";
import { DevelopmentApiError } from "@ai-city/contracts/development-client";
import type { createDeviceClient } from "@ai-city/contracts/device-client";
import type { DeviceAdmin } from "@ai-city/contracts/device-link";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { useDeviceFeed } from "../device-feed";

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
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<{ code: string; expiresAt: string } | null>(null);
  async function run(action: (api: ReturnType<typeof createDeviceClient>) => Promise<unknown>) {
    setBusy(true);
    feed.setError("");
    try {
      const result = await action(feed.api.current);
      if (!feed.mounted.current) return;
      if (result && typeof result === "object" && "control" in result)
        feed.accept(result as DeviceAdmin);
    } catch (failure) {
      if (feed.mounted.current)
        feed.setError(
          failure instanceof DevelopmentApiError
            ? failure.message
            : "操作を確認できませんでした。接続が戻ったら状態を確認してください。",
        );
    } finally {
      if (feed.mounted.current) setBusy(false);
    }
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
          <Link href="/setup">ローカル接続の準備</Link>
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
            <h2>タブレットをつなぐ</h2>
            <p>
              タブレットで同じサイトの <Link href="/tablet">タブレット用画面</Link>{" "}
              を開き、コードを入力します。
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async (api) => {
                  const value = await api.pairing();
                  if (feed.mounted.current) setPairing(value);
                })
              }
            >
              タブレットの接続コードを発行
            </button>
            {pairing && (
              <div className="pairing-code">
                <strong data-testid="pair-code">{pairing.code}</strong>
                <p>3分間・1回だけ有効。新しく発行すると前のコードは使えません。</p>
                <p>有効期限：{new Date(pairing.expiresAt).toLocaleTimeString("ja-JP")}</p>
              </div>
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
          <section className="flow-panel">
            <h2>
              公開中の住民 <span>{state.snapshot.residents.length}人</span>
            </h2>
            <p>
              <Link href="/join">参加画面を開く</Link>
            </p>
            {!state.snapshot.residents.length && (
              <p className="muted">まだ住民はいません。参加画面で確認した人だけ表示されます。</p>
            )}
            {state.snapshot.residents.map((resident) => (
              <article className="managed-resident" key={resident.residentId}>
                <strong>{resident.nickname}</strong>
                {removeId === resident.residentId ? (
                  <div>
                    <p>この住民を街から削除しますか？</p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(async (api) => {
                          const next = await api.remove(resident.residentId);
                          setRemoveId(null);
                          return next;
                        })
                      }
                    >
                      削除を確定
                    </button>
                    <button type="button" className="secondary" onClick={() => setRemoveId(null)}>
                      戻る
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => setRemoveId(resident.residentId)}
                  >
                    街から削除
                  </button>
                )}
              </article>
            ))}
          </section>
          <details className="flow-panel">
            <summary>接続を終了する</summary>
            <p>解除したタブレットには街の情報が表示されなくなります。</p>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() =>
                void run(async (api) => {
                  setPairing(null);
                  return api.revoke();
                })
              }
            >
              タブレットの接続をすべて解除
            </button>
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
      <Link href="/">戻る</Link>
    </main>
  );
}
