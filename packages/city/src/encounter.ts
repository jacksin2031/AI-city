import type { DialoguePlace } from "@ai-city/contracts";
import type { Actor } from "./simulation";
import type { Poi } from "./world";

const fictional = /^(fixture-sora|fixture-haru|preset-(aoi|kaede|minato|hinata|yui|ren))$/;
const cooldowns: Record<string, number> = {
  好奇心いっぱい: 60,
  街を探検中: 75,
  散歩が好き: 90,
  音楽好き: 90,
  のんびり探検家: 120,
  のんびり屋: 165,
  おだやか: 180,
};
export function dialogueCooldown(personality: string): number {
  return cooldowns[personality] ?? 120;
}
const knownPlaces: Record<string, DialoguePlace> = {
  "jr-hijiri": "station",
  "jr-ocha": "station",
  subway: "station",
  bridge: "bridge",
  photo: "bridge",
  riverwalk: "river",
  "sola-plaza": "sola",
  "sola-stage": "sola",
  nikolai: "nikolai",
  yushima: "yushima",
  meiji: "meiji",
};
export function encounterPlace(a: Actor, b: Actor, pois: Poi[]): DialoguePlace {
  const x = (a.x + b.x) / 2,
    y = (a.y + b.y) / 2;
  let distance = 35;
  let place: DialoguePlace = "street";
  for (const poi of pois) {
    const mapped = knownPlaces[poi.id];
    if (!mapped) continue;
    const next = Math.hypot(poi.x - x, poi.y - y);
    if (next < distance) {
      distance = next;
      place = mapped;
    }
  }
  return place;
}
export function findEncounter(
  residents: { id: string; actor: Actor; personality?: string }[],
  selected: string | null,
  ground: (x: number, y: number) => number,
  now = 0,
  lastSpoke: ReadonlyMap<string, number> = new Map(),
): [string, string] | null {
  const candidates = residents.filter(
    ({ id, actor, personality }) =>
      fictional.test(id) &&
      id !== selected &&
      actor.action !== "visit" &&
      !actor.waitingForSignal &&
      now - (lastSpoke.get(id) ?? -Infinity) >= dialogueCooldown(personality ?? ""),
  );
  for (let i = 0; i < candidates.length; i++)
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i],
        b = candidates[j];
      if (
        a &&
        b &&
        Math.hypot(a.actor.x - b.actor.x, a.actor.y - b.actor.y) <= 8 &&
        Math.abs(ground(a.actor.x, a.actor.y) - ground(b.actor.x, b.actor.y)) < 3
      )
        return [a.id, b.id];
    }
  return null;
}
