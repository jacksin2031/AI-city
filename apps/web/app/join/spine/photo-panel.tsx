"use client";

import {
  SpineCreatedResponseSchema,
  SpineCurrentResponseSchema,
  type SpineTaskView,
  SpineWithdrawalResponseSchema,
} from "@ai-city/contracts/spine";
import Link from "next/link";
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { photoPreparationMessage, prepareUploadPhoto } from "../prepare-photo";

const labels: Record<SpineTaskView["state"], string> = {
  QUEUED: "準備待ちです。",
  RUNNING: "準備中です。",
  PREPARED: "工具の準備ができました。自動制作はまだ有効になっていません。",
  UNKNOWN: "処理結果を確認できません。再送せず管理者にお知らせください。",
  REQUIRES_REVIEW: "候補は確認待ちです。まだ街には公開されていません。",
  FAILED: "制作を完了できませんでした。",
  PUBLISHED: "キャラクターを街に表示しています。",
  WITHDRAWN: "公開を取り消しました。",
};

class RequestFailure extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function request(path: string, init?: RequestInit) {
  const response = await fetch(`/api/visitor/${path}`, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok)
    throw new RequestFailure(
      response.status,
      body?.error?.message ?? "操作できませんでした。しばらくしてからお試しください。",
    );
  return body;
}

export function SpinePhotoPanel({
  codeFree,
  cloud = false,
}: {
  codeFree: boolean;
  cloud?: boolean;
}) {
  const [session, setSession] = useState<"checking" | "required" | "ready" | "unavailable">(
    "checking",
  );
  const [invitation, setInvitation] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreparing, setPhotoPreparing] = useState(false);
  const photoSelection = useRef(0);
  const [processing, setProcessing] = useState(false);
  const [upload, setUpload] = useState(false);
  const [publication, setPublication] = useState(false);
  const [job, setJob] = useState<SpineTaskView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const result = SpineCurrentResponseSchema.parse(await request("spine/jobs/current"));
      setJob(result.job);
      setSession("ready");
    } catch (failure) {
      if (failure instanceof RequestFailure && failure.status === 401) setSession("required");
      else {
        setSession("unavailable");
        setError("参加情報を確認できませんでした。接続を確認してください。");
      }
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!job || !["QUEUED", "RUNNING"].includes(job.state)) return;
    const timer = setInterval(() => {
      void refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [job, refresh]);

  async function startSession() {
    setBusy(true);
    setError("");
    try {
      await request("session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(codeFree ? {} : { invitation: invitation.trim() }),
      });
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "参加を開始できませんでした。");
    } finally {
      setBusy(false);
    }
  }
  useEffect(
    () => () => {
      photoSelection.current++;
    },
    [],
  );

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const original = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!original) return;
    const selection = ++photoSelection.current;
    setPhoto(null);
    setError("");
    setPhotoPreparing(true);
    try {
      const prepared = await prepareUploadPhoto(original);
      if (photoSelection.current === selection) setPhoto(prepared);
    } catch (failure) {
      if (photoSelection.current === selection) setError(photoPreparationMessage(failure));
    } finally {
      if (photoSelection.current === selection) setPhotoPreparing(false);
    }
  }
  async function submit() {
    if (!photo || !processing || !upload || !publication) return;
    setBusy(true);
    setError("");
    try {
      const result = SpineCreatedResponseSchema.parse(
        await request("spine/jobs", {
          method: "POST",
          headers: {
            "Content-Type": photo.type,
            "x-spine-processing-consent": "1",
            "x-spine-model-upload-consent": "1",
            "x-spine-publication-consent": "1",
          },
          body: photo,
        }),
      );
      setJob({ task: result.task, state: result.state });
      setPhoto(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "写真を送信できませんでした。");
    } finally {
      setBusy(false);
    }
  }
  async function withdraw() {
    if (!job) return;
    setBusy(true);
    setError("");
    try {
      const result = SpineWithdrawalResponseSchema.parse(
        await request(`spine/jobs/${encodeURIComponent(job.task)}/withdraw`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }),
      );
      setJob({ ...job, state: "WITHDRAWN", photoCleanup: result.photoCleanup });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "取り消せませんでした。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="participation flow">
      <h1>写真からキャラクターを作る</h1>
      <p className="notice">
        {cloud
          ? "試験運用中です。写真は非公開のクラウドストレージに一時保存され、運営者の端末で処理されます。キャラクターの完成後、元の写真は削除されます。制作には時間がかかり、うまく作れない場合があります。"
          : "本機限定のテストです。現在は写真の受付と工具の準備まで対応しており、自動制作・街への公開はまだ動作しません。"}
      </p>
      <p>
        写真をもとに髪型や服装をデザインします。制作を有効にした場合、写真は外部の AI
        サービスに送信されます。完成したキャラクターは展示画面に公開されます。
      </p>
      <p>
        参加情報は最大24時間です。公開の取り消しを求めることができます。処理中や外部サービスに送信済みのデータは、取り消し直後に消去できない場合があります。
      </p>
      {error && <p role="alert">{error}</p>}
      {session === "checking" && <p role="status">参加情報を確認しています。</p>}
      {session === "unavailable" && (
        <button
          type="button"
          onClick={() => {
            setError("");
            setSession("checking");
            void refresh();
          }}
        >
          再確認
        </button>
      )}
      {session === "required" && (
        <section className="flow-panel">
          {!codeFree && (
            <label className="field">
              参加用コード{" "}
              <input
                value={invitation}
                onChange={(event) => setInvitation(event.target.value)}
                autoComplete="off"
              />
            </label>
          )}
          <button
            type="button"
            disabled={busy || (!codeFree && !invitation.trim())}
            onClick={() => void startSession()}
          >
            参加を開始
          </button>
        </section>
      )}
      {session === "ready" &&
        (!job || (job.state === "WITHDRAWN" && job.photoCleanup === "COMPLETE")) && (
          <section className="flow-panel">
            <label className="field">
              アルバムから写真を選ぶ
              <input
                type="file"
                accept="image/*"
                disabled={busy || photoPreparing}
                onChange={(event) => void choosePhoto(event)}
              />
            </label>
            <label className="field">
              カメラで写真を撮る
              <input
                type="file"
                accept="image/*"
                capture="user"
                disabled={busy || photoPreparing}
                onChange={(event) => void choosePhoto(event)}
              />
            </label>
            {photoPreparing && <p role="status">写真を送信用に調整しています…</p>}
            {photo && <p role="status">送信する写真を準備しました。</p>}
            <label className="check">
              <input
                type="checkbox"
                checked={processing}
                onChange={(event) => setProcessing(event.target.checked)}
              />
              写真をキャラクター制作に使用することに同意します。
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={upload}
                onChange={(event) => setUpload(event.target.checked)}
              />
              写真を外部 AI サービスに送信することに同意します。
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={publication}
                onChange={(event) => setPublication(event.target.checked)}
              />
              完成したキャラクターを自動的に街に公開することに同意します。
            </label>
            <button
              type="button"
              disabled={
                busy ||
                photoPreparing ||
                !photo ||
                photo.size > 8 * 1024 * 1024 ||
                !processing ||
                !upload ||
                !publication
              }
              onClick={() => void submit()}
            >
              写真を送信
            </button>
          </section>
        )}
      {job && (
        <section className="flow-panel" aria-live="polite">
          <h2>制作状況</h2>
          <p>{labels[job.state]}</p>
          {job.state === "WITHDRAWN" && (
            <p>
              {job.photoCleanup === "PENDING"
                ? "関連ファイルの消去は確認待ちです。"
                : cloud
                  ? "保存した写真と関連ファイルの消去を確認しました。"
                  : "本機に保存した写真の消去を確認しました。"}
            </p>
          )}
          {job.state !== "WITHDRAWN" && (
            <button type="button" disabled={busy} onClick={() => void withdraw()}>
              公開を取り消し、写真の消去を依頼
            </button>
          )}
          {job.state === "WITHDRAWN" && job.photoCleanup === "PENDING" && (
            <button type="button" disabled={busy} onClick={() => void withdraw()}>
              消去を再確認
            </button>
          )}
        </section>
      )}
      <p>
        <Link href="/join">参加ページへ戻る</Link>
      </p>
    </main>
  );
}
