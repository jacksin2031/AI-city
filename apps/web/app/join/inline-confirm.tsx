"use client";

/**
 * In-page confirmation for destructive participant actions. Embedded mobile browsers suppress
 * window.confirm, which left the button looking dead, so the question, the progress and any
 * failure are shown on the page itself.
 */
export function InlineConfirm({
  title,
  message,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  error: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <fieldset className="pf-note" aria-label={title} data-testid="inline-confirm">
      <strong>{title}</strong>
      <p>{message}</p>
      {busy && <p role="status">処理しています。このままお待ちください…</p>}
      {error && (
        <p role="alert" className="pf-error">
          {error}
        </p>
      )}
      <div className="pf-actions">
        <button className="pf-primary" type="button" disabled={busy} onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button className="pf-back" type="button" disabled={busy} onClick={onCancel}>
          やめる
        </button>
      </div>
    </fieldset>
  );
}
