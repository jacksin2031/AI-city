"use client";
import { characterDataUrl } from "@ai-city/city/illustrations";
import type { PublicResident } from "@ai-city/contracts";
import { useEffect, useRef, useState } from "react";

export function ResidentCard({
  resident,
  kind,
  animated,
  sample,
  close,
  showProfile,
}: {
  resident: PublicResident;
  kind: "welcome" | "profile";
  animated: boolean;
  sample: boolean;
  close: () => void;
  showProfile: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    setFrame(0);
    if (kind !== "welcome" || !animated) return;
    const timer = setInterval(() => setFrame((value) => 1 - value), 250);
    return () => clearInterval(timer);
  }, [kind, animated]);
  const welcome = kind === "welcome";
  return (
    <dialog
      ref={dialog}
      className="tablet-resident-card"
      aria-labelledby="tablet-resident-title"
      data-animated={animated}
      data-kind={kind}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <p className="tablet-card-eyebrow">{welcome ? "新しい住民が仲間入り" : "公開プロフィール"}</p>
      <h2 id="tablet-resident-title">
        {welcome ? `ようこそ、${resident.nickname}さん！` : resident.nickname}
      </h2>
      <div className="tablet-card-content">
        {/* biome-ignore lint/performance/noImgElement: local SVG data URL, no remote image or inline style. */}
        <img
          className="tablet-portrait"
          src={characterDataUrl(resident.avatarVersion, "front", welcome ? "wave" : "idle", frame)}
          alt={`${resident.nickname}の拡大イラスト`}
          width="192"
          height="256"
          data-pose={welcome ? "wave" : "idle"}
          data-frame={frame}
        />
        {welcome ? (
          <div>
            <p>AIシティへようこそ！</p>
            <p className="muted">まもなく街の画面に戻ります。</p>
          </div>
        ) : (
          <dl className="tablet-profile-fields">
            <div>
              <dt>ニックネーム</dt>
              <dd>{resident.nickname}</dd>
            </div>
            <div>
              <dt>性格</dt>
              <dd>{resident.personalityLabel}</dd>
            </div>
            <div>
              <dt>興味</dt>
              <dd>{resident.interests.join("・") || "非公開・指定なし"}</dd>
            </div>
          </dl>
        )}
      </div>
      <p className="muted">
        {sample
          ? "架空の住民・イラストとプロフィールの見本です。"
          : "仮のイラストです。本人が公開した項目だけを表示しています。"}
      </p>
      <div className="tablet-card-actions">
        {welcome && (
          <button type="button" onClick={showProfile}>
            プロフィールを見る
          </button>
        )}
        <button ref={closeButton} type="button" onClick={close}>
          街に戻る
        </button>
      </div>
    </dialog>
  );
}
