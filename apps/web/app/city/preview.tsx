"use client";

import {
  type CityAction,
  type CityRoster,
  createDevelopmentCity,
  type Direction,
  getDevelopmentResidents,
  type IllustratedCity,
  LANDMARKS,
  type Landmark,
  reconcileRoster,
} from "@ai-city/city";
import { characterDataUrl } from "@ai-city/city/illustrations";
import { createDevelopmentClient } from "@ai-city/contracts/development-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { LandmarkCard } from "../landmark-card";

const actions: Record<CityAction, string> = {
  idle: "休む",
  walk: "歩く",
  turn: "向きを変える",
  talk: "話す",
  wave: "手を振る",
  sit: "ベンチに座る",
  visit: "お店に入る",
};
const directions: [Direction, string][] = [
  ["front", "正面"],
  ["left", "左"],
  ["back", "後ろ"],
  ["right", "右"],
];

export function CityPreview({ mode }: { mode: "sample" | "participants" }) {
  const parent = useRef<HTMLDivElement>(null);
  const controller = useRef<IllustratedCity | null>(null);
  const roster = useRef<CityRoster | null>(null);
  const residentsRef = useRef(mode === "sample" ? getDevelopmentResidents() : []);
  const selectedRef = useRef<string | null>(null);
  const [residents, setResidents] = useState(residentsRef.current);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [landmark, setLandmark] = useState<Landmark | null>(null);
  const [currentActions, setCurrentActions] = useState<Record<string, CityAction>>({});
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState("");
  const [motion, setMotion] = useState(false);
  const selected = residents.find((resident) => resident.residentId === selectedId);
  const action = selectedId ? (currentActions[selectedId] ?? "idle") : "idle";

  const select = useCallback((id: string | null) => {
    if (id) {
      setLandmark(null);
      controller.current?.selectLandmark(null);
    }
    selectedRef.current = id;
    setSelectedId(id);
    controller.current?.select(id);
  }, []);

  useEffect(() => {
    if (!parent.current) return;
    let disposed = false;
    const abort = new AbortController();
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const enabled = !media.matches;
    setMotion(enabled);
    const onMediaChange = () => {
      setMotion(!media.matches);
      controller.current?.setMotionEnabled(!media.matches);
    };
    media.addEventListener("change", onMediaChange);
    createDevelopmentCity(parent.current, {
      residents: residentsRef.current,
      motionEnabled: enabled,
      signal: abort.signal,
      onSelect: (id) => {
        if (!disposed) select(id);
      },
      onSelectLandmark: (item) => {
        if (disposed) return;
        if (item) select(null);
        setLandmark(item);
      },
      onAction: (id, next) => {
        if (!disposed) setCurrentActions((previous) => ({ ...previous, [id]: next }));
      },
      onReady: () => {
        if (!disposed) setReady(true);
      },
    })
      .then((city) => {
        if (disposed) city.destroy();
        else {
          controller.current = city;
          city.setResidents(residentsRef.current);
          city.select(selectedRef.current);
        }
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      abort.abort();
      media.removeEventListener("change", onMediaChange);
      controller.current?.destroy();
      controller.current = null;
    };
  }, [select]);

  useEffect(() => {
    if (mode !== "participants") return;
    let active = true;
    const lifetime = new AbortController();
    let requestSignal = lifetime.signal;
    const client = createDevelopmentClient({
      fetch: (input, init) => fetch(input, { ...init, signal: requestSignal }),
    });
    let cursor: { streamId: string; eventSeq: number } | null = null;
    let timer: ReturnType<typeof setTimeout>;
    function apply(next: CityRoster | null) {
      roster.current = next;
      const visible = next?.residents.slice(0, 20) ?? [];
      residentsRef.current = visible;
      setResidents(visible);
      controller.current?.setResidents(visible, next?.addedIds);
      if (!visible.some((resident) => resident.residentId === selectedRef.current)) select(null);
      setCurrentActions((previous) =>
        Object.fromEntries(
          visible.map((resident) => [resident.residentId, previous[resident.residentId] ?? "idle"]),
        ),
      );
    }
    async function refresh() {
      // One deadline for events + snapshot, including response bodies.
      requestSignal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(4000)]);
      try {
        if (cursor) await client.events(cursor.streamId, cursor.eventSeq);
        const snapshot = await client.snapshot();
        if (!active) return;
        const next = reconcileRoster(roster.current, snapshot);
        cursor = { streamId: next.streamId, eventSeq: next.eventSeq };
        apply(next);
        setError("");
      } catch {
        cursor = null;
        if (active) {
          apply(null);
          setError("街に接続できません。表示を止めて再接続しています。");
        }
      } finally {
        if (active) timer = setTimeout(() => void refresh(), 1000);
      }
    }
    void refresh();
    return () => {
      active = false;
      lifetime.abort();
      clearTimeout(timer);
    };
  }, [mode, select]);

  return (
    <div className="illustrated-layout">
      <div className="city-stage">
        <div className="city-toolbar">
          <span>
            {mode === "sample"
              ? `架空の住民 ${residents.length}人`
              : `公開中の住民 ${residents.length}人（最大20人）`}
          </span>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setMotion(!motion);
              controller.current?.setMotionEnabled(!motion);
            }}
          >
            {motion ? "動きを止める" : "動きを再開"}
          </button>
        </div>
        <section
          className="city"
          ref={parent}
          aria-label="簡易イラストの街。住民や建物を選んで紹介を表示できます。"
        />
        {failed && <p role="alert">表示を開始できませんでした。ページを再読み込みしてください。</p>}
        {error && (
          <p role="alert" className="flow-error">
            {error}
          </p>
        )}
        {!residents.length && !error && (
          <p role="status">まだ参加者はいません。参加画面で確認してから追加してください。</p>
        )}
        <p className="muted">街の住民や建物を選んでみてください。会話は用意された例文です。</p>
        <details className="landmark-list">
          <summary>建物・駅を選ぶ</summary>
          <div>
            {LANDMARKS.map((item) => (
              <button
                type="button"
                key={item.key}
                disabled={!ready || failed}
                onClick={() => {
                  select(null);
                  setLandmark(item);
                  controller.current?.selectLandmark(item.id);
                }}
              >
                {item.name}
              </button>
            ))}
          </div>
        </details>
        <section className="city-roster" aria-label="住民一覧">
          {residents.map((resident) => (
            <button
              type="button"
              className="resident-chip"
              key={resident.residentId}
              aria-label={`${resident.nickname}のプロフィール`}
              aria-pressed={selectedId === resident.residentId}
              onClick={() => select(resident.residentId)}
            >
              {/* biome-ignore lint/performance/noImgElement: local SVG data URL; next/image adds inline styles blocked by our nonce CSP. */}
              <img src={characterDataUrl(resident.avatarVersion)} alt="" width="40" height="54" />
              <span>{resident.nickname}</span>
            </button>
          ))}
        </section>
      </div>
      <aside className="city-profile" aria-label="街の紹介">
        {landmark ? (
          <LandmarkCard
            key={landmark.key}
            landmark={landmark}
            close={() => {
              setLandmark(null);
              controller.current?.selectLandmark(null);
            }}
          />
        ) : selected ? (
          <>
            <span className="city-eyebrow">
              {mode === "sample" ? "架空の住民・イラスト見本" : "公開に同意した項目"}
            </span>
            {/* biome-ignore lint/performance/noImgElement: local SVG data URL; no optimization request or inline style needed. */}
            <img
              className="profile-portrait"
              src={characterDataUrl(selected.avatarVersion)}
              alt={`${selected.nickname}の簡易イラスト`}
              width="96"
              height="128"
            />
            <h2>{selected.nickname}</h2>
            <p>性格：{selected.personalityLabel}</p>
            <p>興味：{selected.interests.join("・") || "非公開・指定なし"}</p>
            <div className="direction-previews">
              {directions.map(([direction, name]) => (
                <figure key={direction}>
                  {/* biome-ignore lint/performance/noImgElement: local SVG data URL; preserve nonce CSP compatibility. */}
                  <img
                    src={characterDataUrl(selected.avatarVersion, direction)}
                    alt={`${name}の見本`}
                    width="48"
                    height="64"
                  />
                  <figcaption>{name}</figcaption>
                </figure>
              ))}
            </div>
            <p className="muted">動作を試す</p>
            <div className="city-actions">
              {Object.entries(actions).map(([key, label]) => (
                <button
                  type="button"
                  className="secondary"
                  key={key}
                  disabled={!ready || failed}
                  onClick={() => controller.current?.act(selected.residentId, key as CityAction)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p role="status">現在の動作：{actions[action]}</p>
            {action === "talk" && (
              <p className="preset-dialogue">こんにちは。広場でひと休みしよう！</p>
            )}
            <p className="muted">
              写真からの生成ではありません。正式な素材に置き換えるための仮イラストです。
            </p>
          </>
        ) : (
          <>
            <span className="city-eyebrow">ひと休みできる、小さな街</span>
            <h2>住民を選んでみよう</h2>
            <p>プロフィールと、歩く・向きを変える・話す・手を振る動きを確認できます。</p>
            <p className="muted">
              表示するのは公開項目だけです。写真や質問の回答は街に届きません。
            </p>
          </>
        )}
      </aside>
    </div>
  );
}
