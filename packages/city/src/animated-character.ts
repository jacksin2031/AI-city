import type { CityAction, Direction } from "./simulation";

/** A canvas owned by one resident. This interface does not load or authorize assets. */
export interface AnimatedCharacter {
  canvas: HTMLCanvasElement;
  advance(animation: string, direction: Direction, seconds: number): void;
  dispose(): void;
}

/** Preserve the source texture's proportions; legacy artwork is 96 by 128. */
export function characterAspect(canvas: { width: number; height: number } | undefined): number {
  return canvas && canvas.width > 0 && canvas.height > 0 ? canvas.width / canvas.height : 0.75;
}

export function animationFor(
  action: CityAction,
  direction: Direction,
  presenting: boolean,
): string {
  return `movement/${!presenting && action === "walk" ? "trot" : "idle"}-${presenting ? "front" : direction}`;
}
