import { BOUNDS } from "./world";

// Two coordinate systems: the world in metres (x east, y south, height up) and the 960×600
// "screen" in which the HTML overlay and speech card are laid out. The 3D canvas keeps that
// aspect; the pixel size stays inside the renderer.
export const SCREEN = { width: 960, height: 600 } as const;
/** Screen units per metre for the normal tour view: about 120 m across. */
export const DEFAULT_ZOOM = SCREEN.width / 120;
/** Far enough out to see most of the district. */
export const MIN_ZOOM = SCREEN.width / 650;
export const MAX_ZOOM = DEFAULT_ZOOM * 6;
/** How much a profile enlarges the resident relative to the tour view. */
export const PROFILE_MAGNIFICATION = 5;
/** Residents stand 2.2 m tall: a little larger than life so faces read at street scale. */
export const RESIDENT_HEIGHT = 2.2;
/** A resident's artwork is 96×128 units. */
export const RESIDENT_METRES_PER_UNIT = RESIDENT_HEIGHT / 128;

/**
 * A fixed orthographic view from the north-west, 35° above the horizon, like the Blender
 * scene's own camera: the camera sits at `toCamera` from the point it looks at.
 */
const elevation = (35 * Math.PI) / 180;
const azimuth = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
type Vector = { x: number; y: number; height: number };
export const VIEW: { toCamera: Vector; right: Vector; up: Vector; groundUp: number } = {
  toCamera: {
    x: Math.cos(elevation) * azimuth.x,
    y: Math.cos(elevation) * azimuth.y,
    height: Math.sin(elevation),
  },
  right: { x: azimuth.y, y: -azimuth.x, height: 0 },
  up: {
    x: -Math.sin(elevation) * azimuth.x,
    y: -Math.sin(elevation) * azimuth.y,
    height: Math.cos(elevation),
  },
  /** Screen units a ground step of one metre away from the camera rises, per unit of zoom. */
  groundUp: Math.sin(elevation),
};

export type ScenePresentation = { id: string; kind: "welcome" | "profile" };
export type SceneTransform = { x: number; y: number; scale: number };
/** The point the camera looks at, in metres, and zoom in screen units per metre. */
export type SceneCamera = { centerX: number; centerY: number; height: number; zoom: number };
export type ScenePresentationFrame = SceneTransform &
  ScenePresentation & {
    pose: "idle" | "wave" | "sit";
    frame: number;
    worldX: number;
    worldY: number;
    /** Magnification relative to the tour view. */
    cameraZoom: number;
    /** Generic description of what the resident is doing in town; never resident-supplied text. */
    activity: string;
  };
type Placed = { x: number; y: number; height: number };

/** Keep the view inside the district. */
export function clampCamera(camera: SceneCamera): SceneCamera {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom));
  const margin = 40;
  const clamp = (value: number, low: number, size: number) =>
    Math.min(low + size - margin, Math.max(low + margin, value));
  return {
    ...camera,
    zoom,
    centerX: clamp(camera.centerX, BOUNDS.x0, BOUNDS.width),
    centerY: clamp(camera.centerY, BOUNDS.y0, BOUNDS.depth),
  };
}

/** Visual placement only: never changes the resident's route or saved city position. */
export function focusCamera(
  actor: Placed,
  kind: ScenePresentation["kind"] | null,
  base: SceneCamera,
): SceneCamera {
  if (kind === "profile") {
    const zoom = DEFAULT_ZOOM * PROFILE_MAGNIFICATION;
    // The resident lands at screen (480, 490), leaving room for the card above the head.
    // Not clamped: a resident at the district edge still ends up under the card.
    return { ...above(actor, 190 / zoom), zoom };
  }
  if (kind === "welcome") return { ...above(actor, 4), zoom: DEFAULT_ZOOM * 1.4 };
  return base;
}

/** The automatic tour's own view of a resident: closer than the street tour, wider than a profile. */
export const TOUR_FOCUS_ZOOM = DEFAULT_ZOOM * 2;
/** Screen-space metres above a resident's feet that the tour centres on. */
const TOUR_FOCUS_LIFT = 2.5;

/**
 * The automatic tour's view of a resident. The tour keeps looking at participants rather than
 * landmarks, so it frames them the way a portrait would — centred, feet low, headroom above —
 * while staying wide enough that the street around them still reads.
 */
export function tourCamera(actor: Placed): SceneCamera {
  return clampCamera({ ...above(actor, TOUR_FOCUS_LIFT), zoom: TOUR_FOCUS_ZOOM });
}

/** The four drawings a resident can be shown with, relative to the fixed camera. */
export type Facing = "front" | "left" | "back" | "right";

/**
 * Which drawing faces the viewer. The camera never rotates, so a resident's heading is turned
 * into two screen-space components: across the view and into it. A walker shows a profile
 * whenever they are moving across the screen at all; only a heading almost straight at or away
 * from the camera shows a front or back drawing. This keeps the drawing consistent with the
 * direction the figure is seen to travel.
 */
export function facingFor(heading: number, walking: boolean): Facing {
  const fx = Math.cos(heading);
  const fy = Math.sin(heading);
  const right = fx * VIEW.right.x + fy * VIEW.right.y;
  const length = Math.hypot(VIEW.toCamera.x, VIEW.toCamera.y);
  const toward = (fx * VIEW.toCamera.x + fy * VIEW.toCamera.y) / length;
  const across = Math.abs(right);
  const into = Math.abs(toward);
  // A walker turns to a profile as soon as they are moving across screen at all; a stationary
  // resident keeps the front or back drawing until the angle is clearer.
  const profileAt = walking ? 0.18 : 0.5;
  if (across >= profileAt || across >= into * (walking ? 0.45 : 1.2))
    return right > 0 ? "right" : "left";
  return toward > 0 ? "front" : "back";
}

/** The point that projects `metres` (in screen space) straight above the actor. */
export function above(actor: Placed, metres: number) {
  return {
    centerX: actor.x + VIEW.up.x * metres,
    centerY: actor.y + VIEW.up.y * metres,
    height: actor.height + VIEW.up.height * metres,
  };
}

/** Orthographic projection from metres to the 960×600 screen. */
export function project(point: Placed, camera: SceneCamera): { x: number; y: number } {
  const dx = point.x - camera.centerX;
  const dy = point.y - camera.centerY;
  const dh = point.height - camera.height;
  const along = (axis: Vector) => dx * axis.x + dy * axis.y + dh * axis.height;
  return {
    x: SCREEN.width / 2 + along(VIEW.right) * camera.zoom,
    y: SCREEN.height / 2 - along(VIEW.up) * camera.zoom,
  };
}

/** Pan so the ground under the finger follows a drag of (dx, dy) screen units. */
export function panCamera(camera: SceneCamera, dx: number, dy: number): SceneCamera {
  const sideways = -dx / camera.zoom;
  // Screen up is, on the ground, away from the camera.
  const away = dy / (camera.zoom * VIEW.groundUp);
  const length = Math.hypot(VIEW.toCamera.x, VIEW.toCamera.y);
  return clampCamera({
    ...camera,
    centerX: camera.centerX + VIEW.right.x * sideways - (VIEW.toCamera.x / length) * away,
    centerY: camera.centerY + VIEW.right.y * sideways - (VIEW.toCamera.y / length) * away,
  });
}

export function projectResident(actor: Placed, camera: SceneCamera, scale: number): SceneTransform {
  return { ...project(actor, camera), scale: scale * camera.zoom };
}

export function speechBounds(pose: SceneTransform, kind: ScenePresentation["kind"]) {
  const width = kind === "profile" ? 420 : 312;
  // Tall enough for the nickname, activity, two chip rows and the note beside the hexagon.
  const height = kind === "profile" ? 246 : 100;
  return {
    x: Math.max(8, Math.min(952 - width, pose.x - width / 2)),
    y: Math.max(8, pose.y - pose.scale * 128 - 12 - height),
    width,
    height,
  };
}
