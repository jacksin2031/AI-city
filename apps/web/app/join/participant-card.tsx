"use client";

import { useRef, useState } from "react";
import { traitLabels } from "./trait-values";

export type CardTone = "green" | "violet" | "amber";
export type CardDecoration = { toneLabel: string; markLabel: string; symbol: string };

const tones: Record<CardTone, { fg: string; bg: string; from: string; to: string }> = {
  green: { fg: "#22634d", bg: "#e3efe7", from: "#d8ebe1", to: "#f6f8f1" },
  violet: { fg: "#595f91", bg: "#eae9f6", from: "#e4e3f4", to: "#f7f6fc" },
  amber: { fg: "#95601f", bg: "#fff1dc", from: "#fbe8cb", to: "#fffaf1" },
};

const taglines: Record<string, string> = {
  ひらめき探検家: "新しいAIにまっさきに触れる、発想の冒険者",
  実践チャレンジャー: "まず試して、役に立つ形に仕上げる行動派",
  じっくりアイデア家: "調べて考えて、じっくり育てる発想家",
  しっかりサポーター: "確かめながら着実に進める頼れる相棒",
  バランス型: "場面に合わせて使い分ける柔軟なタイプ",
  未回答: "質問に答えると、AIスタイルが表示されます",
};

const FONT = '"Hiragino Sans","Yu Gothic","Noto Sans JP","Meiryo",sans-serif';

/** Corner i of a hexagon, starting at the top and going clockwise. */
function corner(i: number, radius: number, cx = 0, cy = 0) {
  const angle = -Math.PI / 2 + (i * Math.PI) / 3;
  return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius] as const;
}
function ring(radius: number) {
  return Array.from({ length: 6 }, (_, i) => corner(i, radius).join(",")).join(" ");
}
const valueRadius = (value: number, radius: number) => radius * (0.15 + 0.85 * value);
function shape(values: readonly number[], radius: number) {
  return values.map((v, i) => corner(i, valueRadius(v, radius)).join(",")).join(" ");
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, size: number) {
  let s = size;
  ctx.font = `800 ${s}px ${FONT}`;
  while (s > 30 && ctx.measureText(text).width > maxWidth) {
    s -= 2;
    ctx.font = `800 ${s}px ${FONT}`;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image"));
    image.src = src;
  });
}

async function drawCard(opts: {
  name: string;
  avatarSrc: string;
  tone: CardTone;
  styleText: string;
  styleLabel: string;
  decoration: CardDecoration | null;
  values: readonly number[];
}) {
  const W = 1600;
  const H = 900;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const avatar = await loadImage(opts.avatarSrc);
  const t = tones[opts.tone];

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, t.from);
  bg.addColorStop(0.55, t.to);
  bg.addColorStop(1, "#e7ebe8");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.shadowColor = "rgba(29,49,41,0.16)";
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(80, 80, W - 160, H - 160, 56);
  ctx.fill();
  ctx.shadowColor = "transparent";

  // left: the character
  ctx.fillStyle = t.bg;
  ctx.beginPath();
  ctx.roundRect(120, 120, 560, H - 240, 40);
  ctx.fill();
  ctx.fillStyle = t.fg;
  ctx.textAlign = "center";
  ctx.font = `800 26px ${FONT}`;
  ctx.fillText("Y O U R   C H A R A C T E R", 400, 190);
  const height = 430;
  const width = (height * avatar.naturalWidth) / avatar.naturalHeight || (height * 3) / 4;
  ctx.drawImage(avatar, 400 - width / 2, 230, width, height);
  if (opts.decoration) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(400 + width / 2 - 10, 250, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = t.fg;
    ctx.font = `400 52px ${FONT}`;
    ctx.textBaseline = "middle";
    ctx.fillText(opts.decoration.symbol, 400 + width / 2 - 10, 254);
    ctx.textBaseline = "alphabetic";
  }
  ctx.fillStyle = "#4b5f56";
  ctx.font = `500 28px ${FONT}`;
  ctx.fillText("サンプルのアバター", 400, 724);
  if (opts.decoration) {
    ctx.fillText(`${opts.decoration.toneLabel}・${opts.decoration.markLabel}`, 400, 764);
  }

  // right: name, style, hexagon
  ctx.textAlign = "left";
  ctx.fillStyle = "#1d3129";
  fitFont(ctx, opts.name, 780, 76);
  ctx.fillText(opts.name, 740, 230);

  ctx.font = `800 34px ${FONT}`;
  const pw = Math.min(780, ctx.measureText(opts.styleText).width + 80);
  ctx.fillStyle = t.bg;
  ctx.beginPath();
  ctx.roundRect(740, 262, pw, 72, 36);
  ctx.fill();
  ctx.fillStyle = t.fg;
  ctx.fillText(opts.styleText, 780, 310, pw - 80);
  ctx.fillStyle = "#4b5f56";
  ctx.font = `500 26px ${FONT}`;
  ctx.fillText(taglines[opts.styleLabel] ?? "", 740, 372, 780);

  const cx = 1010;
  const cy = 570;
  const R = 130;
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#dfe5dc";
  for (const k of [1, 0.66, 0.33]) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const [x, y] = corner(i, R * k, cx, cy);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const [x, y] = corner(i, R, cx, cy);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  ctx.beginPath();
  opts.values.forEach((v, i) => {
    const [x, y] = corner(i, valueRadius(v, R), cx, cy);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = t.fg;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 5;
  ctx.strokeStyle = t.fg;
  ctx.stroke();
  ctx.fillStyle = t.fg;
  ctx.font = `700 26px ${FONT}`;
  ctx.textAlign = "center";
  traitLabels.forEach((text, i) => {
    const [x, y] = corner(i, R + 46, cx, cy);
    ctx.fillText(text, x, y + 9);
  });

  ctx.textAlign = "left";
  ctx.fillStyle = "#4b5f56";
  ctx.font = `400 22px ${FONT}`;
  ctx.fillText("娯楽用の結果で、性格を診断するものではありません。", 740, 786, 780);
  ctx.fillText("アバターは写真から生成されたものではありません。", 740, 816, 780);
  ctx.textAlign = "right";
  ctx.fillStyle = t.fg;
  ctx.font = `800 24px ${FONT}`;
  ctx.fillText("AI CITY · 体験版", W - 130, 190);
  return canvas;
}

export function ParticipantCard({
  name,
  avatarSrc,
  tone,
  decoration,
  styleText,
  styleLabel,
  values,
  isStyle,
}: {
  name: string;
  avatarSrc: string;
  tone: CardTone;
  decoration: CardDecoration | null;
  /** The full sentence, e.g. 「スマホのAIスタイル：ひらめき探検家（娯楽用）」. */
  styleText: string;
  /** The plain style or personality label, used for the one-line description. */
  styleLabel: string;
  values: readonly number[];
  /** True when the label is one of the phone's AI styles, not a sample resident's personality. */
  isStyle: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const [status, setStatus] = useState<"" | "saved" | "error">("");

  async function download() {
    try {
      const canvas = await drawCard({
        name,
        avatarSrc,
        tone,
        styleText,
        styleLabel,
        decoration,
        values,
      });
      if (!canvas) throw new Error("canvas");
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("blob");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ai-city-card.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  function tilt(event: React.PointerEvent<HTMLElement>) {
    const el = ref.current;
    if (!el || event.pointerType === "touch") return;
    const r = el.getBoundingClientRect();
    const x = (event.clientX - r.left) / r.width - 0.5;
    const y = (event.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--tx", `${(-y * 8).toFixed(2)}deg`);
    el.style.setProperty("--ty", `${(x * 10).toFixed(2)}deg`);
  }
  function untilt() {
    ref.current?.style.setProperty("--tx", "0deg");
    ref.current?.style.setProperty("--ty", "0deg");
  }

  const description = isStyle ? taglines[styleLabel] : undefined;
  return (
    <>
      <section
        ref={ref}
        className="pf-dashboard-card pf-card-3d"
        data-tone={tone}
        aria-label="あなたのカード"
        onPointerMove={tilt}
        onPointerLeave={untilt}
      >
        <span className="pf-card-shine" aria-hidden="true" />
        <div className="pf-card-left">
          <p className="pf-card-label">YOUR CHARACTER</p>
          <div className="pf-card-figure">
            <img src={avatarSrc} alt="街に表示するサンプル" width="120" height="160" />
            {decoration && (
              <span className="pf-card-mark" aria-hidden="true">
                {decoration.symbol}
              </span>
            )}
          </div>
          <span className="pf-spark pf-spark-a" aria-hidden="true">
            ✦
          </span>
          <span className="pf-spark pf-spark-b" aria-hidden="true">
            ✦
          </span>
          <p className="pf-card-caption">サンプルのアバター</p>
          {decoration && (
            <p className="pf-card-caption">
              スマホの見本：{decoration.toneLabel}・{decoration.markLabel}
            </p>
          )}
        </div>
        <div className="pf-card-right">
          <strong className="pf-card-name">{name}</strong>
          <p className="pf-card-style">{styleText}</p>
          {description && <p className="pf-card-tagline">{description}</p>}
          <svg
            className="pf-hex"
            viewBox="-120 -112 240 224"
            role="img"
            aria-label={`性格六角形：${traitLabels
              .map((label, i) => `${label} ${Math.round((values[i] ?? 0) * 100)}`)
              .join("、")}`}
          >
            {[1, 0.66, 0.33].map((k) => (
              <polygon key={k} className="pf-hex-grid" points={ring(80 * k)} />
            ))}
            {traitLabels.map((label, i) => (
              <line
                key={label}
                className="pf-hex-axis"
                x1="0"
                y1="0"
                x2={corner(i, 80)[0]}
                y2={corner(i, 80)[1]}
              />
            ))}
            <polygon className="pf-hex-shape" points={shape(values, 80)} />
            {traitLabels.map((label, i) => {
              const [dx, dy] = corner(i, valueRadius(values[i] ?? 0, 80));
              const [lx, ly] = corner(i, 100);
              return (
                <g key={label}>
                  <circle
                    className="pf-hex-dot"
                    cx={dx}
                    cy={dy}
                    r="3.5"
                    style={{ animationDelay: `${1.1 + i * 0.09}s` }}
                  />
                  <text className="pf-hex-label" x={lx} y={ly} textAnchor="middle" dy="0.35em">
                    {label}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="pf-fine">スマホの色・マークは街には表示されません。</p>
        </div>
      </section>
      <button className="pf-secondary pf-card-download" type="button" onClick={download}>
        カードを画像で保存
      </button>
      <p className="pf-fine pf-card-status" role="status">
        {status === "saved" && "画像を保存しました。端末のダウンロードを確認してください。"}
        {status === "error" && "保存できませんでした。もう一度お試しください。"}
      </p>
    </>
  );
}
