import type { Skeleton, Slot } from "@esotericsoftware/spine-canvas";
import type { Direction } from "./simulation";

type Policy = {
  skin: string;
  face_slots: string[];
  back_hide_slots: string[];
  front_order: string[] | null;
  ear_mode: string;
  has_skirt: boolean;
};

export function parseOrientationPolicy(input: unknown): Policy {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("SPINE_POLICY_INVALID");
  const value = input as Record<string, unknown>;
  const names = (v: unknown): v is string[] =>
    Array.isArray(v) &&
    v.length <= 100 &&
    v.every((s) => typeof s === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(s));
  if (
    typeof value.skin !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(value.skin) ||
    !names(value.face_slots) ||
    (value.back_hide_slots !== undefined && !names(value.back_hide_slots)) ||
    (value.front_order !== undefined && !names(value.front_order)) ||
    (value.has_skirt !== undefined && typeof value.has_skirt !== "boolean") ||
    (value.ear_mode !== undefined && typeof value.ear_mode !== "string")
  )
    throw new Error("SPINE_POLICY_INVALID");
  return {
    skin: value.skin,
    face_slots: value.face_slots,
    back_hide_slots: (value.back_hide_slots as string[] | undefined) ?? [],
    front_order: (value.front_order as string[] | undefined) ?? null,
    ear_mode: (value.ear_mode as string | undefined) ?? "",
    has_skirt: value.has_skirt === true,
  };
}

/** Equivalent to the tool's orientation.js; never execute scripts from an uploaded bundle. */
export function applySpineOrientation(rig: Skeleton, direction: Direction, policy: Policy): void {
  if (rig.skin?.name !== policy.skin) throw new Error("SPINE_POLICY_SKIN_MISMATCH");
  if (!policy.front_order && direction !== "back") return;
  if (direction === "back")
    for (const name of [...policy.face_slots, ...policy.back_hide_slots])
      rig.findSlot(name)?.pose.setAttachment(null);
  else rig.findSlot("back-hair")?.pose.setAttachment(null);
  const hair = rig.findSlot(direction === "back" ? "back-hair" : "hair-front");
  if (hair)
    hair.pose.setAttachment(
      rig.getAttachment(hair.data.index, direction === "back" ? "back-hair" : "hair-front"),
    );
  const ears = [rig.findSlot("ear-l"), rig.findSlot("ear-r")].filter(
    (slot): slot is Slot => slot !== null,
  );
  for (const ear of ears)
    ear.pose.setAttachment(
      policy.ear_mode === "INTEGRATED_SMALL_EARS_IN_HAIR" || direction === "back"
        ? null
        : rig.getAttachment(ear.data.index, "ear"),
    );
  const skirt = rig.findSlot("skirt");
  if (policy.has_skirt && skirt)
    skirt.pose.setAttachment(
      rig.getAttachment(skirt.data.index, direction === "back" ? "skirt-back" : "skirt"),
    );
  const order = rig.drawOrder.pose;
  const torso = ["body", ...(policy.has_skirt ? ["skirt"] : [])],
    arms = ["arm-r", "arm-l"];
  const group = (direction === "back" ? [...arms, ...torso] : [...torso, ...arms])
    .map((name) => rig.findSlot(name))
    .filter((slot): slot is Slot => slot !== null);
  const remove = (slot: Slot) => {
    const i = order.indexOf(slot);
    if (i >= 0) order.splice(i, 1);
  };
  for (const slot of group) remove(slot);
  const heads = new Set(["head-base", "ear-l", "ear-r", "hair-front", ...policy.face_slots]);
  let index = order.findIndex((slot) => heads.has(slot.data.name));
  order.splice(index < 0 ? order.length : index, 0, ...group);
  for (const ear of ears) remove(ear);
  const anchor = new Set(["head-base", "hair-front", ...policy.face_slots]);
  index = order.findIndex((slot) => anchor.has(slot.data.name));
  order.splice(index < 0 ? order.length : index, 0, ...ears);
  if (direction === "back") {
    const head = rig.findSlot("head-base"),
      backHair = rig.findSlot("back-hair");
    if (head && backHair && order.indexOf(backHair) < order.indexOf(head)) {
      remove(backHair);
      order.splice(order.indexOf(head) + 1, 0, backHair);
    }
  }
}
