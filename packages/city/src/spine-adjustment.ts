import type { SpineAdjustment, SpinePart } from "@ai-city/contracts/spine";
import type { Bone, Skeleton } from "@esotericsoftware/spine-canvas";

/**
 * Left/right follow the character's own side: `handLeft` is the bone named `-l`. The official
 * sample is mirrored on screen (see `chibiAnimationForScreen`: its `-left` animation is shown
 * as screen-right), so for it `handLeft` appears on the viewer's right. Generated characters are
 * expected to follow the same naming; this must be verified against a real generated skeleton.
 */
export const SPINE_PART_BONES: Record<SpinePart, string[]> = {
  hair: ["hair-front", "hair-back-long-middle"],
  handLeft: ["arm-down-l"],
  handRight: ["arm-down-r"],
  footLeft: ["leg-target-l"],
  footRight: ["leg-target-r"],
};

type Pose = { x: number; y: number; scaleX: number; scaleY: number };
const applied = new WeakMap<Bone, { base: Pose; result: Pose }>();

/** Spine 4.3 keeps the unconstrained local pose, which animations write, on `bone.pose`. */
const read = (bone: Bone): Pose => ({
  x: bone.pose.x,
  y: bone.pose.y,
  scaleX: bone.pose.scaleX,
  scaleY: bone.pose.scaleY,
});
const write = (bone: Bone, pose: Pose): void => {
  bone.pose.x = pose.x;
  bone.pose.y = pose.y;
  bone.pose.scaleX = pose.scaleX;
  bone.pose.scaleY = pose.scaleY;
};
const same = (a: Pose, b: Pose) =>
  a.x === b.x && a.y === b.y && a.scaleX === b.scaleX && a.scaleY === b.scaleY;

/**
 * Additive per-part tweak on the current pose. Call after animation and orientation guard, before
 * updateWorldTransform. Un-keyed bones keep their value between frames, so the pre-adjust pose is
 * remembered and restored when the bone still holds our own result; otherwise (animation or
 * setupPose rewrote it) the current value is the new base. This prevents drift either way.
 */
export function applySpineAdjustment(
  skeleton: Skeleton,
  adjustment: SpineAdjustment | null | undefined,
  height: number,
): void {
  for (const [part, names] of Object.entries(SPINE_PART_BONES) as [SpinePart, string[]][]) {
    const tweak = adjustment?.parts[part];
    for (const name of names) {
      const bone = skeleton.findBone(name);
      if (!bone) continue;
      const memo = applied.get(bone);
      const now = read(bone);
      const base = memo && same(now, memo.result) ? memo.base : now;
      if (!tweak) {
        if (memo) {
          write(bone, base);
          applied.delete(bone);
        }
        continue;
      }
      write(bone, {
        x: base.x + tweak.dx * height,
        y: base.y + tweak.dy * height,
        scaleX: base.scaleX * tweak.scale,
        scaleY: base.scaleY * tweak.scale,
      });
      applied.set(bone, { base, result: read(bone) });
    }
  }
}
