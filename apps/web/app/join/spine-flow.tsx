"use client";

import { aiStyleLabels } from "@ai-city/contracts/development";
import {
  createDevelopmentClient,
  DevelopmentApiError,
} from "@ai-city/contracts/development-client";
import {
  PhotoUploadPublicSettingsSchema,
  SpineCreatedResponseSchema,
  SpineCurrentResponseSchema,
  type SpineTaskView,
  SpineWithdrawalResponseSchema,
} from "@ai-city/contracts/spine";
import Link from "next/link";
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CityScene } from "./city-scene";
import { LocalPhoto } from "./local-photo";
import { ParticipantCard } from "./participant-card";
import { PhotoUploadPaused } from "./photo-upload-paused";
import { photoPreparationMessage, prepareUploadPhoto } from "./prepare-photo";
import { computeStyle, questions } from "./questions";
import { attentionMessages, estimateProgress } from "./spine-progress";
import { traitValues } from "./trait-values";
import { useReliableFocus } from "./use-reliable-focus";
import { useSpinePortrait } from "./use-spine-portrait";
import "./participant.css";

/** Shown until the finished figure is drawn; the card keeps its layout either way. */
const TRANSPARENT_PORTRAIT =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="128" viewBox="0 0 96 128"></svg>',
  );

type Stage = "name" | "upload" | "questions" | "progress" | "done" | "closed";
const MAX_PHOTO = 8 * 1024 * 1024;

const UPLOAD_POLL_MS = 10_000;

class RequestFailure extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
/** Public, session-less read. Anything unreadable counts as "not allowed" (fail closed). */
async function readUploadAllowed(): Promise<boolean> {
  try {
    const response = await fetch("/api/visitor/photo-upload-settings", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) return false;
    return PhotoUploadPublicSettingsSchema.parse(await response.json()).allowed;
  } catch {
    return false;
  }
}
async function request(path: string, init?: RequestInit) {
  const response = await fetch(`/api/visitor/${path}`, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new RequestFailure(
      response.status,
      body?.error?.message ?? "操作できませんでした。しばらくしてからお試しください。",
      body?.error?.code,
    );
  return body;
}

/**
 * Participant flow for hosted photo intake: name, photo upload, questions, then a progress view
 * while the character is made. The photo is sent as soon as it is confirmed, so generation runs
 * while the participant answers the questions.
 */
export function SpineParticipantFlow({
  initialUploadAllowed = true,
}: {
  /** Server-read state at page load; polling and the backend keep it current afterwards. */
  initialUploadAllowed?: boolean;
}) {
  const [uploadAllowed, setUploadAllowed] = useState(initialUploadAllowed);
  const client = useMemo(() => createDevelopmentClient({ apiPath: "/api/visitor" }), []);
  const focusRequest = useReliableFocus(client);
  const [stage, setStage] = useState<Stage>("name");
  const [initializing, setInitializing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [nickname, setNickname] = useState("");
  const [answers, setAnswers] = useState<(number | null)[]>(Array(6).fill(null));
  const [question, setQuestion] = useState(0);
  const [questionsDone, setQuestionsDone] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [upload, setUpload] = useState(false);
  const [publication, setPublication] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [photoPreparing, setPhotoPreparing] = useState(false);
  const photoSelection = useRef(0);
  const [job, setJob] = useState<SpineTaskView | null>(null);
  const [runningSince, setRunningSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const localPhoto = useRef<LocalPhoto | null>(null);
  localPhoto.current ??= new LocalPhoto({
    create: (file) => URL.createObjectURL(file),
    revoke: (url) => URL.revokeObjectURL(url),
  });

  const discardPhoto = useCallback(() => {
    photoSelection.current++;
    localPhoto.current?.clear();
    setPhotoUrl(null);
    setPhotoFile(null);
    setPhotoPreparing(false);
    setPhotoError("");
  }, []);
  useEffect(() => {
    const discard = () => {
      photoSelection.current++;
      localPhoto.current?.clear();
    };
    window.addEventListener("pagehide", discard);
    return () => {
      window.removeEventListener("pagehide", discard);
      discard();
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const result = SpineCurrentResponseSchema.parse(await request("spine/jobs/current"));
      setJob(result.job);
      return result.job;
    } catch (failure) {
      if (!(failure instanceof RequestFailure && failure.status === 401))
        setError("接続を確認できませんでした。ページを読み直してください。");
      return null;
    }
  }, []);

  // Resume after a reload: an existing job goes straight back to its progress view.
  useEffect(() => {
    let live = true;
    void refresh().then((current) => {
      if (!live) return;
      if (current && current.state !== "WITHDRAWN") {
        setQuestionsDone(true);
        setStage(current.state === "PUBLISHED" ? "done" : "progress");
      }
      setInitializing(false);
    });
    return () => {
      live = false;
    };
  }, [refresh]);

  // Until a photo is on its way, follow the administrator's switch while the page stays open.
  const preUpload = stage === "name" || stage === "upload";
  useEffect(() => {
    if (!preUpload) return;
    let live = true;
    const check = async () => {
      const allowed = await readUploadAllowed();
      if (!live) return;
      setUploadAllowed(allowed);
      if (!allowed) {
        // Drop the local photo and the consents: they must be given again after a restart.
        discardPhoto();
        setProcessing(false);
        setUpload(false);
        setPublication(false);
      }
    };
    const timer = setInterval(() => void check(), UPLOAD_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [preUpload, discardPhoto]);
  // Poll while the character is being made; it keeps running if the participant is still answering.
  const state = job?.state;
  useEffect(() => {
    // Keep checking while an operator reviews or requeues a failed attempt.
    if (
      !state ||
      !["QUEUED", "RUNNING", "PREPARED", "REQUIRES_REVIEW", "FAILED", "UNKNOWN"].includes(state)
    )
      return;
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [state, refresh]);
  useEffect(() => {
    if (state === "RUNNING") setRunningSince((previous) => previous ?? Date.now());
    else if (state !== undefined) setRunningSince(null);
  }, [state]);
  useEffect(() => {
    if (stage !== "progress") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [stage]);
  useEffect(() => {
    if (state === "PUBLISHED" && questionsDone && stage === "progress") setStage("done");
  }, [state, questionsDone, stage]);

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const original = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!original || !localPhoto.current) return;
    const selection = ++photoSelection.current;
    localPhoto.current.clear();
    setPhotoUrl(null);
    setPhotoFile(null);
    setPhotoError("");
    setPhotoPreparing(true);
    try {
      // Phone camera formats, including supported HEIC photos, are converted on-device.
      const file = await prepareUploadPhoto(original);
      if (selection !== photoSelection.current) return;
      const result = await localPhoto.current.select(file);
      if (selection !== photoSelection.current) return;
      if (result.status === "ready") {
        setPhotoUrl(result.url);
        setPhotoFile(file);
      } else if (result.status !== "cancelled") {
        setPhotoError("写真を読み取れませんでした。別の写真を選んでください。");
      }
    } catch (failure) {
      if (selection === photoSelection.current) setPhotoError(photoPreparationMessage(failure));
    } finally {
      if (selection === photoSelection.current) setPhotoPreparing(false);
    }
  }

  async function sendPhoto() {
    if (!photoFile || !processing || !upload || !publication || photoFile.size > MAX_PHOTO) return;
    setBusy(true);
    setError("");
    try {
      // Last look before anything leaves the device; the server enforces the same switch.
      if (!uploadAllowed || !(await readUploadAllowed())) {
        setUploadAllowed(false);
        discardPhoto();
        setProcessing(false);
        setUpload(false);
        setPublication(false);
        return;
      }
      await client.createSession();
      const created = SpineCreatedResponseSchema.parse(
        await request("spine/jobs", {
          method: "POST",
          headers: {
            "Content-Type": photoFile.type,
            "x-spine-processing-consent": "1",
            "x-spine-model-upload-consent": "1",
            "x-spine-publication-consent": "1",
          },
          body: photoFile,
        }),
      );
      setJob({ task: created.task, state: created.state });
      discardPhoto();
      setStage("questions");
    } catch (failure) {
      if (failure instanceof RequestFailure && failure.code === "PHOTO_UPLOAD_DISABLED") {
        // Switched off mid-flow: nothing was stored. Show the paused page, not an error.
        setUploadAllowed(false);
        discardPhoto();
        setProcessing(false);
        setUpload(false);
        setPublication(false);
        return;
      }
      setError(
        failure instanceof RequestFailure || failure instanceof DevelopmentApiError
          ? failure.message
          : "写真を送信できませんでした。もう一度お試しください。",
      );
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (!job) return;
    if (!window.confirm("公開を取り消し、送信した写真の消去を依頼しますか？")) return;
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
      setStage("closed");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "取り消せませんでした。");
    } finally {
      setBusy(false);
    }
  }
  /** Withdraw the character, delete the participation and start again from the first page. */
  async function restartAll() {
    if (!job) return;
    if (
      !window.confirm(
        "公開を取り消し、送信した写真の消去を依頼して、最初からやり直しますか？参加情報も削除されます。",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      if (job.state !== "WITHDRAWN")
        SpineWithdrawalResponseSchema.parse(
          await request(`spine/jobs/${encodeURIComponent(job.task)}/withdraw`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          }),
        );
      await client.closeSession();
      try {
        sessionStorage.removeItem("ai-city-nickname");
      } catch {
        // Nothing stored.
      }
      window.location.assign("/join");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "取り消せませんでした。");
      setBusy(false);
    }
  }
  async function leave() {
    setBusy(true);
    setError("");
    try {
      await client.closeSession();
      window.location.assign("/join");
    } catch {
      setError("参加情報を削除できませんでした。もう一度お試しください。");
      setBusy(false);
    }
  }

  const progress = estimateProgress(
    job?.state ?? "QUEUED",
    runningSince ? (now - runningSince) / 1000 : 0,
  );
  const style = computeStyle(answers);
  const answered = answers.some((answer) => answer !== null);
  const styleLabel = aiStyleLabels[style];
  // The finished figure is drawn from the participant's own published bundle.
  const portrait = useSpinePortrait(stage === "done" && job?.state === "PUBLISHED");
  // On the final page the participant's name and style become the public card in the city.
  const profileSent = useRef(false);
  useEffect(() => {
    if (stage !== "done" || job?.state !== "PUBLISHED" || profileSent.current) return;
    profileSent.current = true;
    const choice = answers[5];
    const interest = typeof choice === "number" ? questions[5][1][choice] : undefined;
    void request("spine/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nickname: nickname.trim() || "ゲスト",
        personalityLabel: answered ? styleLabel : null,
        interests: interest ? [interest] : [],
        traits: traitValues(answers, styleLabel),
      }),
    }).catch(() => {
      // The city keeps the anonymous card; a later change on this page sends it again.
      profileSent.current = false;
    });
  }, [stage, job?.state, nickname, answers, answered, styleLabel]);
  const stepLabel = (n: number) => `ステップ ${n} / 4`;

  return (
    <main className="pf-page">
      <div className="pf-scene">
        <CityScene />
        <header className="pf-header">
          <span>試験運用</span>
        </header>
        <div className="pf-intro">
          <p>写真からキャラクターを作る</p>
          <h1>バーチャル御茶ノ水への参加</h1>
          <p>あなたのキャラクターが、展示の街に現れます。</p>
        </div>
      </div>
      <div className="pf-sheet">
        {error && (
          <div role="alert" className="pf-error">
            {error}
          </div>
        )}
        {initializing ? (
          <p role="status">参加情報を確認しています。</p>
        ) : (
          <>
            {preUpload && !uploadAllowed && (
              <PhotoUploadPaused
                onNavigate={() => {
                  // Carry any typed nickname over to the sample flow, without putting it in the URL.
                  try {
                    if (nickname.trim())
                      sessionStorage.setItem("ai-city-nickname", nickname.trim());
                  } catch {
                    // Without storage the sample flow falls back to the character's name.
                  }
                }}
              />
            )}
            {stage === "name" && uploadAllowed && (
              <>
                <p className="pf-step">{stepLabel(1)}</p>
                <h2>ニックネームを教えてください</h2>
                <p>本名でなくても大丈夫です。</p>
                <label className="pf-label" htmlFor="sf-nickname">
                  ニックネーム
                </label>
                <input
                  id="sf-nickname"
                  className="pf-input"
                  value={nickname}
                  maxLength={80}
                  autoComplete="off"
                  onChange={(event) => setNickname(event.target.value)}
                />
                <button
                  className="pf-primary"
                  type="button"
                  disabled={!nickname.trim()}
                  onClick={() => setStage("upload")}
                >
                  次へ
                </button>
              </>
            )}
            {stage === "upload" && uploadAllowed && (
              <>
                <p className="pf-step">{stepLabel(2)}</p>
                <h2>写真をアップロード</h2>
                <p>写真をもとに、あなた専用のキャラクターを作ります。</p>
                <p className="pf-tip" role="note">
                  <strong>キャラクターの制作には時間がかかります。</strong>
                  1人あたり5〜10分ほど、順番待ちがあるとさらに長くなります。すぐに参加したい場合は、下の「写真なしで参加」もお選びいただけます。
                </p>
                <div className="pf-note">
                  <strong>送信される写真について</strong>
                  <p>
                    写真は非公開のクラウド保存領域に一時保存され、展示運営者の端末で処理されます。キャラクターの制作には外部のAIサービスが使われ、写真が送信されます。
                  </p>
                  <p>
                    完成後、元の写真は削除されます。参加情報は最大24時間で、公開の取り消しと写真の消去をいつでも依頼できます。処理中や外部サービスに送信済みのデータは、すぐには消去できない場合があります。
                  </p>
                </div>
                <label className="pf-check">
                  <input
                    type="checkbox"
                    checked={processing}
                    onChange={(event) => setProcessing(event.target.checked)}
                  />
                  写真をキャラクター制作に使用することに同意します
                </label>
                <label className="pf-check">
                  <input
                    type="checkbox"
                    checked={upload}
                    onChange={(event) => setUpload(event.target.checked)}
                  />
                  写真を外部のAIサービスに送信することに同意します
                </label>
                <label className="pf-check">
                  <input
                    type="checkbox"
                    checked={publication}
                    onChange={(event) => setPublication(event.target.checked)}
                  />
                  完成したキャラクターを展示の街に自動的に公開することに同意します
                </label>
                <div className="pf-photo-actions">
                  <label className="pf-back">
                    写真を選ぶ
                    <input
                      type="file"
                      accept="image/*"
                      disabled={busy || photoPreparing}
                      onChange={choosePhoto}
                    />
                  </label>
                  <label className="pf-back">
                    写真を撮る
                    <input
                      type="file"
                      accept="image/*"
                      capture="user"
                      disabled={busy || photoPreparing}
                      onChange={choosePhoto}
                    />
                  </label>
                </div>
                {photoPreparing && <p role="status">写真を送信用に調整しています…</p>}
                {photoError && (
                  <p role="alert" className="pf-error">
                    {photoError}
                  </p>
                )}
                {photoUrl && (
                  <div className="pf-photo-preview">
                    <img
                      src={photoUrl}
                      alt="選んだ写真のプレビュー"
                      onError={() => {
                        discardPhoto();
                        setPhotoError("写真を読み込めませんでした。別の写真を選んでください。");
                      }}
                    />
                    <button type="button" className="pf-back" onClick={discardPhoto}>
                      写真を選び直す
                    </button>
                  </div>
                )}
                <button
                  className="pf-primary"
                  type="button"
                  disabled={
                    busy || photoPreparing || !photoFile || !processing || !upload || !publication
                  }
                  onClick={() => void sendPhoto()}
                >
                  {busy ? "送信しています…" : "写真を送信して次へ"}
                </button>
                <div className="pf-note">
                  <strong>待たずに参加する（写真なし）</strong>
                  <p>
                    写真は送らず、用意されたキャラクターで参加できます。待ち時間はほとんどなく、そのまま質問に進めます。あなた専用のキャラクターは作られません。
                  </p>
                  <Link
                    className="pf-back"
                    href="/join?mode=sample"
                    onClick={() => {
                      // Carry the nickname from step 1 over, without putting it in the URL.
                      try {
                        sessionStorage.setItem("ai-city-nickname", nickname.trim());
                      } catch {
                        // Without storage the next page falls back to the character's name.
                      }
                    }}
                  >
                    写真なしで、用意されたキャラクターで参加する
                  </Link>
                </div>
                <button
                  className="pf-back"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    discardPhoto();
                    setStage("name");
                  }}
                >
                  戻る
                </button>
              </>
            )}
            {stage === "questions" && (
              <>
                <p className="pf-step">
                  {stepLabel(3)} · 質問 {question + 1} / 6
                </p>
                <p className="pf-fine" role="status">
                  写真を受け付けました。回答している間にキャラクターを作り始めます。
                </p>
                <fieldset className="pf-questions">
                  <legend>{questions[question]?.[0]}</legend>
                  {questions[question]?.[1].map((option, index) => (
                    <label key={option}>
                      <input
                        type="radio"
                        name={`question-${question}`}
                        checked={answers[question] === index}
                        onChange={() =>
                          setAnswers((previous) =>
                            previous.map((answer, i) => (i === question ? index : answer)),
                          )
                        }
                      />
                      {option}
                    </label>
                  ))}
                </fieldset>
                <button
                  className="pf-primary"
                  type="button"
                  disabled={answers[question] === null}
                  onClick={() => {
                    if (question === 5) {
                      setQuestionsDone(true);
                      setStage(state === "PUBLISHED" ? "done" : "progress");
                    } else setQuestion(question + 1);
                  }}
                >
                  {question === 5 ? "回答を終える" : "次へ"}
                </button>
                <div className="pf-actions">
                  <button
                    className="pf-back"
                    type="button"
                    disabled={question === 0}
                    onClick={() => setQuestion(question - 1)}
                  >
                    戻る
                  </button>
                  <button
                    className="pf-back"
                    type="button"
                    onClick={() => {
                      setQuestionsDone(true);
                      setStage(state === "PUBLISHED" ? "done" : "progress");
                    }}
                  >
                    質問をスキップ
                  </button>
                </div>
                <p className="pf-fine">
                  AIスタイルは娯楽用です。回答は送信せず、この画面に結果を表示するだけです。
                </p>
              </>
            )}
            {stage === "progress" && (
              <section className="pf-progress" aria-live="polite">
                <p className="pf-step">{stepLabel(4)}</p>
                <h2>
                  {progress.phase === "attention" ? "確認が必要です" : "キャラクターを作っています"}
                </h2>
                {progress.phase !== "attention" ? (
                  <>
                    <div
                      className="pf-bar"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={progress.percent}
                      aria-label="キャラクター制作の進み具合（目安）"
                    >
                      <span style={{ width: `${progress.percent}%` }} />
                    </div>
                    <p className="pf-bar-text">
                      {progress.label}　<strong>{progress.percent}%</strong>
                    </p>
                    <p className="pf-fine">
                      進み具合は目安です。1人あたり5〜10分ほどかかり、順番待ちがあるとさらに時間がかかります。
                    </p>
                    <div className="pf-tip">
                      <strong>待っている間に、平板で街を体験できます</strong>
                      <ul>
                        <li>展示会場の平板で、街を歩く人物をタップすると紹介が見られます。</li>
                        <li>街の建物や名所もタップして、御茶ノ水を探検してみましょう。</li>
                        <li>完成すると、あなたのキャラクターが自動で街に現れます。</li>
                      </ul>
                      <p className="pf-fine">この画面は開いたままで大丈夫です。</p>
                    </div>
                  </>
                ) : (
                  <p role="status">{(state && attentionMessages[state]) ?? ""}</p>
                )}
                <button className="pf-back" type="button" disabled={busy} onClick={withdraw}>
                  参加を取り消して写真の消去を依頼
                </button>
              </section>
            )}
            {stage === "done" && (
              <>
                <header className="pf-dashboard-head">
                  <p className="pf-step">YOUR AI CITY</p>
                  <h1>{nickname.trim() ? `${nickname.trim()}さん、` : ""}街へようこそ</h1>
                  <p>キャラクターが完成し、展示の街に公開されました。</p>
                </header>
                {portrait.unavailable && (
                  <div role="alert" className="pf-error">
                    <p>
                      キャラクターの公開データは保存されていますが、画像を読み込めませんでした。時間をおいて再読み込みしてください。
                    </p>
                    <button className="pf-back" type="button" onClick={portrait.retry}>
                      キャラクター画像を再読み込み
                    </button>
                  </div>
                )}
                {answered && (
                  <ParticipantCard
                    name={nickname.trim() || "ゲスト"}
                    avatarSrc={portrait.image ?? TRANSPARENT_PORTRAIT}
                    tone="green"
                    decoration={null}
                    isStyle
                    styleText={`スマホのAIスタイル：${styleLabel}（娯楽用）`}
                    styleLabel={styleLabel}
                    values={traitValues(answers, styleLabel)}
                  />
                )}
                <section className="pf-controls" aria-label="平板の操作">
                  <h2>平板の操作</h2>
                  <button
                    className="pf-primary"
                    type="button"
                    disabled={busy || focusRequest.busy}
                    onClick={focusRequest.send}
                  >
                    平板で自分のキャラクターに注目
                  </button>
                  <p className="pf-fine">
                    管理者が平板を接続し「参加者の街」に切り替えてください。
                  </p>
                  {focusRequest.message && <p role="status">{focusRequest.message}</p>}
                </section>
                <button className="pf-back" type="button" disabled={busy} onClick={restartAll}>
                  参加を取り消して、最初からやり直す
                </button>
              </>
            )}
            {stage === "closed" && (
              <>
                <h2>公開を取り消しました</h2>
                <p>
                  {job?.state === "WITHDRAWN" && job.photoCleanup === "PENDING"
                    ? "関連ファイルの消去は確認待ちです。"
                    : "保存した写真と関連ファイルの消去を確認しました。"}
                </p>
                <button className="pf-primary" type="button" onClick={leave} disabled={busy}>
                  参加情報を削除して終了
                </button>
              </>
            )}
          </>
        )}
        <p className="pf-fine">試験運用中です。うまく作れない場合があります。</p>
      </div>
    </main>
  );
}
