"use client";

import { characterDataUrl } from "@ai-city/city/illustrations";
import type { CreateJobRequest, ParticipationView } from "@ai-city/contracts/development";
import {
  createDevelopmentClient,
  DevelopmentApiError,
} from "@ai-city/contracts/development-client";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";

const client = createDevelopmentClient();
const questions = [
  ["初めての人と出会ったら？", ["まず様子を見る", "あいさつする", "自分から話しかける"]],
  ["知らない場所を見つけたら？", ["いつもの道を歩く", "少しのぞいてみる", "探検してみる"]],
  ["困っている人がいたら？", ["そっと見守る", "話を聞いてみる", "一緒に考える"]],
  ["休日の過ごし方は？", ["予定を立てる", "気分で調整する", "思いつきで出かける"]],
  ["街で過ごすなら？", ["一人でのんびり", "少人数で過ごす", "みんなと交流する"]],
  ["気になる活動は？", ["音楽", "ゲーム", "散歩"]],
] as const;

function message(error: unknown) {
  return error instanceof DevelopmentApiError
    ? error.message
    : "接続できませんでした。参加情報を読み直してください。";
}

export function ParticipationFlow() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<ParticipationView | null>(null);
  const [nickname, setNickname] = useState("そら");
  const [sampleId, setSampleId] = useState<CreateJobRequest["sampleId"]>("sora");
  const [scenario, setScenario] = useState<CreateJobRequest["scenario"]>("SUCCESS");
  const [answerQuestions, setAnswerQuestions] = useState(false);
  const [answers, setAnswers] = useState([1, 1, 1, 1, 1, 1]);
  const [avatarConsent, setAvatarConsent] = useState(false);
  const [fields, setFields] = useState({ nickname: false, personality: false, interests: false });
  const requestId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    async function recover() {
      try {
        await client.createSession();
        const current = await client.current();
        if (active) setView(current);
      } catch (failure) {
        if (active) setError(message(failure));
      } finally {
        if (active) setLoading(false);
      }
    }
    void recover();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!view || busy || !["QUEUED", "RUNNING"].includes(view.job.state)) return;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const next = await client.job(view.job.jobId);
        if (active) {
          setView(next);
          setError("");
        }
      } catch (failure) {
        if (active) setError(message(failure));
      }
    }, 500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [view, busy]);

  async function perform(action: () => Promise<ParticipationView | null>) {
    setBusy(true);
    setError("");
    try {
      setView(await action());
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }
  async function recoverCurrent() {
    await client.createSession();
    const current = await client.current();
    if (!current) {
      requestId.current = null;
      setAvatarConsent(false);
      setFields({ nickname: false, personality: false, interests: false });
    }
    return current;
  }
  function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    requestId.current ??= crypto.randomUUID();
    const currentRequestId = requestId.current;
    void perform(() =>
      client.createJob({
        eventId: "fixture-event",
        requestId: currentRequestId,
        nickname,
        sampleId,
        scenario,
        answers: answerQuestions ? (answers as NonNullable<CreateJobRequest["answers"]>) : null,
      }),
    );
  }
  function reset() {
    requestId.current = null;
    setView(null);
    setAvatarConsent(false);
    setFields({ nickname: false, personality: false, interests: false });
    setError("");
  }

  const stopped = view?.job.state === "CANCELLED";
  const published = view?.publication === "PUBLISHED";
  return (
    <section className="flow" aria-busy={loading || busy}>
      {error && (
        <div className="flow-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => void perform(recoverCurrent)}
          >
            参加情報を読み直す
          </button>
        </div>
      )}
      {loading ? (
        <p role="status">参加情報を確認しています。</p>
      ) : !view ? (
        <form onSubmit={start} className="flow-panel">
          <h2>サンプルで参加の流れを試す</h2>
          <label className="field">
            架空のニックネーム
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              required
              maxLength={80}
              autoComplete="off"
            />
          </label>
          <label className="field">
            キャラクターのサンプル
            <select
              value={sampleId}
              onChange={(event) => setSampleId(event.target.value as CreateJobRequest["sampleId"])}
            >
              <option value="sora">そら</option>
              <option value="haru">はる</option>
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={answerQuestions}
              onChange={(event) => setAnswerQuestions(event.target.checked)}
            />
            六つの質問に答える
          </label>
          <p className="muted">
            質問はスキップできます。遊びのための好みで、性格診断ではありません。
          </p>
          {answerQuestions && (
            <div className="questions">
              {questions.map(([question, choices], index) => (
                <fieldset key={question}>
                  <legend>
                    {index + 1}. {question}
                  </legend>
                  {choices.map((choice, value) => (
                    <label className="check" key={choice}>
                      <input
                        type="radio"
                        name={`question-${index}`}
                        checked={answers[index] === value}
                        onChange={() =>
                          setAnswers((previous) =>
                            previous.map((answer, position) =>
                              position === index ? value : answer,
                            ),
                          )
                        }
                      />
                      {choice}
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
          )}
          <details className="sample-options">
            <summary>失敗・再試行の動作も試す</summary>
            <label className="field">
              動作サンプル
              <select
                value={scenario}
                onChange={(event) =>
                  setScenario(event.target.value as CreateJobRequest["scenario"])
                }
              >
                <option value="SUCCESS">通常の準備</option>
                <option value="FAIL_ONCE">一度失敗して再試行</option>
                <option value="ALWAYS_FAIL">準備が続けて失敗</option>
                <option value="TIMEOUT">時間切れ</option>
              </select>
            </label>
          </details>
          <button type="submit" disabled={busy}>
            サンプルを準備
          </button>
        </form>
      ) : stopped ? (
        <div className="flow-panel">
          <h2>{view.publication === "REMOVED" ? "削除しました" : "中止しました"}</h2>
          <p role="status">
            {view.publication === "REMOVED" ? "サンプルを削除しました。" : "参加を中止しました。"}
          </p>
          <button type="button" onClick={reset}>
            別のサンプルを試す
          </button>
        </div>
      ) : (
        <div className="flow-panel">
          {published ? (
            <>
              <h2>連携の準備ができました</h2>
              <p role="status">連携用の一覧に追加しました。</p>
              <p>参加者の街で簡易イラストを確認できます。</p>
            </>
          ) : view.job.state === "READY" ? (
            <h2>サンプルを確認</h2>
          ) : (
            <>
              <h2>サンプルを準備しています</h2>
              <p role="status">
                {view.job.state === "QUEUED"
                  ? "順番を待っています。"
                  : view.job.state === "RUNNING"
                    ? "サンプルを組み立てています。"
                    : view.job.errorCode === "DEADLINE_EXCEEDED"
                      ? "準備が時間切れになりました。中止してお試しください。"
                      : "準備に失敗しました。もう一度お試しください。"}
              </p>
            </>
          )}
          {view.preview && (
            <>
              <div className="sample-preview">
                {/* biome-ignore lint/performance/noImgElement: local SVG data URL; next/image inline styles conflict with nonce CSP. */}
                <img
                  src={characterDataUrl(view.preview.avatarVersion)}
                  alt="簡易イラストのプレビュー"
                  width="96"
                  height="128"
                />
                <strong>{view.preview.nickname}</strong>
                <span>仮のイラスト・写真からの生成ではありません</span>
              </div>
              <dl className="preview-details">
                <div>
                  <dt>ニックネーム</dt>
                  <dd>{view.preview.nickname}</dd>
                </div>
                <div>
                  <dt>遊びの性格</dt>
                  <dd>{view.preview.personalityLabel}</dd>
                </div>
                <div>
                  <dt>興味</dt>
                  <dd>{view.preview.interests.join("・") || "指定なし"}</dd>
                </div>
              </dl>
            </>
          )}
          {!published && view.job.state === "READY" && (
            <div className="consent">
              <h3>ローカル一覧に表示する項目</h3>
              <p>自動では追加されません。表示する項目を選んで確認してください。</p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={avatarConsent}
                  onChange={(event) => setAvatarConsent(event.target.checked)}
                />
                アバターをローカル連携画面に表示する
              </label>
              {(
                [
                  ["nickname", "ニックネームを表示する"],
                  ["personality", "遊びの性格を表示する"],
                  ["interests", "興味を表示する"],
                ] as const
              ).map(([key, label]) => (
                <label className="check" key={key}>
                  <input
                    type="checkbox"
                    checked={fields[key]}
                    onChange={(event) =>
                      setFields((previous) => ({ ...previous, [key]: event.target.checked }))
                    }
                  />
                  {label}
                </label>
              ))}
              <button
                type="button"
                disabled={!avatarConsent || busy}
                onClick={() =>
                  void perform(() =>
                    client.confirm(view.job.jobId, {
                      avatarPublicConsent: true,
                      consentVersion: 1,
                      fields,
                    }),
                  )
                }
              >
                ローカル一覧に追加
              </button>
            </div>
          )}
          {published ? (
            <div className="flow-actions">
              <Link href="/city?mode=participants">街で確認</Link>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void perform(() => client.remove(view.job.jobId))}
              >
                一覧から削除
              </button>
            </div>
          ) : (
            <div className="flow-actions">
              {view.job.state === "FAILED" &&
                view.job.attempt < 2 &&
                view.job.errorCode !== "DEADLINE_EXCEEDED" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void perform(() => client.retry(view.job.jobId))}
                  >
                    もう一度準備
                  </button>
                )}
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void perform(() => client.cancel(view.job.jobId))}
              >
                参加を中止
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
