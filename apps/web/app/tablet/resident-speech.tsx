"use client";
import { type ScenePresentationFrame, speechBounds } from "@ai-city/city";
import type { PublicResident } from "@ai-city/contracts";
import { useEffect, useRef } from "react";

/** HTML controls in an SVG coordinate overlay; no modal, backdrop or second avatar. */
export function ResidentSpeech({
  resident,
  anchor,
  animated,
  sample,
  close,
  showProfile,
}: {
  resident: PublicResident;
  anchor: ScenePresentationFrame;
  animated: boolean;
  sample: boolean;
  close: () => void;
  showProfile: () => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const welcome = anchor.kind === "welcome";
  useEffect(() => {
    const previous = document.activeElement;
    if (!welcome) closeButton.current?.focus({ preventScroll: true });
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("keydown", onEscape);
      if (!welcome && previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, [close, welcome]);
  const bounds = speechBounds(anchor, anchor.kind);
  const tailX = Math.max(bounds.x + 20, Math.min(bounds.x + bounds.width - 20, anchor.x));
  return (
    <svg className="tablet-scene-overlay" viewBox="0 0 960 600" aria-label="住民の吹き出し">
      <title>住民の吹き出し</title>
      <path
        className="tablet-speech-tail"
        d={`M${tailX - 10} ${bounds.y + bounds.height - 3} L${anchor.x} ${bounds.y + bounds.height + 10} L${tailX + 10} ${bounds.y + bounds.height - 3}`}
      />
      <foreignObject x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height}>
        <section
          className="tablet-resident-speech"
          aria-label={welcome ? `ようこそ、${resident.nickname}さん！` : resident.nickname}
          aria-live={welcome ? "polite" : undefined}
          data-kind={anchor.kind}
          data-animated={animated}
          data-actor-x={anchor.x}
          data-actor-y={anchor.y}
          data-scale={anchor.scale}
          data-world-x={anchor.worldX}
          data-world-y={anchor.worldY}
          data-camera-zoom={anchor.cameraZoom}
          data-pose={anchor.pose}
          data-frame={anchor.frame}
        >
          {welcome ? (
            <button
              className="tablet-welcome-speech"
              type="button"
              onClick={showProfile}
              aria-label="プロフィールを見る"
            >
              ようこそ、{resident.nickname}さん！
            </button>
          ) : (
            <>
              <div className="tablet-speech-content">
                <h2>{resident.nickname}</h2>
                <dl>
                  <div>
                    <dt>性格</dt>
                    <dd>{resident.personalityLabel}</dd>
                  </div>
                  <div>
                    <dt>興味</dt>
                    <dd>{resident.interests.join("・") || "非公開・指定なし"}</dd>
                  </div>
                </dl>
                <p>{sample ? "架空の住民・イラスト見本" : "仮のイラスト・本人の公開項目のみ"}</p>
              </div>
              <button ref={closeButton} type="button" onClick={close}>
                拡大を閉じる
              </button>
            </>
          )}
        </section>
      </foreignObject>
    </svg>
  );
}
