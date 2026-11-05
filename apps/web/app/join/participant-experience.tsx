"use client";

import { characterDataUrl } from "@ai-city/city/illustrations";
import type { ParticipationView } from "@ai-city/contracts/development";
import {
  createDevelopmentClient,
  DevelopmentApiError,
} from "@ai-city/contracts/development-client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CityScene } from "./city-scene";
import { useReliableFocus } from "./use-reliable-focus";
import "./participant.css";

const questions = [
  [
    "AIを初めて使うなら？",
    ["まず自由に試す", "使い方を調べてから始める", "簡単な説明を見てから試す"],
  ],
  [
    "AIに何を手伝ってほしい？",
    ["新しいアイデアを考える", "情報を整理する", "両方を場面に合わせて使う"],
  ],
  ["AIの答えが予想と違ったら？", ["質問を変えて試す", "理由を確認する", "別の方法も考えてみる"]],
  [
    "AIと何かを作るなら？",
    ["想像を広げて作品を作る", "役に立つものを作る", "楽しさと実用性を両立する"],
  ],
  [
    "新しいAI機能を見つけたら？",
    ["すぐ触ってみる", "評判や使い方を確認する", "必要になったら試す"],
  ],
  [
    "AIとの会話で楽しいのは？",
    ["意外な発想に出会うこと", "疑問を一つずつ解決すること", "気軽にやりとりすること"],
  ],
] as const;
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

export function ParticipantExperience({ spineLocal = false }: { spineLocal?: boolean }) {
  const client = useMemo(() => createDevelopmentClient({ apiPath: "/api/visitor" }), []);
  const focusRequest = useReliableFocus(client);
  const [stage, setStage] = useState<Stage>("name");
  const [initializing, setInitializing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedbackShown, setFeedbackShown] = useState(false);
  const [nickname, setNickname] = useState("");
  const [sample, setSample] = useState<"sora" | "haru">("sora");
  const [color, setColor] = useState<(typeof colors)[number]>(colors[0]);
  const [mark, setMark] = useState<(typeof marks)[number]>(marks[0]);
  const [hasDecoration, setHasDecoration] = useState(false);
  const [answers, setAnswers] = useState<(number | null)[]>(Array(6).fill(null));
  const [question, setQuestion] = useState(0);
  const [style, setStyle] = useState<string | null>(null);
  const [view, setView] = useState<ParticipationView | null>(null);
  const [avatarConsent, setAvatarConsent] = useState(false);
  const [fields, setFields] = useState({ nickname: false, personality: false, interests: false });
  const requestId = useRef<string | null>(null);
  const waitUntil = useRef(0);

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

  function computeStyle(values: (number | null)[]) {
    const score = (indices: number[]) =>
      indices.reduce((sum, i) => sum + (values[i] === 0 ? 1 : values[i] === 1 ? -1 : 0), 0);
    const a = score([0, 2, 4]),
      c = score([1, 3, 5]);
    return !a || !c
      ? "バランス型"
      : a > 0
        ? c > 0
          ? "ひらめき探検家"
          : "実践チャレンジャー"
        : c > 0
          ? "じっくりアイデア家"
          : "しっかりサポーター";
  }
  async function prepare(skipped: boolean) {
    setStyle(skipped ? "未回答" : computeStyle(answers));
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
        nickname: nickname.trim(),
        sampleId: sample,
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
  async function remove() {
    if (!view) return;
    setBusy(true);
    setError("");
    try {
      const next = await client.remove(view.job.jobId);
      setView(next);
      setStage("removed");
    } catch {
      setError("削除できませんでした。接続を確認してください。");
    } finally {
      setBusy(false);
    }
  }
  async function leave() {
    setBusy(true);
    setError("");
    try {
      await client.closeSession();
      window.location.assign("/");
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
      window.location.assign("/join");
    } catch {
      setError("削除できませんでした。通信を確認してもう一度お試しください。");
      setBusy(false);
    }
  }
  const dashboard = stage === "published";
  return (
    <main className={`pf-page${dashboard ? " pf-page-dashboard" : ""}`}>
      {!dashboard && (
        <div className="pf-scene">
          <CityScene />
          <header className="pf-header">
            <Link href="/" aria-label="トップへ">
              <span className="pf-brand" />
            </Link>
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
        {spineLocal && (
          <p>
            <Link href="/join/spine">写真からキャラクターを作る（本機テスト）</Link>
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
                <Link className="pf-back" href="/">
                  最初に戻る
                </Link>
              </>
            )}
            {stage === "photo" && (
              <>
                <p className="pf-step">ステップ 2 / 4</p>
                <h2>写真について</h2>
                <p>写真からアバターを作る機能を準備しています。</p>
                <div className="pf-note">
                  <strong>写真の撮影・送信はできません</strong>
                  <p>写真を使わず、サンプルを選んで参加できます。</p>
                </div>
                <button className="pf-primary" type="button" onClick={() => setStage("custom")}>
                  写真を使わずにカスタマイズ
                </button>
                <button className="pf-back" type="button" onClick={() => setStage("name")}>
                  戻る
                </button>
              </>
            )}
            {stage === "custom" && (
              <>
                <p className="pf-step">ステップ 2 / 4</p>
                <h2>サンプルをカスタマイズ</h2>
                <p>街に表示するサンプルと、スマホの色・マークを選びます。</p>
                <div className={`pf-avatar pf-${color.id}`} aria-hidden="true">
                  {mark.symbol}
                </div>
                <fieldset className="pf-options">
                  <legend>街に表示するサンプル</legend>
                  {(["sora", "haru"] as const).map((item) => (
                    <label key={item}>
                      <input
                        type="radio"
                        name="sample"
                        checked={sample === item}
                        onChange={() => setSample(item)}
                      />
                      {item === "sora" ? "そら" : "はる"}
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
                <button className="pf-back" type="button" onClick={() => setStage("photo")}>
                  戻る
                </button>
              </>
            )}
            {stage === "questions" && (
              <>
                <p className="pf-step">ステップ 3 / 4 · 質問 {question + 1} / 6</p>
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
                  AIスタイルは娯楽用で、この画面にのみ表示され、ページを更新すると消えます。
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
                <p className="pf-step">ステップ 4 / 4</p>
                <h2>公開する内容を確認</h2>
                <div className="pf-card">
                  <img
                    src={characterDataUrl(view.preview.avatarVersion)}
                    alt="街に表示するサンプル"
                    width="96"
                    height="128"
                  />
                  <strong>{view.preview.nickname}</strong>
                  <p>仮のイラスト・写真からの生成ではありません</p>
                  {style && <p>スマホのAIスタイル：{style}（娯楽用）</p>}
                </div>
                <p>
                  街では選択した項目だけを表示します。情報はこのブラウザーの参加情報として24時間保存されます。
                </p>
                <p className="pf-fine">
                  AIスタイルは街に公開されません。街の性格は用意された見本です。
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
                    ["personality", "遊びの性格を表示する"],
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
                <section className="pf-dashboard-card" aria-label="あなたのカード">
                  <p className="pf-card-label">
                    YOUR CHARACTER <span>サンプル</span>
                  </p>
                  <img
                    src={characterDataUrl(view.preview.avatarVersion)}
                    alt="街に表示するサンプル"
                    width="120"
                    height="160"
                  />
                  <strong>{view.preview.nickname}</strong>
                  <p>サンプルのアバター</p>
                  {hasDecoration && (
                    <p>
                      スマホの見本：{color.label}・{mark.label}{" "}
                      <span className={`pf-avatar pf-${color.id}`} aria-hidden="true">
                        {mark.symbol}
                      </span>
                    </p>
                  )}
                  {style && <p>スマホのAIスタイル：{style}（娯楽用）</p>}
                  <p className="pf-fine">スマホの色・マークは街には表示されません。</p>
                </section>
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
                <div className="pf-actions">
                  <button className="pf-back" type="button" disabled={busy} onClick={remove}>
                    公開を取り消す
                  </button>
                  <button className="pf-back" type="button" disabled={busy} onClick={leave}>
                    参加情報を削除して終了
                  </button>
                  <button className="pf-back" type="button" disabled={busy} onClick={restart}>
                    やり直す
                  </button>
                </div>
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
