"use client";

import { characterDataUrl } from "@ai-city/city/illustrations";
import {
  type AiStyle,
  aiStyleLabels,
  type CreateJobRequest,
  type ParticipationView,
} from "@ai-city/contracts/development";
import {
  createDevelopmentClient,
  DevelopmentApiError,
} from "@ai-city/contracts/development-client";
import { PRESET_CHARACTERS } from "@ai-city/contracts/device-link";
import Link from "next/link";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { CityScene } from "./city-scene";
import { LocalPhoto } from "./local-photo";
import { ParticipantCard } from "./participant-card";
import { computeStyle, questions } from "./questions";
import { traitValues } from "./trait-values";
import { presetIdForAvatar, usePresetPortraits } from "./use-preset-portraits";
import { useReliableFocus } from "./use-reliable-focus";
import "./participant.css";

const colors = [
  { id: "green", label: "みどり" },
  { id: "violet", label: "むらさき" },
  { id: "amber", label: "きいろ" },
] as const;
const marks = [
  { id: "none", label: "なし", symbol: "●" },
  { id: "star", label: "星", symbol: "★" },
  { id: "heart", label: "ハート", symbol: "♥" },
] as const;
type Stage =
  | "name"
  | "photo"
  | "custom"
  | "questions"
  | "waiting"
  | "confirm"
  | "published"
  | "removed";

export function ParticipantExperience({
  spineLocal = false,
  photoHref = "/join/spine",
  presetOnly = false,
}: {
  spineLocal?: boolean;
  photoHref?: string;
  /** Join as a prepared character: no name, no photo, straight to choosing a character. */
  presetOnly?: boolean;
}) {
  const client = useMemo(() => createDevelopmentClient({ apiPath: "/api/visitor" }), []);
  const focusRequest = useReliableFocus(client);
  const [stage, setStage] = useState<Stage>(presetOnly ? "custom" : "name");
  const [initializing, setInitializing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedbackShown, setFeedbackShown] = useState(false);
  const [nickname, setNickname] = useState("");
  // Joining as a prepared character reuses the nickname already entered on the previous page.
  useEffect(() => {
    if (!presetOnly) return;
    try {
      const saved = sessionStorage.getItem("ai-city-nickname")?.trim().slice(0, 80);
      if (saved) setNickname(saved);
    } catch {
      // No stored nickname: the character's own name is used.
    }
  }, [presetOnly]);
  const [sample, setSample] = useState<CreateJobRequest["sampleId"]>("aoi");
  const [color, setColor] = useState<(typeof colors)[number]>(colors[0]);
  const [mark, setMark] = useState<(typeof marks)[number]>(marks[0]);
  const [hasDecoration, setHasDecoration] = useState(false);
  const [answers, setAnswers] = useState<(number | null)[]>(Array(6).fill(null));
  const [question, setQuestion] = useState(0);
  const [view, setView] = useState<ParticipationView | null>(null);
  const [avatarConsent, setAvatarConsent] = useState(false);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const portraits = usePresetPortraits();
  const chosen = PRESET_CHARACTERS.find((item) => item.id === sample);
  const localPhoto = useRef<LocalPhoto | null>(null);
  localPhoto.current ??= new LocalPhoto({
    create: (file) => URL.createObjectURL(file),
    revoke: (url) => URL.revokeObjectURL(url),
  });
  const [fields, setFields] = useState({ nickname: false, personality: false, interests: false });
  const requestId = useRef<string | null>(null);
  const waitUntil = useRef(0);

  useEffect(() => {
    const discard = () => {
      localPhoto.current?.clear();
      setPhotoUrl(null);
      setPhotoConsent(false);
    };
    window.addEventListener("pagehide", discard);
    return () => {
      window.removeEventListener("pagehide", discard);
      localPhoto.current?.clear();
    };
  }, []);

  function discardPhoto() {
    localPhoto.current?.clear();
    setPhotoUrl(null);
    setPhotoError("");
  }
  function leavePhoto(next: "name" | "custom") {
    discardPhoto();
    setPhotoConsent(false);
    setStage(next);
  }
  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!photoConsent || !file || !localPhoto.current) return;
    setPhotoUrl(null);
    setPhotoError("");
    const result = await localPhoto.current.select(file);
    if (result.status === "ready") setPhotoUrl(result.url);
    else if (result.status === "too-large") setPhotoError("写真は8 MB以下を選んでください。");
    else if (result.status === "invalid") setPhotoError("JPEG・PNG・WebPの写真を選んでください。");
  }

  useEffect(() => {
    let live = true;
    client
      .current()
      .then((current) => {
        if (!live || !current) return;
        setView(current);
        if (current.publication === "PUBLISHED") setStage("published");
        else if (current.publication === "REMOVED" || current.job.state === "CANCELLED")
          setStage("removed");
        else if (current.job.state === "READY") setStage("confirm");
        else setStage("waiting");
      })
      .catch((failure) => {
        if (live && !(failure instanceof DevelopmentApiError && failure.status === 401))
          setError("参加情報を確認できませんでした。ページを読み直してください。");
      })
      .finally(() => {
        if (live) setInitializing(false);
      });
    return () => {
      live = false;
    };
  }, [client]);

  useEffect(() => {
    if (stage !== "waiting" || !view) return;
    if (view.job.state === "FAILED" || view.job.state === "CANCELLED") return;
    let active = true;
    const wait = view.job.state === "READY" ? Math.max(0, waitUntil.current - Date.now()) : 500;
    const timer = window.setTimeout(async () => {
      if (view.job.state === "READY") {
        if (active) setStage("confirm");
        return;
      }
      try {
        const next = await client.job(view.job.jobId);
        if (active) setView(next);
      } catch {
        if (active) setError("準備状況を取得できません。ページを読み直してください。");
      }
    }, wait);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [stage, view, client]);

  useEffect(() => {
    if (stage !== "published" || feedbackShown) return;
    const timer = window.setTimeout(() => {
      setFeedbackVisible(true);
      setFeedbackShown(true);
    }, 20_000);
    return () => window.clearTimeout(timer);
  }, [stage, feedbackShown]);

  async function prepare(skipped: boolean) {
    const aiStyle = skipped ? "UNANSWERED" : computeStyle(answers);
    setError("");
    setBusy(true);
    setStage("waiting");
    waitUntil.current = Date.now() + 3500;
    try {
      await client.createSession();
      requestId.current ??= crypto.randomUUID();
      const next = await client.createJob({
        eventId: "fixture-event",
        requestId: requestId.current,
        nickname: nickname.trim() || (presetOnly ? (chosen?.name ?? "ゲスト") : ""),
        sampleId: sample,
        aiStyle,
        scenario: "SUCCESS",
        answers: null,
      });
      setView(next);
    } catch (failure) {
      setError(
        failure instanceof DevelopmentApiError
          ? failure.message
          : "接続できませんでした。もう一度お試しください。",
      );
      setStage("questions");
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (!view || !avatarConsent) return;
    setBusy(true);
    setError("");
    try {
      const next = await client.confirm(view.job.jobId, {
        avatarPublicConsent: true,
        consentVersion: 2,
        publicationScope: "HOSTED_PREVIEW",
        fields,
      });
      setView(next);
      setStage("published");
    } catch (failure) {
      setError(
        failure instanceof DevelopmentApiError
          ? failure.message
          : "公開できませんでした。接続を確認してください。",
      );
    } finally {
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
  async function restart() {
    if (
      !window.confirm("最初からやり直しますか？街に公開したキャラクターと参加情報が削除されます。")
    )
      return;
    setBusy(true);
    setError("");
    try {
      await client.closeSession();
      try {
        sessionStorage.removeItem("ai-city-nickname");
      } catch {
        // Nothing stored.
      }
      window.location.assign("/join");
    } catch {
      setError("削除できませんでした。通信を確認してもう一度お試しください。");
      setBusy(false);
    }
  }
  const dashboard = stage === "published";
  // A prepared character is drawn from its official Spine skin; anything else keeps the illustration.
  const portraitFor = (avatarVersion: string) => {
    const id = presetIdForAvatar(avatarVersion);
    return (id ? portraits[id] : undefined) ?? characterDataUrl(avatarVersion);
  };
  return (
    <main className={`pf-page${dashboard ? " pf-page-dashboard" : ""}`}>
      {!dashboard && (
        <div className="pf-scene">
          <CityScene />
          <header className="pf-header">
            <span>開発プレビュー</span>
          </header>
          <div className="pf-intro">
            <p>参加の流れ・体験版</p>
            <h1>バーチャル御茶ノ水への参加</h1>
            <p>街に参加するまでの流れを体験できます。</p>
          </div>
        </div>
      )}
      <div className="pf-sheet">
        {/* Only before anything exists: leaving mid-flow would strand a session and a published
            character on this page. */}
        {spineLocal && stage === (presetOnly ? "custom" : "name") && (
          <p>
            <Link href={photoHref}>写真からキャラクターを作る（試験運用）</Link>
          </p>
        )}
        {error && (
          <div role="alert" className="pf-error">
            {error}
          </div>
        )}
        {initializing ? (
          <p role="status">参加情報を確認しています。</p>
        ) : (
          <>
            {stage === "name" && (
              <>
                <p className="pf-step">ステップ 1 / 4</p>
                <h2>ニックネームを教えてください</h2>
                <p>架空の名前を入力してください。本名でなくても大丈夫です。</p>
                <label className="pf-label" htmlFor="pf-nickname">
                  ニックネーム
                </label>
                <input
                  id="pf-nickname"
                  className="pf-input"
                  value={nickname}
                  maxLength={80}
                  autoComplete="off"
                  onChange={(e) => setNickname(e.target.value)}
                />
                <button
                  className="pf-primary"
                  type="button"
                  disabled={!nickname.trim()}
                  onClick={() => setStage("photo")}
                >
                  次へ
                </button>
              </>
            )}
            {stage === "photo" && (
              <>
                <p className="pf-step">ステップ 2 / 4</p>
                <h2>写真について</h2>
                <p>写真はこの端末で一時的に確認できます。</p>
                <div className="pf-note">
                  <strong>写真はアップロードされません</strong>
                  <p>
                    この画面を離れるか削除すると、アプリ内の一時プレビューを破棄します。端末の写真アプリにある元の写真は削除されません。
                  </p>
                  <p>
                    写真からのアバター生成はまだ利用できません。次の画面ではサンプルを選びます。
                  </p>
                </div>
                <label className="pf-check">
                  <input
                    type="checkbox"
                    checked={photoConsent}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      if (!checked) discardPhoto();
                      setPhotoConsent(checked);
                    }}
                  />
                  自分の写真をこの端末で一時表示することに同意します
                </label>
                <div className="pf-photo-actions">
                  <label className="pf-back">
                    写真を選ぶ
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={!photoConsent}
                      onChange={choosePhoto}
                    />
                  </label>
                  <label className="pf-back">
                    写真を撮る
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="user"
                      disabled={!photoConsent}
                      onChange={choosePhoto}
                    />
                  </label>
                </div>
                {photoError && (
                  <p role="alert" className="pf-error">
                    {photoError}
                  </p>
                )}
                {photoUrl && (
                  <div className="pf-photo-preview">
                    <img
                      src={photoUrl}
                      alt="この端末だけの写真プレビュー"
                      onError={() => {
                        discardPhoto();
                        setPhotoError("写真を読み込めませんでした。別の写真を選んでください。");
                      }}
                      onLoad={(event) => {
                        const image = event.currentTarget;
                        if (
                          !image.naturalWidth ||
                          !image.naturalHeight ||
                          image.naturalWidth * image.naturalHeight > 20_000_000
                        ) {
                          discardPhoto();
                          setPhotoError("写真のサイズが大きすぎるか、読み込めませんでした。");
                        }
                      }}
                    />
                    <button type="button" className="pf-back" onClick={discardPhoto}>
                      写真のプレビューを削除
                    </button>
                  </div>
                )}
                <button className="pf-primary" type="button" onClick={() => leavePhoto("custom")}>
                  写真を使わずにカスタマイズ
                </button>
                <button className="pf-back" type="button" onClick={() => leavePhoto("name")}>
                  戻る
                </button>
              </>
            )}
            {stage === "custom" && (
              <>
                <p className="pf-step">{presetOnly ? "ステップ 1 / 3" : "ステップ 2 / 4"}</p>
                <h2>{presetOnly ? "キャラクターを選ぶ" : "サンプルをカスタマイズ"}</h2>
                <p>
                  {presetOnly
                    ? nickname.trim()
                      ? `${nickname.trim()}さん、用意されたキャラクターから選んでください。写真は使いません。`
                      : "用意されたキャラクターから選びます。写真は使いません。"
                    : "街に表示するサンプルと、スマホの色・マークを選びます。"}
                </p>
                <div className={`pf-avatar pf-${color.id}`} aria-hidden="true">
                  {mark.symbol}
                </div>
                <fieldset className="pf-options pf-characters">
                  <legend>街に表示するキャラクター</legend>
                  {PRESET_CHARACTERS.map((item) => (
                    <label key={item.id} className="pf-character">
                      <input
                        type="radio"
                        name="sample"
                        checked={sample === item.id}
                        onChange={() => setSample(item.id)}
                      />
                      {portraits[item.id] ? (
                        <img src={portraits[item.id]} alt="" width="72" height="72" />
                      ) : (
                        <span className="pf-character-empty" aria-hidden="true" />
                      )}
                      <span>
                        {item.name}（{item.personality}）
                      </span>
                    </label>
                  ))}
                </fieldset>
                <fieldset className="pf-options">
                  <legend>スマホの色</legend>
                  {colors.map((item) => (
                    <label key={item.id}>
                      <input
                        type="radio"
                        name="color"
                        checked={color.id === item.id}
                        onChange={() => setColor(item)}
                      />
                      {item.label}
                    </label>
                  ))}
                </fieldset>
                <fieldset className="pf-options">
                  <legend>スマホのマーク</legend>
                  {marks.map((item) => (
                    <label key={item.id}>
                      <input
                        type="radio"
                        name="mark"
                        checked={mark.id === item.id}
                        onChange={() => setMark(item)}
                      />
                      {item.label}
                    </label>
                  ))}
                </fieldset>
                <p className="pf-fine">
                  色とマークはスマホだけの見本で、ページを更新すると消えます。街には選んだサンプルが表示されます。
                </p>
                <button
                  className="pf-primary"
                  type="button"
                  onClick={() => {
                    setHasDecoration(true);
                    setStage("questions");
                  }}
                >
                  このキャラクターで進む
                </button>
                {!presetOnly && (
                  <button className="pf-back" type="button" onClick={() => setStage("photo")}>
                    戻る
                  </button>
                )}
              </>
            )}
            {stage === "questions" && (
              <>
                <p className="pf-step">
                  {presetOnly ? "ステップ 2 / 3" : "ステップ 3 / 4"} · 質問 {question + 1} / 6
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
                  disabled={answers[question] === null || busy}
                  onClick={() => (question === 5 ? void prepare(false) : setQuestion(question + 1))}
                >
                  {question === 5 ? "プレビューへ" : "次へ"}
                </button>
                <div className="pf-actions">
                  <button
                    className="pf-back"
                    type="button"
                    onClick={() =>
                      question === 0 ? setStage("custom") : setQuestion(question - 1)
                    }
                  >
                    戻る
                  </button>
                  <button className="pf-back" type="button" onClick={() => void prepare(true)}>
                    質問をスキップ
                  </button>
                </div>
                <p className="pf-fine">
                  AIスタイルは娯楽用です。回答は送信せず、計算した結果のみ参加情報として保存します。
                </p>
              </>
            )}
            {stage === "waiting" && (
              <div className="pf-wait" role="status">
                <span className="pf-spinner" aria-hidden="true" />
                <h2>サンプルを準備しています</h2>
                <p>
                  {view?.job.state === "FAILED"
                    ? "準備に失敗しました。参加情報を削除して、もう一度お試しください。"
                    : "準備状況を確認しています。"}
                </p>
                {view && (
                  <button className="pf-back" type="button" onClick={leave} disabled={busy}>
                    参加情報を削除して終了
                  </button>
                )}
              </div>
            )}
            {stage === "confirm" && view?.preview && (
              <>
                <p className="pf-step">{presetOnly ? "ステップ 3 / 3" : "ステップ 4 / 4"}</p>
                <h2>公開する内容を確認</h2>
                <div className="pf-card">
                  <img
                    src={portraitFor(view.preview.avatarVersion)}
                    alt="街に表示するサンプル"
                    width="96"
                    height="128"
                  />
                  <strong>{view.preview.nickname}</strong>
                  <p>用意されたキャラクター・写真からの生成ではありません</p>
                  <p>
                    {Object.values(aiStyleLabels).includes(view.preview.personalityLabel)
                      ? "スマホのAIスタイル"
                      : "見本の性格"}
                    ：{view.preview.personalityLabel}（娯楽用）
                  </p>
                </div>
                <p>
                  街では選択した項目だけを表示します。情報はこのブラウザーの参加情報として24時間保存されます。
                </p>
                <p className="pf-fine">
                  性格の表示に同意した場合、AIスタイルを街と平板に表示します。質問への回答は送信しません。
                </p>
                <label className="pf-check">
                  <input
                    type="checkbox"
                    checked={avatarConsent}
                    onChange={(e) => setAvatarConsent(e.target.checked)}
                  />
                  アバターをこの展示サイトに公開する
                </label>
                {(
                  [
                    ["nickname", "ニックネームを表示する"],
                    ["personality", "AIスタイル（遊びの性格）を表示する"],
                    ["interests", "興味を表示する"],
                  ] as const
                ).map(([key, label]) => (
                  <label className="pf-check" key={key}>
                    <input
                      type="checkbox"
                      checked={fields[key]}
                      onChange={(e) =>
                        setFields((previous) => ({ ...previous, [key]: e.target.checked }))
                      }
                    />
                    {label}
                  </label>
                ))}
                <button
                  className="pf-primary"
                  type="button"
                  disabled={!avatarConsent || busy}
                  onClick={publish}
                >
                  確認した項目を公開して街に参加
                </button>
                <button className="pf-back" type="button" onClick={leave} disabled={busy}>
                  参加を中止して情報を削除
                </button>
              </>
            )}
            {stage === "published" && view?.preview && (
              <>
                <header className="pf-dashboard-head">
                  <p className="pf-step">YOUR AI CITY</p>
                  <h1>街へようこそ</h1>
                  <p>あなたのカードと街の操作</p>
                </header>
                <ParticipantCard
                  name={view.preview.nickname}
                  avatarSrc={portraitFor(view.preview.avatarVersion)}
                  tone={hasDecoration ? color.id : "green"}
                  decoration={
                    hasDecoration
                      ? { toneLabel: color.label, markLabel: mark.label, symbol: mark.symbol }
                      : null
                  }
                  isStyle={Object.values(aiStyleLabels).includes(view.preview.personalityLabel)}
                  styleText={`${
                    Object.values(aiStyleLabels).includes(view.preview.personalityLabel)
                      ? "スマホのAIスタイル"
                      : "見本の性格"
                  }：${view.preview.personalityLabel}（娯楽用）`}
                  styleLabel={view.preview.personalityLabel}
                  values={traitValues(answers, view.preview.personalityLabel)}
                />
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
                <button className="pf-back" type="button" disabled={busy} onClick={restart}>
                  公開を取り消して、最初からやり直す
                </button>
                {feedbackVisible && (
                  <section
                    className="pf-feedback"
                    role="dialog"
                    aria-labelledby="pf-feedback-title"
                  >
                    <h2 id="pf-feedback-title">アンケートのお願い</h2>
                    <p>体験はいかがでしたか？ よろしければ、ご感想をお聞かせください。</p>
                    <a
                      className="pf-primary"
                      href="https://docs.google.com/forms/d/1_opxScrEFCfXhS0GZhj3jQoX8zle24X-SW602ZHFPNY/viewform"
                      target="_blank"
                      rel="noreferrer"
                    >
                      アンケートに回答する
                    </a>
                    <button
                      className="pf-back"
                      type="button"
                      onClick={() => setFeedbackVisible(false)}
                    >
                      あとで
                    </button>
                  </section>
                )}
              </>
            )}
            {stage === "removed" && (
              <>
                <h2>街から削除しました</h2>
                <p>この参加情報を削除して終了できます。</p>
                <button className="pf-primary" type="button" onClick={leave} disabled={busy}>
                  参加情報を削除して終了
                </button>
              </>
            )}
          </>
        )}
        {!dashboard && <p className="pf-fine">開発プレビュー：写真の送信やAI生成は行いません。</p>}
      </div>
    </main>
  );
}
