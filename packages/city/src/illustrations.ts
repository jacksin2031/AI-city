import type { CityAction, Direction } from "./simulation";

export function illustrationPalette(avatarVersion: string): "sora" | "haru" | "guest" {
  // Prepared characters (sample-<id>-v1) reuse one of the two fixture looks.
  if (avatarVersion === "fixture-sora-v1" || /^sample-(aoi|minato|yui)-v1$/.test(avatarVersion))
    return "sora";
  if (avatarVersion === "fixture-haru-v1" || /^sample-(kaede|hinata|ren)-v1$/.test(avatarVersion))
    return "haru";
  return "guest";
}

type Palette = {
  hair: string;
  hairShade: string;
  hairLight: string;
  eye: string;
  body: string;
  bodyShade: string;
  sleeve: string;
  sleeveShade: string;
  cuff: string;
  inner: string;
  legs: string;
  socks: string;
  shoe: string;
  skirt?: string;
  long?: boolean;
};
// Autumn outfits (November). Fixed palettes only: no resident data reaches the SVG.
const palettes: Record<ReturnType<typeof illustrationPalette>, Palette> = {
  sora: {
    hair: "#8b5a3c",
    hairShade: "#64391f",
    hairLight: "#c08a5e",
    eye: "#5a3a26",
    body: "#efe4cc",
    bodyShade: "#d3c3a1",
    sleeve: "#2d5aa6",
    sleeveShade: "#1f4282",
    cuff: "#efe4cc",
    inner: "#ffffff",
    legs: "#ffe1cf",
    socks: "#ffffff",
    shoe: "#2c3e66",
  },
  haru: {
    hair: "#4b3226",
    hairShade: "#2f1d15",
    hairLight: "#7a5543",
    eye: "#6b3f5e",
    body: "#d9a441",
    bodyShade: "#b9852c",
    sleeve: "#d9a441",
    sleeveShade: "#b9852c",
    cuff: "#fbf6ec",
    inner: "#fbf6ec",
    legs: "#3a3540",
    socks: "#3a3540",
    shoe: "#6b3f2a",
    skirt: "#7a4b3a",
    long: true,
  },
  guest: {
    hair: "#2e2a2b",
    hairShade: "#171415",
    hairLight: "#5a5354",
    eye: "#3b4a5e",
    body: "#4f8a6a",
    bodyShade: "#3a6c51",
    sleeve: "#4f8a6a",
    sleeveShade: "#3a6c51",
    cuff: "#3a6c51",
    inner: "#f4f1e8",
    legs: "#3d5a80",
    socks: "#f4f1e8",
    shoe: "#e9e4da",
  },
};
const line = "#4a2e24";
const skin = "#ffe3d3";
const skinShade = "#f6c6b0";
/** Head geometry in its drawing grid (rendered 7 units lower), shared with the wave test. */
export const head = { cx: 48, cy: 46, rx: 22, ry: 20.5, offsetY: 7 } as const;

function eye(cx: number, cy: number, color: string, narrow = false) {
  const rx = narrow ? 3.4 : 4.8;
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="5.8" fill="#fff" stroke="none"/><ellipse cx="${cx}" cy="${cy + 0.6}" rx="${rx - 1}" ry="4.8" fill="${color}" stroke="none"/><ellipse cx="${cx}" cy="${cy + 1.6}" rx="${rx - 2.4}" ry="2.8" fill="#1f1412" stroke="none"/><circle cx="${cx - 1.4}" cy="${cy - 1.6}" r="1.6" fill="#fff" stroke="none"/><circle cx="${cx + 1.3}" cy="${cy + 2.6}" r=".8" fill="#fff" stroke="none"/><path d="M${cx - rx - 0.6} ${cy - 3.6}q${rx + 0.6} -4 ${rx * 2 + 1.2} 0" fill="none" stroke="${line}" stroke-width="2"/>`;
}

/** Original, code-drawn chibi placeholder art. No input text, photo or external resource enters SVG. */
export function characterIllustration(
  avatarVersion: string,
  direction: Direction = "front",
  action: CityAction = "idle",
  frame = 0,
): string {
  const p = palettes[illustrationPalette(avatarVersion)];
  const side = direction === "left" || direction === "right";
  const back = direction === "back";
  const sit = action === "sit";
  const wave = action === "wave" && !side;
  const gait = action === "walk" ? (frame % 2 === 0 ? -3 : 3) : 0;
  const drop = sit ? 6 : 0;

  // —— Legs and shoes ——
  const leg = (x: number, lift: number) =>
    `<path d="M${x} 100v${14 - lift}" stroke="${p.legs}" stroke-width="7"/><path d="M${x} ${110 - lift}v4" stroke="${p.socks}" stroke-width="7"/><path d="M${x - 6} ${116 - lift}h10a3.2 3.2 0 0 1 0 6.4h-10a3.2 3.2 0 0 1 0-6.4z" fill="${p.shoe}"/><path d="M${x - 6} ${121.6 - lift}h10" stroke="#fff" stroke-width="1.1"/>`;
  const seated = `<ellipse cx="41" cy="108" rx="7" ry="5" fill="${p.legs}"/><ellipse cx="55" cy="108" rx="7" ry="5" fill="${p.legs}"/><path d="M41 112v4M55 112v4" stroke="${p.socks}" stroke-width="6"/><path d="M35 116h11a3 3 0 0 1 0 6H35a3 3 0 0 1 0-6zM49 116h11a3 3 0 0 1 0 6H49a3 3 0 0 1 0-6z" fill="${p.shoe}"/>`;
  const legs = sit
    ? seated
    : side
      ? `${leg(45 - gait, Math.max(0, gait))}${leg(51 + gait, Math.max(0, -gait))}`
      : `${leg(41, Math.max(0, gait))}${leg(55, Math.max(0, -gait))}`;

  // —— Torso and arms ——
  const skirt = p.skirt
    ? `<path d="M32 94h32l5 13q-21 5-42 0z" fill="${p.skirt}"/><path d="M40 95l-2 12M48 95v13M56 95l2 12" stroke="${line}" stroke-width=".8" opacity=".5"/>`
    : "";
  const torso = back
    ? `<path d="M34 76q14-6 28 0l3 26q-17 4-34 0z" fill="${p.body}"/><path d="M48 76v26" stroke="${p.bodyShade}" stroke-width="1.2"/><path d="M40 74q8 4 16 0" fill="none" stroke="${p.sleeveShade}" stroke-width="2.4"/>`
    : side
      ? `<path d="M38 76q10-5 20 0l3 26q-13 4-26 0z" fill="${p.body}"/><path d="M53 77l5-1 3 26-6 1z" fill="${p.bodyShade}" stroke="none" opacity=".7"/>`
      : `<path d="M34 76q14-6 28 0l3 26q-17 4-34 0z" fill="${p.body}"/><path d="M45 74.5h6l-1 27h-4z" fill="${p.inner}"/><path d="M56 77l6-1 3 26-7 1z" fill="${p.bodyShade}" stroke="none" opacity=".75"/><path d="M41 74l7 6 7-6" fill="none" stroke="${p.sleeveShade}" stroke-width="2.4"/>`;
  const arm = (pivotX: number, handX: number, angle: number) =>
    `<g transform="rotate(${angle} ${pivotX} 79)"><path d="M${pivotX} 79L${handX} 95" stroke="${p.sleeve}" stroke-width="8.5"/><path d="M${pivotX + (handX - pivotX) * 0.6} 80L${handX} 94" stroke="${p.sleeveShade}" stroke-width="2" opacity=".6"/><path d="M${handX} 94.5v2.5" stroke="${p.cuff}" stroke-width="8"/><circle cx="${handX}" cy="100" r="3.7" fill="${skin}"/></g>`;
  const swing = gait * 4;
  const arms = side
    ? arm(49, 50, swing)
    : `${arm(36, 30, back ? -swing : swing)}${wave ? "" : arm(60, 66, back ? swing : -swing)}`;
  // The waving arm is drawn after the head so the palm is never hidden behind it.
  const waveArm = wave ? arm(60, 66, frame % 2 === 0 ? -112 : -126) : "";

  // —— Head ——
  const hairBack = p.long
    ? `<path d="M17 50C9 28 22 8 48 8s39 20 31 42c4 18 2 32-6 36-8-6-50-6-50 0-8-4-10-18-6-36z" fill="${p.hair}"/>`
    : `<path d="M18 52C10 30 22 9 48 8c26 1 38 22 30 44-2 8-8 9-12 6H30c-4 3-10 2-12-6z" fill="${p.hair}"/>`;
  const ahoge = `<path d="M48 11c-3-8 6-11 10-6-5-1-8 2-8 6z" fill="${p.hair}"/>`;
  let face: string;
  if (back) {
    face = `${hairBack}<circle cx="25" cy="48" r="4" fill="${skin}"/><circle cx="71" cy="48" r="4" fill="${skin}"/><path d="M19 52C11 30 23 10 48 10c25 0 37 20 29 42-6 10-52 10-58 0z" fill="${p.hair}"/><path d="M30 22q18-9 36 0M28 36q20 10 40 0" fill="none" stroke="${p.hairShade}" stroke-width="1.6"/><path d="M36 17q12-6 24-1" fill="none" stroke="${p.hairLight}" stroke-width="3"/>${ahoge}`;
  } else if (side) {
    const mouth =
      action === "talk"
        ? `<ellipse cx="64" cy="60" rx="2.2" ry="1.8" fill="#b8474a"/>`
        : `<path d="M61.5 59.5q2.5 1.6 4.5 0" fill="none" stroke="#8a3f35" stroke-width="1.4"/>`;
    face = `${hairBack}<circle cx="43" cy="49" r="4" fill="${skin}"/><path d="M30 46c0-14 10-22 22-22 13 0 20 10 20 22 0 12-8 20-20 20-12 0-22-8-22-20z" fill="${skin}"/><path d="M71 50l3 3-3 1" fill="${skin}"/><path d="M26 40C26 22 38 13 52 14c12 1 21 9 21 24l-6-6-3 9-5-11-5 9-4-11-6 8z" fill="${p.hair}"/><path d="M34 21q12-8 26-2" fill="none" stroke="${p.hairLight}" stroke-width="3"/>${ahoge}${eye(61, 49, p.eye, true)}<ellipse cx="62" cy="56" rx="3.6" ry="2.2" fill="#ff8f8f" stroke="none" opacity=".55"/>${mouth}`;
  } else {
    const mouth =
      action === "talk"
        ? `<path d="M44.5 56.5q3.5 5 7 0z" fill="#b8474a" stroke="#8a3f35" stroke-width="1.2"/><path d="M46 58.4q2 1.4 4 0" fill="#f08a8a" stroke="none"/>`
        : `<path d="M44.5 56.5q3.5 3.4 7 0" fill="none" stroke="#8a3f35" stroke-width="1.5"/>`;
    face = `${hairBack}<circle cx="25.5" cy="49" r="4.2" fill="${skin}"/><circle cx="70.5" cy="49" r="4.2" fill="${skin}"/><ellipse cx="${head.cx}" cy="${head.cy}" rx="${head.rx}" ry="${head.ry}" fill="${skin}"/><path d="M27 40q21 10 42 0v6q-21 8-42 0z" fill="${skinShade}" stroke="none" opacity=".6"/><path d="M24 41C24 22 36 14 48 14c13 0 24 8 24 27l-6-8-3 9-6-12-5 11-5-13-5 12-5-10-4 10-3-7z" fill="${p.hair}"/><path d="M33 21q14-9 30-2" fill="none" stroke="${p.hairLight}" stroke-width="3.2"/><path d="M40 16l-3 6M57 17l2 6" stroke="${p.hairShade}" stroke-width="1.4"/>${ahoge}<path d="M35 39.5h7M54 39.5h7" stroke="${p.hairShade}" stroke-width="2.4"/>${eye(39, 49, p.eye)}${eye(57, 49, p.eye)}<ellipse cx="32.5" cy="56.5" rx="4.2" ry="2.4" fill="#ff8f8f" stroke="none" opacity=".55"/><ellipse cx="63.5" cy="56.5" rx="4.2" ry="2.4" fill="#ff8f8f" stroke="none" opacity=".55"/>${mouth}`;
  }

  // The head sits 7 units lower than its drawing grid so the chin meets the collar.
  const figure = `${legs}<g transform="translate(0 ${drop})">${skirt}${torso}${arms}<g transform="translate(0 7)">${face}</g>${waveArm}</g>`;
  // Left is the mirrored right-facing pose.
  const mirrored = direction === "left" ? ' transform="matrix(-1 0 0 1 96 0)"' : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="128" viewBox="0 0 96 128"><ellipse cx="48" cy="123" rx="18" ry="3.6" fill="#1d2a24" opacity=".2"/><g${mirrored} stroke="${line}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${figure}</g></svg>`;
}

export function characterDataUrl(
  avatarVersion: string,
  direction: Direction = "front",
  action: CityAction = "idle",
  frame = 0,
  pixelScale = 1,
) {
  const svg = characterIllustration(avatarVersion, direction, action, frame);
  const sized =
    pixelScale === 1
      ? svg
      : svg.replace(
          'width="96" height="128"',
          `width="${96 * pixelScale}" height="${128 * pixelScale}"`,
        );
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`;
}
