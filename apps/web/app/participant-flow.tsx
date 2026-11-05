"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ParticipantCard } from "./participant-card";

const questions = [
  {
    title: "AIを初めて使うなら？",
    options: ["まず自由に試す", "使い方を調べてから始める", "簡単な説明を見てから試す"],
  },
  {
    title: "AIに何を手伝ってほしい？",
    options: ["新しいアイデアを考える", "情報を整理する", "両方を場面に合わせて使う"],
  },
  {
    title: "AIの答えが予想と違ったら？",
    options: ["質問を変えて試す", "理由を確認する", "別の方法も考えてみる"],
  },
  {
    title: "AIと何かを作るなら？",
    options: ["想像を広げて作品を作る", "役に立つものを作る", "楽しさと実用性を両立する"],
  },
  {
    title: "新しいAI機能を見つけたら？",
    options: ["すぐ触ってみる", "評判や使い方を確認する", "必要になったら試す"],
  },
  {
    title: "AIとの会話で楽しいのは？",
    options: ["意外な発想に出会うこと", "疑問を一つずつ解決すること", "気軽にやりとりすること"],
  },
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

const feedbackUrl =
  "https://docs.google.com/forms/d/1_opxScrEFCfXhS0GZhj3jQoX8zle24X-SW602ZHFPNY/viewform";

export function ParticipantFlow() {
  const [step, setStep] = useState<
    "name" | "photo" | "customize" | "questions" | "loading" | "preview"
  >("name");
  const [nickname, setNickname] = useState("");
  const [color, setColor] = useState<(typeof colors)[number]>(colors[0]);
  const [mark, setMark] = useState<(typeof marks)[number]>(marks[0]);
  const [customized, setCustomized] = useState(false);
  const [answers, setAnswers] = useState<(number | null)[]>(Array(questions.length).fill(null));
  const [question, setQuestion] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedbackShown, setFeedbackShown] = useState(false);
  const [session, setSession] = useState<"checking" | "ok" | "none">("checking");
  const [photoConsent, setPhotoConsent] = useState(false);
  const [photoState, setPhotoState] = useState<"none" | "uploading" | "done" | "error">("none");
  const [jobError, setJobError] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarSource, setAvatarSource] = useState<"generated" | "sample">("generated");
  useEffect(() => {
    fetch("/api/session")
      .then(async (response) => {
        const data = (await response.json()) as { session?: boolean; photoConsent?: boolean };
        if (!response.ok || !data.session) return setSession("none");
        setPhotoConsent(Boolean(data.photoConsent));
        setSession("ok");
      })
      .catch(() => setSession("none"));
  }, []);
  async function uploadPhoto(file: File) {
    setPhotoState("uploading");
    const form = new FormData();
    form.set("photo", file);
    try {
      const response = await fetch("/api/photo", { method: "POST", body: form });
      setPhotoState(response.ok ? "done" : "error");
    } catch {
      setPhotoState("error");
    }
  }
  // Submit once when entering "loading", then poll the real job state until it finishes.
  useEffect(() => {
    if (step !== "loading") return;
    let cancelled = false;
    let timer: number | undefined;
    setJobError("");
    const poll = async () => {
      try {
        const response = await fetch("/api/join");
        const data = (await response.json()) as {
          state?: string;
          resident?: { avatarUrl: string; avatarSource: "generated" | "sample" };
        };
        if (cancelled) return;
        if (data.state === "READY" && data.resident) {
          setAvatarUrl(data.resident.avatarUrl);
          setAvatarSource(data.resident.avatarSource);
          setStep("preview");
          return;
        }
        if (data.state === "FAILED")
          return setJobError(
            "キャラクターを作れませんでした。時間をおいて、もう一度お試しください。",
          );
      } catch {
        // transient network error: keep polling
      }
      timer = window.setTimeout(poll, 3000);
    };
    (async () => {
      const response = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname,
          answers: skipped ? null : answers,
          color: color.id,
          mark: mark.id,
        }),
      }).catch(() => null);
      if (cancelled) return;
      if (!response?.ok)
        return setJobError("参加の登録ができませんでした。最初のページからやり直してください。");
      poll();
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [step]);
  useEffect(() => {
    if (step !== "preview" || feedbackShown) return;
    const timer = window.setTimeout(() => {
      setFeedbackVisible(true);
      setFeedbackShown(true);
    }, 20_000);
    return () => window.clearTimeout(timer);
  }, [step, feedbackShown]);
  const score = (indices: number[]) =>
    indices.reduce((sum, i) => sum + (answers[i] === 0 ? 1 : answers[i] === 1 ? -1 : 0), 0);
  const adventurous = score([0, 2, 4]);
  const creative = score([1, 3, 5]);
  const style =
    skipped || answers.some((answer) => answer === null)
      ? "未回答"
      : adventurous === 0 || creative === 0
        ? "バランス型"
        : adventurous > 0
          ? creative > 0
            ? "ひらめき探検家"
            : "実践チャレンジャー"
          : creative > 0
            ? "じっくりアイデア家"
            : "しっかりサポーター";

  // One axis per question; every choice is a valid, positive-looking result.
  const traitValue = [0.9, 0.5, 0.7];
  const traits =
    skipped || answers.some((answer) => answer === null)
      ? null
      : answers.map((answer) => traitValue[answer ?? 0] ?? 0.5);

  function back() {
    if (step === "photo") setStep("name");
    if (step === "customize") setStep("photo");
    if (step === "questions") {
      if (question > 0) setQuestion(question - 1);
      else setStep(customized ? "customize" : "photo");
    }
  }

  async function withdraw() {
    if (!window.confirm("キャラクターを街から削除します。よろしいですか？")) return;
    await fetch("/api/join", { method: "DELETE" }).catch(() => null);
    window.location.assign("/");
  }

  if (session === "none") {
    return (
      <section className="participant-flow" aria-label="参加の体験">
        <h2>最初に同意が必要です</h2>
        <p>参加するには、最初のページで注意事項を確認し、同意してください。</p>
        <Link className="button primary cta" href="/">
          最初のページへ
        </Link>
      </section>
    );
  }

  return (
    <section
      data-session={session}
      className={step === "preview" ? "participant-flow participant-dashboard" : "participant-flow"}
      aria-label="参加の体験"
    >
      <p className="flow-notice">同意に基づき、完成したキャラクターは会場の平板に公開されます。</p>
      {step === "name" && (
        <>
          <p className="flow-step">ステップ 1 / 4</p>
          <h2>ニックネームを教えてください</h2>
          <p>街で呼ばれたい名前を入力してください。本名でなくても大丈夫です。</p>
          <label className="flow-label" htmlFor="nickname">
            ニックネーム
          </label>
          <input
            id="nickname"
            className="flow-input"
            value={nickname}
            maxLength={80}
            autoComplete="off"
            onChange={(event) => setNickname(event.target.value)}
          />
          <button
            className="button primary cta"
            type="button"
            disabled={!nickname.trim()}
            onClick={() => setStep("photo")}
          >
            次へ
          </button>
          <Link className="flow-link" href="/">
            最初に戻る
          </Link>
        </>
      )}
      {step === "photo" && (
        <>
          <p className="flow-step">ステップ 2 / 4</p>
          <h2>写真について</h2>
          {photoConsent ? (
            <div className="flow-card">
              <strong>写真を送ってキャラクターを作る</strong>
              <p>
                顔写真は服や髪型の特徴を読み取るためだけに使い、生成後に削除します。生成には1〜2分かかります。
              </p>
              <label className="button secondary wide" htmlFor="photo-input">
                {photoState === "done" ? "写真を選び直す" : "写真を撮る・選ぶ"}
              </label>
              <input
                id="photo-input"
                type="file"
                accept="image/*"
                capture="user"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadPhoto(file);
                }}
              />
              <p role="status">
                {photoState === "uploading" && "送信しています…"}
                {photoState === "done" && "写真を受け取りました。"}
                {photoState === "error" && "写真を送れませんでした。別の写真でお試しください。"}
              </p>
            </div>
          ) : (
            <div className="flow-card">
              <strong>写真は使いません</strong>
              <p>写真に同意していないため、色とマークの指定からキャラクターを作ります。</p>
            </div>
          )}
          <button
            className="button secondary wide"
            type="button"
            onClick={() => setStep("customize")}
          >
            色とマークを指定する
          </button>
          <button
            className="button primary cta"
            type="button"
            disabled={photoConsent && photoState !== "done"}
            onClick={() => setStep("questions")}
          >
            次へ
          </button>
          <button className="flow-back" type="button" onClick={back}>
            戻る
          </button>
        </>
      )}
      {step === "customize" && (
        <>
          <p className="flow-step">ステップ 2 / 4</p>
          <h2>サンプルをカスタマイズ</h2>
          <p>写真を使わずに、色とマークを選べます。</p>
          <div className={`flow-avatar custom-avatar avatar-${color.id}`} aria-hidden="true">
            {mark.symbol}
          </div>
          <fieldset className="custom-options">
            <legend>色</legend>
            {colors.map((item) => (
              <label key={item.id}>
                <input
                  type="radio"
                  name="avatar-color"
                  checked={color.id === item.id}
                  onChange={() => setColor(item)}
                />
                {item.label}
              </label>
            ))}
          </fieldset>
          <fieldset className="custom-options">
            <legend>マーク</legend>
            {marks.map((item) => (
              <label key={item.id}>
                <input
                  type="radio"
                  name="avatar-mark"
                  checked={mark.id === item.id}
                  onChange={() => setMark(item)}
                />
                {item.label}
              </label>
            ))}
          </fieldset>
          <button
            className="button primary cta"
            type="button"
            onClick={() => {
              setCustomized(true);
              setStep("questions");
            }}
          >
            このキャラクターで進む
          </button>
          <button className="flow-back" type="button" onClick={back}>
            戻る
          </button>
        </>
      )}
      {step === "questions" && (
        <>
          <p className="flow-step">ステップ 3 / 4 · 質問 {question + 1} / 6</p>
          <fieldset className="flow-questions">
            <legend>{questions[question]?.title}</legend>
            {questions[question]?.options.map((option, index) => (
              <label className="flow-option" key={option}>
                <input
                  type="radio"
                  name={`question-${question}`}
                  checked={answers[question] === index}
                  onChange={() =>
                    setAnswers(answers.map((answer, i) => (i === question ? index : answer)))
                  }
                />
                {option}
              </label>
            ))}
          </fieldset>
          <button
            className="button primary cta"
            type="button"
            disabled={answers[question] === null}
            onClick={() => {
              if (question === 5) {
                setSkipped(false);
                setStep("loading");
              } else setQuestion(question + 1);
            }}
          >
            {question === 5 ? "プレビューへ" : "次へ"}
          </button>
          <div className="flow-actions">
            <button className="flow-back" type="button" onClick={back}>
              戻る
            </button>
            <button
              className="flow-back"
              type="button"
              onClick={() => {
                setSkipped(true);
                setStep("loading");
              }}
            >
              質問をスキップ
            </button>
          </div>
        </>
      )}
      {step === "loading" && (
        <div className="flow-loading" role="status">
          <span className="flow-spinner" aria-hidden="true" />
          <h2>キャラクターを作っています</h2>
          <p>{jobError || "完成まで1〜2分ほどかかります。このままお待ちください。"}</p>
        </div>
      )}
      {step === "preview" && (
        <>
          <header className="dashboard-head">
            <p className="flow-step">YOUR AI CITY</p>
            <h2>ようこそ、{nickname.trim()}さん</h2>
            <p>あなたのカードと街の操作</p>
          </header>
          {avatarUrl && (
            <img
              className="flow-avatar-image"
              src={avatarUrl}
              alt={`${nickname.trim()}のキャラクター`}
              width={128}
            />
          )}
          <ParticipantCard
            name={nickname.trim()}
            symbol={mark.symbol}
            tone={color.id}
            toneLabel={color.label}
            markLabel={mark.label}
            customized={customized}
            style={style}
            traits={traits}
          />
          <section className="dashboard-controls" aria-label="平板の操作">
            <h3>平板の操作</h3>
            <p className="fine">
              あなたのキャラクターは会場の平板の街に登場しています。
              {avatarSource === "sample" && "（これは動作確認用のサンプル画像です）"}
            </p>
          </section>
          <button className="flow-back" type="button" onClick={withdraw}>
            キャラクターを非公開にして削除する
          </button>
          {feedbackVisible && (
            <section className="feedback-prompt" role="dialog" aria-labelledby="feedback-title">
              <h3 id="feedback-title">アンケートのお願い</h3>
              <p>体験はいかがでしたか？ よろしければ、ご感想をお聞かせください。</p>
              <a className="button primary" href={feedbackUrl} target="_blank" rel="noreferrer">
                アンケートに回答する
              </a>
              <button className="flow-back" type="button" onClick={() => setFeedbackVisible(false)}>
                あとで
              </button>
            </section>
          )}
        </>
      )}
    </section>
  );
}
