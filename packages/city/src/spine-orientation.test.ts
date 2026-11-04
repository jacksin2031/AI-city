import type { Skeleton } from "@esotericsoftware/spine-canvas";
import { describe, expect, it, vi } from "vitest";
import { applySpineOrientation, parseOrientationPolicy } from "./spine-orientation";

describe("Spine orientation policy", () => {
  const policy = {
    skin: "test",
    face_slots: ["face"],
    back_hide_slots: ["hair-front"],
    front_order: ["body"],
    has_skirt: false,
  };
  it("rejects malformed policy before it reaches the renderer", () => {
    expect(() => parseOrientationPolicy({ ...policy, face_slots: [3] })).toThrow();
    expect(parseOrientationPolicy(policy).skin).toBe("test");
  });
  it("hides face and front hair from the back and preserves the head order", () => {
    const slot = (name: string) => ({ data: { name, index: 0 }, pose: { setAttachment: vi.fn() } });
    const slots = ["body", "arm-r", "arm-l", "head-base", "back-hair", "hair-front", "face"].map(
      slot,
    );
    const findSlot = (name: string) => slots.find((item) => item.data.name === name) ?? null;
    const skeleton = {
      skin: { name: "test" },
      findSlot,
      getAttachment: () => null,
      drawOrder: { pose: [...slots] },
    } as unknown as Skeleton;
    applySpineOrientation(skeleton, "back", parseOrientationPolicy(policy));
    expect(findSlot("face")?.pose.setAttachment).toHaveBeenCalledWith(null);
    expect(findSlot("hair-front")?.pose.setAttachment).toHaveBeenCalledWith(null);
    const order = skeleton.drawOrder.pose.map((item) => item.data.name);
    expect(order.indexOf("arm-r")).toBeLessThan(order.indexOf("body"));
    expect(order.indexOf("head-base")).toBeLessThan(order.indexOf("back-hair"));
  });
});
