import type { CSSProperties } from "react";

const MAPLE =
  "M12 1.5 14 6l3-1.2-.6 4.4 3.6-2-1 3.6 3.1.4-3.3 3.2.9 1.6-5-.2L15.3 20h-1.8L12 15.4 10.5 20H8.7l-.4-5.5-5 .2.9-1.6-3.3-3.2 3.1-.4-1-3.6 3.6 2L6 4.8 9 6z";

function Maple({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 22"
      aria-hidden="true"
      focusable="false"
    >
      <path d={MAPLE} fill="currentColor" />
      <path d="M12 14.5V21" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

const LEAVES = [
  { left: 6, size: 36, delay: 0, duration: 17 },
  { left: 19, size: 24, delay: 6, duration: 21 },
  { left: 31, size: 32, delay: 11, duration: 19 },
  { left: 44, size: 22, delay: 3, duration: 23 },
  { left: 58, size: 34, delay: 9, duration: 18 },
  { left: 70, size: 26, delay: 14, duration: 22 },
  { left: 82, size: 38, delay: 5, duration: 20 },
  { left: 93, size: 24, delay: 12, duration: 24 },
];

/** Decorative autumn grade over the 3D scene. It never receives pointer events. */
export function AutumnFilter({ animated }: { animated: boolean }) {
  return (
    <>
      <div className="autumn-filter" aria-hidden="true" />
      <div className="autumn-leaves" aria-hidden="true">
        {animated &&
          LEAVES.map((leaf) => (
            <Maple
              key={leaf.left}
              className="autumn-leaf"
              style={{
                left: `${leaf.left}%`,
                width: leaf.size,
                animationDelay: `-${leaf.delay}s`,
                animationDuration: `${leaf.duration}s`,
              }}
            />
          ))}
      </div>
    </>
  );
}

export function SceneLogo() {
  return (
    <header className="scene-logo">
      <h1 className="scene-logo-title">
        <span className="scene-logo-pre">バーチャル</span>
        <span className="scene-logo-main">御茶ノ水</span>
      </h1>
      <p className="scene-logo-sub">デジタルハリウッド大学</p>
    </header>
  );
}

export function SceneCounts({ participants, inScene }: { participants: number; inScene: number }) {
  return (
    <dl className="scene-counts" aria-label="参加状況">
      <div>
        <dt>参加人数</dt>
        <dd>
          {participants}
          <small>人</small>
        </dd>
      </div>
      <div>
        <dt>街にいる人物</dt>
        <dd>
          {inScene}
          <small>人</small>
        </dd>
      </div>
    </dl>
  );
}
