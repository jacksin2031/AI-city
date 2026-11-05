const windows = [
  [44, 148],
  [66, 178],
  [116, 110],
  [144, 140],
  [116, 196],
  [194, 170],
  [256, 130],
  [282, 176],
  [328, 180],
];

/** Decorative animated skyline behind the participant pages; the figures are not generated avatars. */
export function CityScene() {
  return (
    <svg
      className="scene-art"
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      <circle className="sun" cx="340" cy="118" r="24" />
      <g className="cloud cloud-a">
        <ellipse cx="80" cy="60" rx="34" ry="12" />
        <ellipse cx="100" cy="52" rx="22" ry="14" />
      </g>
      <g className="cloud cloud-b">
        <ellipse cx="230" cy="40" rx="26" ry="9" />
        <ellipse cx="244" cy="34" rx="16" ry="10" />
      </g>
      <g className="buildings">
        <rect x="30" y="130" width="60" height="130" rx="6" />
        <rect x="100" y="90" width="70" height="170" rx="6" />
        <rect x="180" y="150" width="50" height="110" rx="6" />
        <rect x="240" y="110" width="64" height="150" rx="6" />
        <rect x="314" y="160" width="56" height="100" rx="6" />
      </g>
      <g className="windows">
        {windows.map(([x, y], index) => (
          <rect
            key={`${x}-${y}`}
            className={`window w${index % 3}`}
            x={x}
            y={y}
            width="12"
            height="14"
            rx="2"
          />
        ))}
      </g>
      <rect className="ground" x="0" y="256" width="400" height="44" />
      <g className="walker walker-a">
        <ellipse className="shadow" cx="0" cy="276" rx="12" ry="3" />
        <circle className="body-a" cx="0" cy="256" r="14" />
      </g>
      <g className="walker walker-b">
        <ellipse className="shadow" cx="0" cy="276" rx="12" ry="3" />
        <circle className="body-b" cx="0" cy="256" r="14" />
      </g>
      <g className="walker walker-c">
        <ellipse className="shadow" cx="0" cy="276" rx="10" ry="3" />
        <circle className="body-c" cx="0" cy="258" r="11" />
      </g>
      <g className="bubble">
        <rect x="150" y="196" width="44" height="26" rx="13" />
        <circle cx="164" cy="209" r="3" />
        <circle cx="172" cy="209" r="3" />
        <circle cx="180" cy="209" r="3" />
      </g>
    </svg>
  );
}
