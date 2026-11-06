import type { SpineAdjustment } from "@ai-city/contracts/spine";
import {
  AnimationState,
  AnimationStateData,
  Physics,
  Skeleton,
  type SkeletonData,
  SkeletonRenderer,
} from "@esotericsoftware/spine-canvas";
import type { AnimatedCharacter } from "./animated-character";
import type { Direction } from "./simulation";
import { applySpineAdjustment } from "./spine-adjustment";

type Rect = { x: number; y: number; width: number; height: number };

/**
 * The drawing is framed once, so the frame must hold every pose the character can take. Framing
 * only the idle pose cut the head off while walking, when it bobs, tilts or shows its side.
 */
function unionMovementBounds(
  data: SkeletonData,
  skinName: string,
  guard: (skeleton: Skeleton, direction: Direction) => void,
  idle: Rect,
): Rect {
  let minX = idle.x;
  let minY = idle.y;
  let maxX = idle.x + idle.width;
  let maxY = idle.y + idle.height;
  const scratch = new Skeleton(data);
  scratch.setSkin(skinName);
  scratch.setupPose();
  const state = new AnimationState(new AnimationStateData(data));
  const samples = 12;
  for (const animation of data.animations) {
    if (!animation.name.startsWith("movement/")) continue;
    const direction = animation.name.split("-").pop() as Direction;
    state.setAnimation(0, animation.name, true);
    const step = Math.max(animation.duration, 0.1) / samples;
    for (let index = 0; index <= samples; index += 1) {
      scratch.update(step);
      state.update(step);
      state.apply(scratch);
      guard(scratch, direction);
      scratch.updateWorldTransform(Physics.update);
      const rect = scratch.getBoundsRect();
      if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) continue;
      minX = Math.min(minX, rect.x);
      minY = Math.min(minY, rect.y);
      maxX = Math.max(maxX, rect.x + rect.width);
      maxY = Math.max(maxY, rect.y + rect.height);
    }
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Caller must verify assets, bind the bundle's orientation policy and retain its atlas. */
export function createSpinePlayer(
  data: SkeletonData,
  canvas: HTMLCanvasElement,
  guard: (skeleton: Skeleton, direction: Direction) => void,
  skinName: string,
  adjustment?: SpineAdjustment,
): AnimatedCharacter {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("SPINE_CANVAS_UNAVAILABLE");
  for (const direction of ["front", "back", "left", "right"]) {
    for (const movement of ["idle", "trot"]) {
      if (!data.findAnimation(`movement/${movement}-${direction}`))
        throw new Error("SPINE_ANIMATION_MISSING");
    }
  }
  canvas.width = 256;
  canvas.height = 256;
  const skeleton = new Skeleton(data);
  if (!data.findSkin(skinName)) throw new Error("SPINE_SKIN_MISSING");
  skeleton.setSkin(skinName);
  skeleton.setupPose();
  const state = new AnimationState(new AnimationStateData(data));
  const renderer = new SkeletonRenderer(ctx);
  renderer.triangleRendering = true;
  let current = "movement/idle-front";
  state.setAnimation(0, current, true);
  state.apply(skeleton);
  guard(skeleton, "front");
  skeleton.updateWorldTransform(Physics.update);
  const bounds = unionMovementBounds(data, skinName, guard, skeleton.getBoundsRect());
  const extent = Math.max(bounds.width, bounds.height);
  if (!Number.isFinite(extent) || extent <= 0) throw new Error("SPINE_EMPTY_BOUNDS");
  // Framing deliberately ignores the adjustment: the figure must not rescale or shift in the
  // frame while a slider moves; the adjusted part may simply reach outside the fixed frame.
  const scale = 220 / extent;
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  return {
    canvas,
    advance(animation, direction, seconds) {
      if (!data.findAnimation(animation)) throw new Error("SPINE_ANIMATION_MISSING");
      if (animation !== current) {
        state.setAnimation(0, animation, true);
        current = animation;
      }
      const dt = Math.max(0, Math.min(seconds, 0.1));
      skeleton.update(dt);
      state.update(dt);
      state.apply(skeleton);
      guard(skeleton, direction);
      applySpineAdjustment(skeleton, adjustment, bounds.height);
      skeleton.updateWorldTransform(Physics.update);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, 256, 256);
      ctx.translate(128, 128);
      ctx.scale(scale, -scale);
      ctx.translate(-centerX, -centerY);
      renderer.draw(skeleton);
    },
    dispose() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, 256, 256);
    },
  };
}
