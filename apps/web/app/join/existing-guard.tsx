"use client";

import { useState } from "react";
import { type ExistingParticipation, phaseSummary, restartWarning } from "./existing-participation";
import { InlineConfirm } from "./inline-confirm";

/**
 * Shown before anything is typed when this browser already holds a participation. On a shared phone
 * the next visitor must see that it exists, and must choose explicitly: carry on with it, or end it
 * and start fresh. Nothing about the earlier participant (name, card, photo) appears here.
 */
export function ExistingGuard({
  existing,
  late,
  hasDraft,
  sameFlow,
  onContinue,
  onRestart,
}: {
  existing: ExistingParticipation;
  /** Raised after the visitor had already started typing, e.g. a late ACTIVE_JOB_EXISTS. */
  late: boolean;
  /** Typed answers exist locally and will survive restarting when `late`. */
  hasDraft: boolean;
  /** Whether "continue" resumes in this page or opens the other flow. */
  sameFlow: boolean;
  onContinue: () => void;
  onRestart: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function restart() {
    setBusy(true);
    setError("");
    try {
      await onRestart();
    } catch {
      // The earlier participation is untouched and typed input is kept; the choice can be retried.
      setError("前の参加を取り消せませんでした。通信を確認して、もう一度お試しください。");
      setBusy(false);
    }
  }

  return (
    <section
      className="pf-existing"
      aria-labelledby="pf-existing-title"
      data-testid="existing-guard"
    >
      <h2 id="pf-existing-title">この端末に前の参加が残っています</h2>
      <p role="status">{phaseSummary(existing)}</p>
      <p>
        {late
          ? "入力した内容を送る前に、先に残っている参加を確認する必要があります。"
          : "前の方の名前やカードは、ここには表示しません。自分の参加なら続けて、別の方が使う場合は取り消してから始めてください。"}
      </p>
      {late && hasDraft && (
        <p className="pf-fine">
          入力したニックネームと回答は、前の参加を取り消した後もそのまま使えます。
        </p>
      )}
      {confirming ? (
        <InlineConfirm
          title="前の参加を取り消して新しく始める確認"
          message={restartWarning(existing)}
          confirmLabel="取り消して新しく始める"
          busy={busy}
          error={error}
          onConfirm={() => void restart()}
          onCancel={() => {
            setConfirming(false);
            setError("");
          }}
        />
      ) : (
        <>
          <button className="pf-primary" type="button" onClick={onContinue}>
            {sameFlow ? "自分の参加を続ける" : "自分の参加を開く"}
          </button>
          <button
            className="pf-back"
            type="button"
            onClick={() => {
              setError("");
              setConfirming(true);
            }}
          >
            前の参加を取り消して、新しく始める
          </button>
        </>
      )}
    </section>
  );
}
