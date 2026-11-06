/** Conservative render budgets for the exhibition's high-DPI tablets. */
export const CHARACTER_REFRESH_SECONDS = 1 / 15;

/** DPR 2 paints four times as many pixels as DPR 1; 1.5 retains sharp UI-sized sprites. */
export function cityPixelRatio(devicePixelRatio: number): number {
  return Number.isFinite(devicePixelRatio) ? Math.max(1, Math.min(devicePixelRatio, 1.5)) : 1;
}

/** A 4096² shadow needs 16 million texels before any colour/depth passes. */
export function cityShadowMapSize(viewportWidth: number, maximumTextureSize: number): number {
  const viewportCap = viewportWidth < 900 ? 1024 : 2048;
  return Math.min(viewportCap, Math.max(256, maximumTextureSize));
}

/** Canvas-backed Spine characters need repainting on pose changes, not every WebGL frame. */
export function shouldDrawCharacter(
  lastDrawnAt: number,
  lastAnimation: string,
  animation: string,
  sceneTime: number,
  moving: boolean,
): boolean {
  return (
    lastAnimation !== animation || (moving && sceneTime - lastDrawnAt >= CHARACTER_REFRESH_SECONDS)
  );
}

/** Compare average rendered frame time, not an individual delayed rAF callback. */
export function shouldDegradeCityQuality(
  durationMs: number,
  renderedFrames: number,
  frameBudgetSeconds: number,
): boolean {
  return renderedFrames > 0 && durationMs / renderedFrames > frameBudgetSeconds * 1000 * 1.4;
}
