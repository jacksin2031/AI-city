"use client";

import { useEffect, useState } from "react";
import type { ChatWorkerStatus as Status } from "../../lib/link/chat-worker-health";

const POLL_MS = 15_000;

function clock(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function label(status: Status | null) {
  if (!status) return "DialogueWorker：確認中";
  if (!status.configured) return "DialogueWorker：監視先未設定";
  if (!status.online)
    return status.lastSeenAt
      ? "DialogueWorker：停止・未接続"
      : "DialogueWorker：未接続（起動報告なし）";
  if (status.phase === "GENERATING") return "DialogueWorker：生成中";
  if (status.phase === "ERROR") return "DialogueWorker：エラー発生（接続中）";
  return "DialogueWorker：稼働中（待機中）";
}

/** A read-only admin poll; never launches a Worker or model call. */
export default function ChatWorkerStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    // A new counter value explicitly restarts polling when the administrator presses refresh.
    if (refresh < 0) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      if (controller.signal.aborted) return;
      setChecking(true);
      try {
        const response = await fetch("/api/link/chat-worker", {
          credentials: "same-origin",
          cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
        });
        if (!response.ok) throw new Error("ChatWorker status unavailable");
        const data: Status = await response.json();
        if (!controller.signal.aborted) {
          setStatus(data);
          setError(false);
        }
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) {
          setChecking(false);
          timer = setTimeout(() => void poll(), POLL_MS);
        }
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [refresh]);

  return (
    <div className="chat-worker-panel">
      <h3>DialogueWorker（AI会話）の稼働状況</h3>
      <div
        className={`spine-worker ${status?.online && !error ? "spine-ok" : "spine-alert"}`}
        role="status"
        aria-live="polite"
      >
        <strong data-testid="chat-worker-status">
          {error ? "DialogueWorker：状態を確認できません" : label(status)}
        </strong>
        {status?.lastSeenAt && <span>最終応答：{clock(status.lastSeenAt)}</span>}
        {status?.lastGeneratedAt && <span>最終会話生成：{clock(status.lastGeneratedAt)}</span>}
      </div>
      <button
        type="button"
        className="secondary"
        disabled={checking}
        onClick={() => setRefresh((value) => value + 1)}
      >
        DialogueWorker の状態を確認
      </button>
      <p className="muted">
        約15秒ごとに状態を確認します。DialogueWorker
        は30秒ごとに生存確認を送信し、約2分間届かなければ未接続と判定します。 AI会話のオン／オフと
        Worker の接続状態は別です。定型会話は Worker が停止していても利用できます。 Worker
        の起動には PC 側で --chat
        オプションが必要です（モデル利用料金に注意）。監視対象：scripts/dialogue-worker.ts。
      </p>
      {!status?.configured && !checking && !error && (
        <p className="muted">
          永続参加者ストレージが無効なため、クラウド上の稼働状況を確認できません。
        </p>
      )}
    </div>
  );
}
