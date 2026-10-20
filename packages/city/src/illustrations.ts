import type { CityAction, Direction } from "./simulation";

export function illustrationPalette(avatarVersion: string): "sora" | "haru" | "guest" {
  return avatarVersion === "fixture-sora-v1"
    ? "sora"
    : avatarVersion === "fixture-haru-v1"
      ? "haru"
      : "guest";
}

/** Original, code-drawn placeholder art. No input text, photo or external resource enters SVG. */
export function characterIllustration(
  avatarVersion: string,
  direction: Direction = "front",
  action: CityAction = "idle",
  frame = 0,
): string {
  const palette = illustrationPalette(avatarVersion);
  const shirt = palette === "sora" ? "#508b75" : palette === "haru" ? "#8881bc" : "#b98059";
  const hair = palette === "haru" ? "#584033" : "#363a37";
  const side = direction === "left" || direction === "right";
  const back = direction === "back";
  const gait = action === "walk" ? (frame % 2 === 0 ? -4 : 4) : 0;
  const arm = action === "wave" ? (frame % 2 === 0 ? 110 : 125) : action === "walk" ? gait * 2 : 0;
  const face = back
    ? ""
    : side
      ? `<circle cx="${direction === "right" ? 58 : 37}" cy="38" r="2.3" fill="#27332e"/><path d="M${direction === "right" ? "59 49q5 2 7-2" : "29 47q2 4 7 2"}" fill="none"/>`
      : `<circle cx="39" cy="38" r="2.3" fill="#27332e"/><circle cx="57" cy="38" r="2.3" fill="#27332e"/>${action === "talk" ? '<ellipse cx="48" cy="48" rx="4" ry="3" fill="#bb6a64"/>' : '<path d="M42 47q6 7 12 0" fill="none"/>'}<ellipse cx="32" cy="44" rx="4" ry="2" fill="#e9a48b" stroke="none"/><ellipse cx="64" cy="44" rx="4" ry="2" fill="#e9a48b" stroke="none"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="128" viewBox="0 0 96 128"><ellipse cx="48" cy="119" rx="25" ry="5" fill="#35463b" opacity=".16"/><g stroke="#34443c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M36 88v${18 + gait}m24-${18 + gait}v${18 - gait}" stroke-width="11" stroke="#f5eee0"/><rect x="26" y="${104 + gait}" width="19" height="9" rx="4" fill="#455c53"/><rect x="51" y="${104 - gait}" width="19" height="9" rx="4" fill="#455c53"/><g transform="rotate(${arm} 29 67)"><path d="M28 65L22 88" stroke="${shirt}" stroke-width="13"/><circle cx="21" cy="91" r="6" fill="#f3c8a1"/></g><g transform="rotate(${-gait * 2} 67 67)"><path d="M68 65l6 23" stroke="${shirt}" stroke-width="13"/><circle cx="75" cy="91" r="6" fill="#f3c8a1"/></g><rect x="28" y="58" width="40" height="38" rx="12" fill="${shirt}"/><path d="M38 58l10 10 10-10" fill="#fbfaf1"/><circle cx="48" cy="36" r="25" fill="${back ? hair : "#f3c8a1"}"/>${back ? '<path d="M29 49q19 12 38 0" fill="none" stroke="#8a735b"/>' : `<path d="M24 34q-3-25 22-25 27-3 27 25l-9-12-10 4-9-9-10 11z" fill="${hair}"/>${face}`}${palette === "haru" && !back ? '<path d="M25 29q-5 18 3 25M71 29q5 18-3 25" fill="none" stroke="#584033" stroke-width="6"/>' : ""}</g></svg>`;
}
export function characterDataUrl(
  avatarVersion: string,
  direction: Direction = "front",
  action: CityAction = "idle",
  frame = 0,
) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(characterIllustration(avatarVersion, direction, action, frame))}`;
}

export const townIllustration = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600" viewBox="0 0 960 600">
<rect width="960" height="600" fill="#e2eedc"/><path d="M0 335h960v55H0zM195 335h55v265h-55zM710 335h55v265h-55zM195 480h570v52H195z" fill="#f5e5c6"/><path d="M0 350h960M215 390v210M745 390v210M250 515h460" fill="none" stroke="#d6c4a2" stroke-width="2" stroke-dasharray="7 12"/>
<g stroke="#405347" stroke-width="3" stroke-linejoin="round">
<rect x="62" y="156" width="210" height="142" rx="8" fill="#f7dfb5"/><path d="M43 159l125-85 126 85z" fill="#d78466"/><rect x="83" y="203" width="48" height="53" rx="5" fill="#b9dfe0"/><rect x="201" y="203" width="48" height="53" rx="5" fill="#b9dfe0"/><rect x="146" y="225" width="42" height="73" rx="5" fill="#789c86"/><path d="M71 193h193v22H71z" fill="#fff8e6"/><path d="M88 193v22m30-22v22m30-22v22m30-22v22m30-22v22m30-22v22" stroke="#d78466" stroke-width="14"/>
<rect x="357" y="150" width="230" height="140" rx="8" fill="#f1eade"/><path d="M339 153l133-70 133 70z" fill="#7d9fa0"/><rect x="389" y="195" width="51" height="55" rx="4" fill="#bddedb"/><rect x="504" y="195" width="51" height="55" rx="4" fill="#bddedb"/><path d="M415 196v54m-26-27h51m90-27v54m-26-27h51" stroke="#7d9fa0"/><rect x="455" y="226" width="35" height="64" rx="4" fill="#b68b69"/>
<rect x="694" y="174" width="201" height="125" rx="8" fill="#eacbc2"/><path d="M677 178l116-76 120 76z" fill="#a47988"/><rect x="714" y="219" width="53" height="48" rx="5" fill="#b9dfe0"/><rect x="817" y="220" width="45" height="79" rx="5" fill="#f5e8cf"/>
<ellipse cx="483" cy="439" rx="68" ry="27" fill="#9cbab0"/><ellipse cx="483" cy="432" rx="66" ry="24" fill="#b4dedc"/><path d="M483 430v-39m-14 7q14-24 28 0" fill="none" stroke="#79b8bf" stroke-width="5"/>
<path d="M110 312v61m735-48v54M86 466v72m782-73v73" stroke="#9d7d59" stroke-width="14"/>
<g fill="#91b78a"><circle cx="108" cy="291" r="34"/><circle cx="84" cy="305" r="24"/><circle cx="132" cy="307" r="25"/><circle cx="846" cy="305" r="34"/><circle cx="820" cy="315" r="24"/><circle cx="870" cy="320" r="25"/><circle cx="85" cy="455" r="37"/><circle cx="60" cy="473" r="26"/><circle cx="108" cy="475" r="27"/><circle cx="867" cy="455" r="37"/><circle cx="842" cy="473" r="26"/><circle cx="891" cy="475" r="27"/></g>
<g fill="#b28d68"><rect x="325" y="425" width="65" height="12" rx="4"/><path d="M334 439v17m47-17v17"/><rect x="581" y="425" width="65" height="12" rx="4"/><path d="M590 439v17m47-17v17"/></g>
<g fill="#e7aa91"><circle cx="315" cy="552" r="7"/><circle cx="338" cy="559" r="7"/><circle cx="625" cy="552" r="7"/><circle cx="649" cy="559" r="7"/></g>
</g></svg>`;
