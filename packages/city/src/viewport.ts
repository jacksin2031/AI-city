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

/** Check the visible crop rather than the full canvas, leaving a small edge margin. */
export function pointInVisibleCity(
  point: { x: number; y: number },
  width: number,
  height: number,
  cover: boolean,
): boolean {
  if (width <= 0 || height <= 0) return false;
  const layout = cityViewport(width, height, cover);
  const left = Math.max(0, -layout.left / layout.scale);
  const top = Math.max(0, -layout.top / layout.scale);
  const right = Math.min(SCREEN.width, (width - layout.left) / layout.scale);
  const bottom = Math.min(SCREEN.height, (height - layout.top) / layout.scale);
  const marginX = (right - left) * 0.1;
  const marginY = (bottom - top) * 0.1;
  return (
    point.x >= left + marginX &&
    point.x <= right - marginX &&
    point.y >= top + marginY &&
    point.y <= bottom - marginY
  );
}

/** Select the next tour stop containing a resident; null means follow a resident instead. */
export function nextVisibleTourIndex(
  current: number,
  count: number,
  hasResident: (index: number) => boolean,
): number | null {
  for (let offset = 1; offset <= count; offset++) {
    const index = (current + offset) % count;
    if (hasResident(index)) return index;
  }
  return null;
}

/**
 * Choose the next resident the automatic tour should look at. The tour prefers a participant
 * over a landmark, so it walks the candidate list and takes the first one that is not already
 * held in the middle of the frame; `current` is the previously chosen resident, or null.
 * Returns the index into `ids`, or null when there is nobody to look at.
 */
export function nextResidentTourIndex(
  ids: readonly string[],
  current: string | null,
): number | null {
  if (ids.length === 0) return null;
  const start = current === null ? -1 : ids.indexOf(current);
  for (let offset = 1; offset <= ids.length; offset++) {
    const index = (start + offset + ids.length) % ids.length;
    if (ids[index] !== current || ids.length === 1) return index;
  }
  return 0;
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
