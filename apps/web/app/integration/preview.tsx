"use client";

import type { CityEvent } from "@ai-city/contracts";
import type { CitySnapshot } from "@ai-city/contracts/development";
import {
  createDevelopmentClient,
  DevelopmentApiError,
} from "@ai-city/contracts/development-client";
import { useEffect, useState } from "react";

const client = createDevelopmentClient();
const eventNames = {
  RESIDENT_JOINED: "参加",
  RESIDENT_UPDATED: "更新",
  RESIDENT_HIDDEN: "非表示",
  RESIDENT_REMOVED: "削除",
};

export function CityIntegrationPreview() {
  const [snapshot, setSnapshot] = useState<CitySnapshot | null>(null);
  const [events, setEvents] = useState<CityEvent[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let cursor: { streamId: string; eventSeq: number } | null = null;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        let recent: CityEvent[] = [];
        if (cursor) {
          const page = await client.events(cursor.streamId, cursor.eventSeq);
          recent = page.events;
          cursor = { streamId: page.streamId, eventSeq: page.latestSeq };
        }
        const current = await client.snapshot();
        if (!cursor || cursor.streamId !== current.streamId) {
          cursor = { streamId: current.streamId, eventSeq: current.eventSeq };
          recent = [];
          if (active) setEvents([]);
        }
        if (active) {
          setSnapshot(current);
          setError("");
          if (recent.length) setEvents((previous) => [...previous, ...recent].slice(-10));
        }
      } catch (failure) {
        cursor = null;
        if (active) {
          setSnapshot(null);
          setEvents([]);
          setError(
            failure instanceof DevelopmentApiError
              ? failure.message
              : "街の情報を取得できません。接続を確認しています。",
          );
        }
      } finally {
        if (active) timer = setTimeout(() => void refresh(), 1000);
      }
    }
    void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  return (
    <section className="flow">
      {error && (
        <p role="alert" className="flow-error">
          {error}
        </p>
      )}
      <div className="flow-panel">
        <h2>現在の住民</h2>
        {!snapshot ? (
          <p role="status">街の情報を確認しています。</p>
        ) : (
          <>
            <p className="muted">
              現在 {snapshot.residents.length} 人・イベント番号 {snapshot.eventSeq}
            </p>
            {snapshot.residents.length === 0 ? (
              <p>まだ参加者はいません。参加サンプルで確認してから追加してください。</p>
            ) : (
              <div className="resident-list">
                {snapshot.residents.map((resident) => (
                  <article key={resident.residentId}>
                    <h3>{resident.nickname}</h3>
                    <p>性格：{resident.personalityLabel}</p>
                    <p>興味：{resident.interests.join("・") || "非公開・指定なし"}</p>
                    <p className="muted">画像素材は未接続です。</p>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <div className="flow-panel">
        <h2>最近のイベント</h2>
        <p className="muted">
          接続後の参加・削除を表示します。ページを開き直した際は、現在の一覧から再開します。
        </p>
        {events.length ? (
          <ol className="event-list">
            {events.map((event) => (
              <li key={event.id}>
                番号 {event.eventSeq}：{eventNames[event.type]}（更新 {event.version}）
              </li>
            ))}
          </ol>
        ) : (
          <p>新しいイベントを待っています。</p>
        )}
      </div>
    </section>
  );
}
