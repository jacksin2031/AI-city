"use client";

import type { Landmark } from "@ai-city/city";
import { useState } from "react";

export function LandmarkCard({ landmark, close }: { landmark: Landmark; close: () => void }) {
  const [failed, setFailed] = useState(false);
  return (
    <article className="landmark-card" aria-label={`${landmark.name}の紹介`}>
      <button
        type="button"
        className="landmark-close"
        onClick={close}
        aria-label="建物の紹介を閉じる"
      >
        ×
      </button>
      <span className="city-eyebrow">街の名所</span>
      <h2>{landmark.name}</h2>
      {failed ? (
        <p role="status">写真を表示できません。</p>
      ) : (
        // biome-ignore lint/performance/noImgElement: local photo with a strict same-origin CSP.
        <img
          className="landmark-photo"
          src={landmark.image}
          alt={`${landmark.name}の実際の写真`}
          onError={() => setFailed(true)}
        />
      )}
      <p>{landmark.description}</p>
      <p className="landmark-credit">
        <a href={landmark.imageSource} target="_blank" rel="noreferrer">
          写真：{landmark.imageCredit}
        </a>{" "}
        ·{" "}
        <a href={landmark.license} target="_blank" rel="noreferrer">
          ライセンス
        </a>
      </p>
      <a href={landmark.source} target="_blank" rel="noreferrer">
        公式情報を見る
      </a>
    </article>
  );
}
