"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

// Draft wording pending organiser and legal review. In this preview nothing is submitted or
// stored; a real backend must verify the participant's session and consent record itself.
const terms = [
  {
    title: "開発中のサービスです",
    body: "現在はテスト運用です。同意内容は参加の記録としてサーバーに保存されます。",
  },
  {
    title: "写真とAIによる処理",
    body: "写真は、服の色や髪型など見た目の特徴からアバターを作るためだけに、画像生成AI（OpenAI）で処理します。写真は外部のAIサービスに送信されます。顔認証や、年齢・性別などの推定には使いません。写真は生成後すみやかに削除します（保存期間は主催者が確定します）。",
  },
  {
    title: "街での公開",
    body: "確認したアバター、ニックネーム、性格や好みの一部が会場のタブレットに表示され、ほかの来場者が見ることができます。本名・住所・電話番号はお聞きしません。",
  },
  {
    title: "AIの会話について",
    body: "住民どうしの会話は、AIや用意された文章によるものです。あなた本人の発言や意見ではなく、内容が正確でない場合があります。",
  },
  {
    title: "非公開・削除",
    body: "参加したあとも、ご自身のスマートフォンからアバターの非公開や削除をいつでも依頼できます。",
  },
  {
    title: "免責事項",
    body: "アバターは実際の姿と異なる場合があります。通信状況や機器の不具合により、表示が遅れたり、表示できなかったりすることがあります。18歳未満の方は保護者の方と一緒にご確認ください。",
  },
];

const agreements = [
  { id: "terms", label: "注意事項・免責事項を確認しました" },
  { id: "photo", label: "写真のAI処理に同意します（写真を使う場合のみ）" },
  { id: "public", label: "アバターを街で公開することに同意します" },
] as const;

type AgreementId = (typeof agreements)[number]["id"];

export function Consent() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const [checked, setChecked] = useState<Record<AgreementId, boolean>>({
    terms: false,
    photo: false,
    public: false,
  });
  const done = Number(checked.terms) + Number(checked.public);
  const ready = checked.terms && checked.public;

  function toggle(id: AgreementId, value: boolean) {
    // The terms can only be confirmed from inside the sheet, after they have been shown.
    if (id === "terms" && value) {
      dialog.current?.showModal();
      return;
    }
    setChecked({ ...checked, [id]: value });
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terms: true, photo: checked.photo, public: true }),
      });
      if (!response.ok) throw new Error("session");
      router.push("/join");
    } catch {
      setError("同意を記録できませんでした。通信状況を確認して、もう一度お試しください。");
      setBusy(false);
    }
  }

  function confirmTerms() {
    setChecked({ ...checked, terms: true });
    dialog.current?.close();
  }

  return (
    <section className="consent" aria-labelledby="consent-title">
      <div className="consent-head">
        <h2 id="consent-title">参加の前に同意が必要です</h2>
        <span className="count" data-progress={done} aria-live="polite">
          {done}/2
        </span>
      </div>

      <ul className="agreements">
        {agreements.map((item) => (
          <li key={item.id} className="agreement-row">
            <label className="agreement">
              <input
                type="checkbox"
                checked={checked[item.id]}
                onChange={(event) => toggle(item.id, event.target.checked)}
              />
              <span className="checkmark" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </span>
              <span>{item.label}</span>
            </label>
            {item.id === "terms" && (
              <button className="read" type="button" onClick={() => dialog.current?.showModal()}>
                読む
              </button>
            )}
          </li>
        ))}
      </ul>

      <button
        className={ready ? "button primary cta ready" : "button primary cta"}
        type="button"
        disabled={!ready || busy}
        onClick={submit}
      >
        {busy ? "記録しています…" : "同意して参加する"}
      </button>
      {error && <p role="alert">{error}</p>}
      <p className="fine">
        同意内容は参加の記録として保存されます。写真は同意した場合のみ送信されます。
      </p>

      <dialog ref={dialog} className="terms-sheet" aria-labelledby="terms-title">
        <div className="terms-head">
          <h2 id="terms-title">注意事項・免責事項</h2>
          <button
            className="close"
            type="button"
            aria-label="閉じる"
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </div>
        <ol className="terms">
          {terms.map((term, index) => (
            <li key={term.title} className="term">
              <span className="term-number" aria-hidden="true">
                {index + 1}
              </span>
              <div>
                <h3>{term.title}</h3>
                <p>{term.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <button className="button primary cta" type="button" onClick={confirmTerms}>
          確認しました
        </button>
      </dialog>
    </section>
  );
}
