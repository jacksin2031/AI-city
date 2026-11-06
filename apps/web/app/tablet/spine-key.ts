import type { SpineAdjustment } from "@ai-city/contracts";

/** Identity of one character's player: the shared bundle plus the saved adjustment. */
export function spineBundleKey(
  avatarVersion: string,
  adjustment: SpineAdjustment | undefined | null,
) {
  return `${avatarVersion}:${JSON.stringify(adjustment ?? null)}`;
}

/**
 * Avatar versions whose live player was built with a different adjustment than the snapshot
 * now carries. `built` maps avatarVersion to the key its player was created with.
 */
export function staleSpineVersions(
  built: ReadonlyMap<string, string>,
  avatars: ReadonlyArray<{ manifest: { avatarVersion: string; adjustment?: SpineAdjustment } }>,
) {
  return avatars.flatMap(({ manifest }) => {
    const key = built.get(manifest.avatarVersion);
    return key !== undefined && key !== spineBundleKey(manifest.avatarVersion, manifest.adjustment)
      ? [manifest.avatarVersion]
      : [];
  });
}
