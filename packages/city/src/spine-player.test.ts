import { Animation, BoneData, Skeleton, SkeletonData, Skin } from "@esotericsoftware/spine-canvas";
import { describe, expect, it, vi } from "vitest";
import { createSpinePlayer } from "./spine-player";

describe("Spine city player", () => {
  it("rejects missing required animation and missing canvas context", () => {
    const data = new SkeletonData();
    const canvas = { width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement;
    expect(() => createSpinePlayer(data, canvas, () => {}, "synthetic")).toThrow(
      "SPINE_CANVAS_UNAVAILABLE",
    );
    const context = { getContext: () => ({}) } as unknown as HTMLCanvasElement;
    expect(() => createSpinePlayer(data, context, () => {}, "synthetic")).toThrow(
      "SPINE_ANIMATION_MISSING",
    );
  });
  it("advances a synthetic Spine skeleton and applies its direction guard", () => {
    const data = new SkeletonData();
    data.bones.push(new BoneData(0, "root", null));
    data.skins.push(new Skin("synthetic"));
    for (const dir of ["front", "back", "left", "right"])
      for (const action of ["idle", "trot"])
        data.animations.push(new Animation(`movement/${action}-${dir}`, [], 1));
    const bounds = vi
      .spyOn(Skeleton.prototype, "getBoundsRect")
      .mockReturnValue({ x: 0, y: 0, width: 10, height: 20 });
    const ctx = { setTransform: vi.fn(), clearRect: vi.fn(), translate: vi.fn(), scale: vi.fn() };
    const canvas = { getContext: () => ctx, width: 0, height: 0 } as unknown as HTMLCanvasElement;
    const guard = vi.fn();
    try {
      const player = createSpinePlayer(data, canvas, guard, "synthetic");
      player.advance("movement/trot-left", "left", 0.1);
      expect(guard).toHaveBeenLastCalledWith(expect.any(Skeleton), "left");
      expect(ctx.clearRect).toHaveBeenCalled();
      player.dispose();
    } finally {
      bounds.mockRestore();
    }
  });
});
