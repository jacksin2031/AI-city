import { PRESET_CHARACTERS } from "@ai-city/contracts/device-link";

const skins: Record<string, string> = Object.fromEntries(
  PRESET_CHARACTERS.map((preset) => [preset.id, preset.officialSkin]),
);

/**
 * The official Spine skin a resident is drawn with, or null for an ordinary resident.
 * Admin presets carry the character in their id (preset-aoi, preset-aoi-2); a participant who
 * joined as a prepared character has a generated id and carries it in the avatar version
 * (sample-aoi-v1) instead.
 */
export function officialSkinFor(resident: {
  residentId: string;
  avatarVersion: string;
}): string | null {
  const id =
    /^preset-([a-z]+)(?:-\d+)?$/.exec(resident.residentId)?.[1] ??
    /^sample-([a-z]+)-v1$/.exec(resident.avatarVersion)?.[1];
  return (id && skins[id]) || null;
}
