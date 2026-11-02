import type { Actor } from "./simulation";

const fictional = /^(fixture-sora|fixture-haru|preset-(aoi|kaede|minato|hinata|yui|ren))$/;
export function findEncounter(
  residents: { id: string; actor: Actor }[],
  selected: string | null,
  ground: (x: number, y: number) => number,
): [string, string] | null {
  const candidates = residents.filter(
    ({ id, actor }) =>
      fictional.test(id) && id !== selected && actor.action !== "visit" && !actor.waitingForSignal,
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
