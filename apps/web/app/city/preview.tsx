"use client";

import { createLiveCity, type LiveCity } from "@ai-city/city";
import { useEffect, useRef, useState } from "react";

type Resident = { residentId: string; nickname: string; avatarUrl: string; avatarSource: string };
type Conversation = {
  speakers: { a: string; b: string };
  lines: { speaker: "a" | "b"; text: string }[];
  source: "gemini" | "fallback";
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function CityPreview() {
  const parent = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [count, setCount] = useState(0);
  const [source, setSource] = useState<"gemini" | "fallback" | null>(null);
  useEffect(() => {
    if (!parent.current) return;
    let disposed = false;
    let city: LiveCity | undefined;
    let residents: Resident[] = [];
    createLiveCity(parent.current)
      .then((created) => {
        if (disposed) return created.destroy();
        city = created;
      })
      .catch(() => !disposed && setFailed(true));

    const refresh = async () => {
      try {
        const response = await fetch("/api/city/residents", { cache: "no-store" });
        if (!response.ok) return;
        residents = ((await response.json()) as { residents: Resident[] }).residents;
        setCount(residents.length);
        city?.sync(residents);
      } catch {
        // keep showing the last known residents
      }
    };
    const talk = async () => {
      while (!disposed) {
        await sleep(8000);
        if (disposed || !city || residents.length < 2) continue;
        const [a, b] = [...residents].sort(() => Math.random() - 0.5);
        if (!a || !b) continue;
        try {
          const response = await fetch(
            `/api/city/conversation?a=${a.residentId}&b=${b.residentId}`,
            {
              cache: "no-store",
            },
          );
          if (!response.ok) continue;
          const conversation = (await response.json()) as Conversation;
          setSource(conversation.source);
          for (const line of conversation.lines) {
            if (disposed) return;
            city.say(line.speaker === "a" ? a.residentId : b.residentId, line.text, 3800);
            await sleep(4200);
          }
        } catch {
          // try another pair next round
        }
      }
    };
    void refresh();
    const interval = window.setInterval(refresh, 5000);
    void talk();
    return () => {
      disposed = true;
      window.clearInterval(interval);
      city?.destroy();
    };
  }, []);
  return (
    <>
      <section className="city" ref={parent} aria-label="街の住民たち" />
      <p className="fine" role="status">
        {count === 0 ? "住民を待っています…" : `住民 ${count} 人`}
        {source === "gemini" && " ・ 会話はGeminiが生成しています"}
        {source === "fallback" && " ・ 会話は用意された文章です（AI生成ではありません）"}
      </p>
      {failed && <p role="alert">表示を開始できませんでした。ページを再読み込みしてください。</p>}
    </>
  );
}
