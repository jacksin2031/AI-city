import { SCREEN } from "./focus";

/** Canvas size and centred offset, preserving the logical 960 × 600 scene aspect. */
export function cityViewport(width: number, height: number, cover: boolean) {
  const scale = (cover ? Math.max : Math.min)(width / SCREEN.width, height / SCREEN.height);
  const canvasWidth = SCREEN.width * scale;
  const canvasHeight = SCREEN.height * scale;
  return {
    width: canvasWidth,
    height: canvasHeight,
    left: (width - canvasWidth) / 2,
    top: (height - canvasHeight) / 2,
    scale,
  };
}

/** Keep the profile card in the visible part of a cropped scene. */
export function clampSpeechToViewport(
  bounds: { x: number; y: number; width: number; height: number },
  width: number,
  height: number,
) {
  const layout = cityViewport(width, height, true);
  const left = -layout.left / layout.scale;
  const top = -layout.top / layout.scale;
  const visibleWidth = width / layout.scale;
  const visibleHeight = height / layout.scale;
  const cardWidth = Math.min(bounds.width, Math.max(1, visibleWidth - 16));
  const cardHeight = Math.min(bounds.height, Math.max(1, visibleHeight - 16));
  return {
    x: Math.max(left + 8, Math.min(left + visibleWidth - cardWidth - 8, bounds.x)),
    y: Math.max(top + 8, Math.min(top + visibleHeight - cardHeight - 8, bounds.y)),
    width: cardWidth,
    height: cardHeight,
  };
}
