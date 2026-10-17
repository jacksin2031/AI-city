"use client";

import { createDevelopmentCity } from "@ai-city/city";
import { useEffect, useRef, useState } from "react";

export function CityPreview() {
  const parent = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!parent.current) return;
    let disposed = false;
    let active: Awaited<ReturnType<typeof createDevelopmentCity>> | undefined;
    createDevelopmentCity(parent.current)
      .then((game) => {
        if (disposed) game.destroy(true);
        else active = game;
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      active?.destroy(true);
    };
  }, []);
  return (
    <>
      <section className="city" ref={parent} aria-label="架空の住民による開発用アニメーション" />
      {failed && <p role="alert">表示を開始できませんでした。ページを再読み込みしてください。</p>}
    </>
  );
}
