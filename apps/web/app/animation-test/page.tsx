"use client";

import { type AnimatedCharacter, createDevelopmentCity } from "@ai-city/city";
import { developmentResidents } from "@ai-city/contracts/fixtures";
import { useEffect, useRef, useState } from "react";

/** Synthetic canvas used only to exercise the city's animated-texture integration. */
function syntheticCharacter(onFrame: (animation: string) => void): AnimatedCharacter {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  let elapsed = 0;
  return {
    canvas,
    advance(animation, _direction, seconds) {
      if (!ctx) return;
      elapsed += seconds;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#ca622f";
      ctx.fillRect(65, 115, 62, 95);
      ctx.fillStyle = "#f1d2a0";
      ctx.beginPath();
      ctx.arc(96, 80, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#243b50";
      const stride = animation.includes("trot") ? Math.sin(elapsed * 8) * 12 : 0;
      ctx.fillRect(66, 200, 24, 35 + stride);
      ctx.fillRect(102, 200, 24, 35 - stride);
      onFrame(animation);
    },
    dispose() {},
  };
}

export default function AnimationTest() {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("読み込み中");
  const frame = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const abort = new AbortController();
    let city: Awaited<ReturnType<typeof createDevelopmentCity>> | undefined;
    createDevelopmentCity(host.current, {
      residents: developmentResidents.slice(0, 1),
      fillViewport: true,
      signal: abort.signal,
      createAnimatedCharacter: () =>
        syntheticCharacter((animation) => {
          if (frame.current) frame.current.textContent = animation;
        }),
      onReady: () => setStatus("表示中"),
    })
      .then((instance) => {
        if (abort.signal.aborted) instance.destroy();
        else {
          city = instance;
          const resident = developmentResidents[0];
          if (resident) instance.present({ kind: "profile", id: resident.residentId });
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) setStatus("表示できませんでした");
      });
    return () => {
      abort.abort();
      city?.destroy();
    };
  }, []);
  return (
    <main>
      <h1>合成アニメーション表示テスト</h1>
      <p>テスト用の図形です。写真から生成した人物や Spine の実行結果ではありません。</p>
      <p role="status">
        {status} <span ref={frame} data-testid="animation-name" />
      </p>
      <div ref={host} style={{ width: "100%", height: "70vh" }} />
    </main>
  );
}
