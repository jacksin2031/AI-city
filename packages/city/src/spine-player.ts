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

/** Caller must verify assets, bind the bundle's orientation policy and retain its atlas. */
export function createSpinePlayer(
  data: SkeletonData,
  canvas: HTMLCanvasElement,
  guard: (skeleton: Skeleton, direction: Direction) => void,
  skinName: string,
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
  const bounds = skeleton.getBoundsRect();
  const extent = Math.max(bounds.width, bounds.height);
  if (!Number.isFinite(extent) || extent <= 0) throw new Error("SPINE_EMPTY_BOUNDS");
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
