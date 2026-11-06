"use client";
import { createDeviceClient } from "@ai-city/contracts/device-client";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useDeviceFeed } from "../device-feed";
import { TabletCity } from "./city";
import { useAutoReload } from "./use-auto-reload";
export default function Tablet() {
  const feed = useDeviceFeed("display");
  useAutoReload();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  // Operator aids (fullscreen, pickers, status lines) stay off the public screen unless asked for.
  const [tools, setTools] = useState(false);
  useEffect(() => {
    setTools(new URLSearchParams(location.search).get("tools") === "1");
  }, []);
  const [focus, setFocus] = useState<{ id: string; residentId: string; expiresAt: number } | null>(
    null,
  );
  const [queuedFocus, setQueuedFocus] = useState<{ requestId: string; residentId: string } | null>(
    null,
  );
  const live = feed.state?.control.displayMode === "LIVE";
  const acknowledgeFocus = useCallback(async (requestId: string) => {
    await createDeviceClient().ackFocus(requestId);
  }, []);
  useEffect(() => {
    if (!live) {
      setQueuedFocus(null);
      return;
    }
    const controller = new AbortController();
    const client = createDeviceClient({ signal: controller.signal });
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await client.nextFocus();
        if (!controller.signal.aborted) setQueuedFocus(result.focus);
      } catch {
        if (!controller.signal.aborted) setQueuedFocus(null);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 1000);
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [live]);
  useEffect(() => {
    if (!live) {
      setFocus(null);
      return;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch("/api/link/focus", {
          credentials: "same-origin",
          cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]),
        });
        const value: unknown = response.ok ? await response.json() : null;
        if (value && typeof value === "object" && "focus" in value) {
          const item = value.focus;
          if (
            item &&
            typeof item === "object" &&
            "id" in item &&
            "residentId" in item &&
            "expiresAt" in item &&
            typeof item.id === "string" &&
            typeof item.residentId === "string" &&
            typeof item.expiresAt === "number" &&
            item.expiresAt > Date.now()
          )
            setFocus({ id: item.id, residentId: item.residentId, expiresAt: item.expiresAt });
        }
      } catch {
        /* Connection status is managed by the display feed. */
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 1000);
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [live]);
  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", update);
    update();
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
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
      {tools && (
        <div className="tablet-controls">
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
            {fullscreen ? "全画面を終了" : "全画面"}
          </button>
          {fullscreenError && <p role="status">{fullscreenError}</p>}
        </div>
      )}
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
              focus={focus}
              reliableFocus={queuedFocus}
              onFocusApplied={acknowledgeFocus}
              totalParticipants={state.totalParticipants}
              tools={tools}
            />
            <p className={tools ? "tablet-disclaimer" : "visually-hidden"}>
              {control.displayMode === "DEMO"
                ? "架空の住民"
                : state.snapshot.mode === "LOCAL_PRIVATE_TEST"
                  ? "キャラクターは本機テスト"
                  : "仮のイラスト"}
              ・交通は見本
              {!control.motionEnabled && "・動きは停止中"}
            </p>
          </>
        )
      )}
    </main>
  );
}
