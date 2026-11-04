import type { CityAction, Direction } from "./simulation";

/** A canvas owned by one resident. This interface does not load or authorize assets. */
export interface AnimatedCharacter {
  canvas: HTMLCanvasElement;
  advance(animation: string, direction: Direction, seconds: number): void;
  dispose(): void;
}

export function animationFor(
  action: CityAction,
  direction: Direction,
  presenting: boolean,
): string {
  return `movement/${!presenting && action === "walk" ? "trot" : "idle"}-${presenting ? "front" : direction}`;
}
