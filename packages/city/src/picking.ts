/** A resident's drawn body projected into the 960x600 scene screen space. */
export interface PickTarget {
  id: string;
  /** Centre of the drawn body. */
  x: number;
  y: number;
  /** Drawn size of the sprite. */
  width: number;
  height: number;
}

export interface PickOptions {
  /** Smallest tappable width and height, in scene screen units. */
  minWidth: number;
  minHeight: number;
  /**
   * When true the expanded (padded) area is ignored and only the drawn body counts. The scene
   * sets this where the tap lands on a building, so a resident's larger hit area never steals
   * a building tap.
   */
  exactOnly?: boolean;
}

/**
 * Chooses the resident under a tap. A tap on a drawn body always wins. Otherwise each resident
 * gets a hit area at least `minWidth` x `minHeight` around their body (so small or distant
 * residents are still easy to hit) and the nearest centre wins, which keeps neighbouring hit
 * areas from overlapping. Returns null when nothing is close enough.
 */
export function pickResident(
  targets: readonly PickTarget[],
  point: { x: number; y: number },
  options: PickOptions,
): string | null {
  let exact: { id: string; distance: number } | null = null;
  let padded: { id: string; distance: number } | null = null;
  for (const target of targets) {
    const dx = Math.abs(point.x - target.x);
    const dy = Math.abs(point.y - target.y);
    const halfW = target.width / 2;
    const halfH = target.height / 2;
    // Normalised so wide and tall hit areas compare fairly.
    const distance = Math.hypot(dx / Math.max(halfW, 1), dy / Math.max(halfH, 1));
    if (dx <= halfW && dy <= halfH) {
      if (!exact || distance < exact.distance) exact = { id: target.id, distance };
      continue;
    }
    if (options.exactOnly) continue;
    const paddedW = Math.max(halfW, options.minWidth / 2);
    const paddedH = Math.max(halfH, options.minHeight / 2);
    if (dx <= paddedW && dy <= paddedH) {
      const normalised = Math.hypot(dx / paddedW, dy / paddedH);
      if (!padded || normalised < padded.distance) padded = { id: target.id, distance: normalised };
    }
  }
  return exact?.id ?? padded?.id ?? null;
}
