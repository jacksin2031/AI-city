export type ScenePresentation = { id: string; kind: "welcome" | "profile" };
export type SceneTransform = { x: number; y: number; scale: number };
export type SceneCamera = { scrollX: number; scrollY: number; zoom: number };
export type ScenePresentationFrame = SceneTransform &
  ScenePresentation & {
    pose: "idle" | "wave";
    frame: number;
    worldX: number;
    worldY: number;
    cameraZoom: number;
  };

/** Visual placement only: never changes the resident's route or saved city position. */
export function focusCamera(
  actor: { x: number; y: number },
  kind: ScenePresentation["kind"] | null,
): SceneCamera {
  return kind === "profile"
    ? { scrollX: actor.x - 480, scrollY: actor.y - 300 - 190 / 2, zoom: 2 }
    : { scrollX: 0, scrollY: 0, zoom: 1 };
}

/** Phaser's centred camera projection; sprite and route remain in world coordinates. */
export function projectResident(
  actor: { x: number; y: number },
  camera: SceneCamera,
  scale: number,
): SceneTransform {
  return {
    x: (actor.x - camera.scrollX - 480) * camera.zoom + 480,
    y: (actor.y - camera.scrollY - 300) * camera.zoom + 300,
    scale: scale * camera.zoom,
  };
}

export function speechBounds(pose: SceneTransform, kind: ScenePresentation["kind"]) {
  const width = kind === "profile" ? 420 : 312;
  const height = kind === "profile" ? 220 : 100;
  return {
    x: Math.max(8, Math.min(952 - width, pose.x - width / 2)),
    y: Math.max(8, pose.y - pose.scale * 128 - 12 - height),
    width,
    height,
  };
}
