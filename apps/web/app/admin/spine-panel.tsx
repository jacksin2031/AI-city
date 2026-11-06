"use client";
import { fetchSpineBundle } from "@ai-city/city";
import { SPINE_PARTS, type SpineAdjustment, type SpinePart } from "@ai-city/contracts";
import { DevelopmentApiError } from "@ai-city/contracts/development-client";
import { createDeviceClient } from "@ai-city/contracts/device-client";
import { type DevicePresetId, PRESET_CHARACTERS } from "@ai-city/contracts/device-link";
import type { SpineAdminAction, SpineAdminTask, SpineAdminView } from "@ai-city/contracts/spine";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adjustmentKey, bundleKey } from "./spine-keys";
import { describeState, formatSince } from "./spine-labels";

type Bundle = Awaited<ReturnType<typeof fetchSpineBundle>>;
type Preview = NonNullable<SpineAdminTask["preview"]>;

const POLL_MS = 10_000;
const PART_LABELS: Record<SpinePart, string> = {
  hair: "髪",
  handLeft: "左手",
  handRight: "右手",
  footLeft: "左足",
  footRight: "右足",
};
const ACTION_LABELS = {
  cancel: "取り消し",
  requeue: "作り直し",
  preset: "見本キャラクターへの変更",
  adjust: "調整の保存",
  resetAdjust: "調整のリセット",
} as const;
const NEUTRAL = { dx: 0, dy: 0, scale: 1 };
const AXES = [
  { key: "dy", label: "上下", min: -0.15, max: 0.15, step: 0.01 },
  { key: "dx", label: "左右", min: -0.15, max: 0.15, step: 0.01 },
  { key: "scale", label: "大きさ", min: 0.5, max: 1.5, step: 0.05 },
] as const;

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function describeFailure(failure: unknown): string {
  if (failure instanceof DevelopmentApiError) {
    // The server also says PHOTO_GONE when cloud intake is off, so never claim a deletion.
    if (failure.code === "PHOTO_GONE")
      return "再生成できません（写真が残っていない、または未接続）";
    if (failure.message) return failure.message;
  }
  return "操作を確認できませんでした。接続が戻ったら状態を確認してください。";
}

/** Draws one settled idle frame of a character; the caller owns the bundle. */
function drawStill(bundle: Bundle, adjustment: SpineAdjustment | null): string {
  const player = bundle.create(adjustment ?? undefined);
  try {
    player.advance("movement/idle-front", "front", 0);
    return player.canvas.toDataURL("image/png");
  } finally {
    player.dispose();
  }
}

/**
 * Fetches a bundle once per identity (sha256), never per poll. The bundle is disposed only when
 * its identity changes or on unmount, and state never exposes one that is already disposed.
 */
function useBundle(descriptor: Preview["bundle"], enabled: boolean) {
  const key = bundleKey(descriptor);
  const latest = useRef(descriptor);
  latest.current = descriptor;
  const [entry, setEntry] = useState<{ key: string; bundle: Bundle } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let loaded: Bundle | undefined;
    fetchSpineBundle(latest.current, controller.signal).then(
      (value) => {
        if (controller.signal.aborted) value.dispose();
        else {
          loaded = value;
          setEntry({ key, bundle: value });
        }
      },
      () => {
        if (!controller.signal.aborted) setFailedKey(key);
      },
    );
    return () => {
      controller.abort();
      setEntry(null);
      loaded?.dispose();
    };
  }, [enabled, key]);
  return { bundle: entry?.key === key ? entry.bundle : null, failed: failedKey === key };
}

/** Loads the bundle only once the row is on screen; any failure leaves the thumbnail blank. */
function Thumbnail({ preview }: { preview: Preview }) {
  const holder = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const element = holder.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const { bundle } = useBundle(preview.bundle, visible);
  const adjustment = useRef(preview.adjustment);
  adjustment.current = preview.adjustment;
  const adjustmentId = adjustmentKey(preview.adjustment);
  // biome-ignore lint/correctness/useExhaustiveDependencies: adjustmentId stands for the adjustment's content
  useEffect(() => {
    if (!bundle) return;
    try {
      setUrl(drawStill(bundle, adjustment.current));
    } catch {
      // A thumbnail that cannot be drawn stays blank.
    }
  }, [bundle, adjustmentId]);
  return (
    <span className="spine-thumb" ref={holder} aria-hidden="true">
      {url && <img src={url} alt="" />}
    </span>
  );
}

/** The bundle is fetched once; every slider move only redraws from it. */
function PreviewImage({
  descriptor,
  adjustment,
}: {
  descriptor: Preview["bundle"];
  adjustment: SpineAdjustment;
}) {
  const { bundle, failed } = useBundle(descriptor, true);
  const [drawFailed, setDrawFailed] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!bundle) return;
    try {
      setUrl(drawStill(bundle, adjustment));
      setDrawFailed(false);
    } catch {
      setDrawFailed(true);
    }
  }, [bundle, adjustment]);
  return (
    <div className="spine-preview">
      {url ? <img src={url} alt="キャラクターのプレビュー" /> : null}
      {(failed || drawFailed) && <p className="muted">プレビューを表示できません。</p>}
    </div>
  );
}

function Adjuster({
  preview,
  disabled,
  save,
  reset,
}: {
  preview: Preview;
  disabled: boolean;
  save: (adjustment: SpineAdjustment) => void;
  reset: () => void;
}) {
  const [parts, setParts] = useState<SpineAdjustment["parts"]>(preview.adjustment?.parts ?? {});
  const adjustment = useMemo<SpineAdjustment>(() => {
    const changed: SpineAdjustment["parts"] = {};
    for (const part of SPINE_PARTS) {
      const value = parts[part];
      if (value && (value.dx !== 0 || value.dy !== 0 || value.scale !== 1)) changed[part] = value;
    }
    return { version: 1, parts: changed };
  }, [parts]);
  function change(part: SpinePart, axis: (typeof AXES)[number], raw: number) {
    const value = Math.min(axis.max, Math.max(axis.min, Number.isFinite(raw) ? raw : 0));
    setParts((current) => ({
      ...current,
      [part]: { ...NEUTRAL, ...current[part], [axis.key]: value },
    }));
  }
  return (
    <>
      <PreviewImage descriptor={preview.bundle} adjustment={adjustment} />
      {SPINE_PARTS.map((part) => (
        <fieldset className="spine-part" key={part}>
          <legend>{PART_LABELS[part]}</legend>
          {AXES.map((axis) => (
            <label className="spine-slider" key={axis.key}>
              <span>{axis.label}</span>
              <input
                type="range"
                min={axis.min}
                max={axis.max}
                step={axis.step}
                value={parts[part]?.[axis.key] ?? NEUTRAL[axis.key]}
                onChange={(event) => change(part, axis, event.currentTarget.valueAsNumber)}
              />
            </label>
          ))}
        </fieldset>
      ))}
      <div className="admin-actions">
        <button type="button" disabled={disabled} onClick={() => save(adjustment)}>
          保存
        </button>
        <button type="button" className="secondary" disabled={disabled} onClick={reset}>
          元に戻す
        </button>
      </div>
    </>
  );
}

function Detail({
  task,
  disabled,
  send,
}: {
  task: SpineAdminTask;
  disabled: boolean;
  send: (action: SpineAdminAction) => void;
}) {
  const [confirm, setConfirm] = useState<"cancel" | "requeue" | "preset" | null>(null);
  const [presetId, setPresetId] = useState<DevicePresetId | null>(null);
  const needsHelp = task.needsAttention || describeState(task.state).tone === "alert";
  const preview = task.state === "PUBLISHED" ? task.preview : null;
  return (
    <div className="spine-detail">
      {needsHelp && (
        <>
          <div className="admin-actions">
            <button
              type="button"
              className="secondary"
              disabled={disabled}
              onClick={() => setConfirm("cancel")}
            >
              取り消す
            </button>
            <button type="button" disabled={disabled} onClick={() => setConfirm("requeue")}>
              作り直す
            </button>
            <button type="button" disabled={disabled} onClick={() => setConfirm("preset")}>
              見本キャラクターに変更
            </button>
          </div>
          {confirm === "cancel" && (
            <fieldset className="admin-confirm" aria-label="取り消しの確認">
              <p>このタスクを取り消します。参加者の写真の消去も始まり、元に戻せません</p>
              <div className="admin-actions">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setConfirm(null);
                    send({ action: "cancel", task: task.task });
                  }}
                >
                  取り消しを確定
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={disabled}
                  onClick={() => setConfirm(null)}
                >
                  やめる
                </button>
              </div>
            </fieldset>
          )}
          {confirm === "requeue" && (
            <fieldset className="admin-confirm" aria-label="作り直しの確認">
              <p>外部のAIサービスを再び使用し、費用がかかります</p>
              <div className="admin-actions">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setConfirm(null);
                    send({ action: "requeue", task: task.task, confirmCost: true });
                  }}
                >
                  費用を了承して作り直す
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={disabled}
                  onClick={() => setConfirm(null)}
                >
                  やめる
                </button>
              </div>
            </fieldset>
          )}
          {confirm === "preset" && (
            <fieldset className="admin-confirm" aria-label="見本キャラクターの選択">
              <p>この参加者のキャラクターを、用意された見本に置き換えます。</p>
              <div className="spine-presets">
                {PRESET_CHARACTERS.map((preset) => (
                  <label key={preset.id}>
                    <input
                      type="radio"
                      name={`preset-${task.task}`}
                      checked={presetId === preset.id}
                      onChange={() => setPresetId(preset.id)}
                    />
                    {preset.name}
                  </label>
                ))}
              </div>
              <div className="admin-actions">
                <button
                  type="button"
                  disabled={disabled || presetId === null}
                  onClick={() => {
                    if (presetId === null) return;
                    setConfirm(null);
                    send({ action: "preset", task: task.task, presetId });
                  }}
                >
                  この見本に変更する
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={disabled}
                  onClick={() => {
                    setConfirm(null);
                    setPresetId(null);
                  }}
                >
                  やめる
                </button>
              </div>
            </fieldset>
          )}
        </>
      )}
      {preview && (
        <Adjuster
          key={JSON.stringify(preview.adjustment)}
          preview={preview}
          disabled={disabled}
          save={(adjustment) => send({ action: "adjust", task: task.task, adjustment })}
          reset={() => send({ action: "resetAdjust", task: task.task })}
        />
      )}
      {!needsHelp && !preview && <p className="muted">操作が必要な状態ではありません。</p>}
    </div>
  );
}

export default function SpinePanel({ busy }: { busy: boolean }) {
  const api = useMemo(() => createDeviceClient(), []);
  const [view, setView] = useState<SpineAdminView | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [stale, setStale] = useState(false);
  const [now, setNow] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    const client = createDeviceClient({ signal: controller.signal });
    let loadedOnce = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Each request starts only after the previous one has settled, so polls never overlap.
    async function tick() {
      try {
        const next = await client.spineAdmin();
        if (!controller.signal.aborted) {
          setView(next);
          setNow(Date.now());
          setConnected(true);
          setStale(false);
          loadedOnce = true;
        }
      } catch (failure) {
        if (controller.signal.aborted) return;
        // Only a never-loaded block or a disabled API is 未接続; loaded data stays, marked stale.
        if (
          !loadedOnce ||
          (failure instanceof DevelopmentApiError && failure.code === "VISITORS_DISABLED")
        ) {
          setView(null);
          setConnected(false);
          loadedOnce = false;
        } else setStale(true);
      }
      if (!controller.signal.aborted) timer = setTimeout(() => void tick(), POLL_MS);
    }
    void tick();
    return () => {
      alive.current = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  const send = useCallback(
    async (action: SpineAdminAction) => {
      setPending(true);
      setError("");
      setNotice("");
      try {
        const next = await api.spineAdminAction(action);
        if (!alive.current) return;
        setView(next);
        setNow(Date.now());
        setNotice(`${ACTION_LABELS[action.action]}を受け付けました。`);
      } catch (failure) {
        if (alive.current) setError(describeFailure(failure));
      } finally {
        if (alive.current) setPending(false);
      }
    },
    [api],
  );

  const disabled = busy || pending;
  return (
    <section className="flow-panel">
      <h2>写真生成</h2>
      {connected === null && <p role="status">読み込み中です。</p>}
      {connected === false && <p role="status">未接続</p>}
      {error && (
        <p className="flow-error" role="alert">
          {error}
        </p>
      )}
      {connected && view && (
        <>
          {stale && (
            <p className="flow-error" role="status">
              最新の状態を取得できません。再試行しています
            </p>
          )}
          <div
            className={`spine-worker ${view.worker.online ? "spine-ok" : "spine-alert"}`}
            role="status"
          >
            <strong>
              {view.worker.online
                ? "Worker 稼働中"
                : view.worker.lastSeenAt
                  ? `Worker 停止？ 最終確認 ${clock(view.worker.lastSeenAt)}`
                  : "Worker 停止？ 最終確認なし"}
            </strong>
            <span>
              順番待ち {view.queued}人・作成中 {view.running}人
            </span>
          </div>
          {notice && (
            <p className="admin-notice" role="status">
              {notice}
            </p>
          )}
          {view.tasks.length === 0 ? (
            <p className="muted">いま表示するタスクはありません。</p>
          ) : (
            <ul className="spine-list">
              {view.tasks.map((task) => {
                const state = describeState(task.state);
                const expanded = open === task.task;
                return (
                  <li key={task.task}>
                    <button
                      type="button"
                      className="secondary spine-row"
                      aria-expanded={expanded}
                      onClick={() => setOpen(expanded ? null : task.task)}
                    >
                      {task.preview ? <Thumbnail preview={task.preview} /> : null}
                      <code>{task.code}</code>
                      <span className={`spine-state spine-${state.tone}`}>{state.label}</span>
                      <span className="muted">{formatSince(task.stateSince, now)}</span>
                    </button>
                    {expanded && (
                      <Detail task={task} disabled={disabled} send={(a) => void send(a)} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {view.truncated && (
            <p className="muted">一覧は200件までです。それ以降は表示されません。</p>
          )}
          {view.repairs.length > 0 && (
            <>
              <h3>最近の修復記録</h3>
              <ul className="spine-repairs">
                {view.repairs.map((entry, index) => {
                  const id = `${entry.at}-${entry.action}-${entry.code}`;
                  const repeat = view.repairs
                    .slice(0, index)
                    .filter((e) => `${e.at}-${e.action}-${e.code}` === id).length;
                  return (
                    <li key={`${id}-${repeat}`}>
                      {clock(entry.at)}　{ACTION_LABELS[entry.action]}　<code>{entry.code}</code>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
