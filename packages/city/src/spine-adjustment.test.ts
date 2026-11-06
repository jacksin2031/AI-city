import {
  type Skeleton,
  type SkeletonData,
  SkeletonJson,
  Skeleton as SpineSkeleton,
} from "@esotericsoftware/spine-canvas";
import { describe, expect, it } from "vitest";
import { applySpineAdjustment } from "./spine-adjustment";

function make(): { skeleton: Skeleton; data: SkeletonData } {
  const data = new SkeletonJson({
    newRegionAttachment: () => {
      throw new Error("none");
    },
  } as never).readSkeletonData(
    JSON.stringify({
      skeleton: { spine: "4.3.13" },
      bones: [{ name: "root" }, { name: "hair-front", parent: "root", x: 5, y: 7 }],
    }),
  );
  const skeleton = new SpineSkeleton(data);
  skeleton.setupPose();
  return { skeleton, data };
}
const raw = (s: Skeleton) =>
  s.findBone("hair-front") as NonNullable<ReturnType<Skeleton["findBone"]>>;
const hair = (dx: number, dy: number, scale: number) => ({
  version: 1 as const,
  parts: { hair: { dx, dy, scale } },
});

describe("applySpineAdjustment", () => {
  it("moves by a fraction of the height and scales", () => {
    const { skeleton } = make();
    applySpineAdjustment(skeleton, hair(0.1, 0.1, 1.2), 200);
    expect(raw(skeleton).pose.x).toBeCloseTo(5 + 20);
    expect(raw(skeleton).pose.y).toBeCloseTo(7 + 20);
    expect(raw(skeleton).pose.scaleX).toBeCloseTo(1.2);
    expect(raw(skeleton).pose.scaleY).toBeCloseTo(1.2);
  });
  it("is a no-op for null or undefined", () => {
    const { skeleton } = make();
    applySpineAdjustment(skeleton, null, 200);
    applySpineAdjustment(skeleton, undefined, 200);
    expect([raw(skeleton).pose.x, raw(skeleton).pose.y, raw(skeleton).pose.scaleX]).toEqual([
      5, 7, 1,
    ]);
  });
  it("ignores missing bones", () => {
    const { skeleton } = make();
    expect(() =>
      applySpineAdjustment(
        skeleton,
        { version: 1, parts: { handLeft: { dx: 0.1, dy: 0, scale: 1 } } },
        200,
      ),
    ).not.toThrow();
    expect(raw(skeleton).pose.x).toBe(5);
  });
  it("does not drift across frames, re-posed or not", () => {
    const { skeleton } = make();
    const adj = hair(0.1, 0.1, 1.2);
    applySpineAdjustment(skeleton, adj, 200);
    skeleton.setupPose(); // frame 2 re-poses
    applySpineAdjustment(skeleton, adj, 200);
    expect(raw(skeleton).pose.x).toBeCloseTo(25);
    expect(raw(skeleton).pose.scaleX).toBeCloseTo(1.2);
    // un-keyed bone: pose not reset between frames
    applySpineAdjustment(skeleton, adj, 200);
    applySpineAdjustment(skeleton, adj, 200);
    expect(raw(skeleton).pose.x).toBeCloseTo(25);
    expect(raw(skeleton).pose.scaleY).toBeCloseTo(1.2);
    // adjustment removed: back to the base pose
    applySpineAdjustment(skeleton, null, 200);
    expect(raw(skeleton).pose.x).toBeCloseTo(5);
  });
});
