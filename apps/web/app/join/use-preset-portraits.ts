import { loadChibiDemo } from "@ai-city/city";
import { PRESET_CHARACTERS } from "@ai-city/contracts/device-link";
import { useEffect, useState } from "react";

/**
 * Draws each prepared character's official Spine skin once, so the picker and the participant's
 * card can show the real figure. A failure leaves the map empty and the page falls back to text.
 */
export function usePresetPortraits(): Record<string, string> {
  const [portraits, setPortraits] = useState<Record<string, string>>({});
  useEffect(() => {
    const controller = new AbortController();
    let assets: Awaited<ReturnType<typeof loadChibiDemo>> | undefined;
    void (async () => {
      try {
        assets = await loadChibiDemo(controller.signal);
        if (controller.signal.aborted) return;
        const next: Record<string, string> = {};
        for (const preset of PRESET_CHARACTERS) {
          const player = assets.create(preset.officialSkin);
          try {
            // One settled idle frame is enough for a still portrait.
            player.advance("movement/idle-front", "front", 0);
            next[preset.id] = player.canvas.toDataURL("image/png");
          } finally {
            player.dispose();
          }
        }
        if (!controller.signal.aborted) setPortraits(next);
      } catch {
        // Portraits are decoration; the characters stay selectable by name.
      }
    })();
    return () => {
      controller.abort();
      assets?.dispose();
    };
  }, []);
  return portraits;
}

/** The prepared character an avatar version (sample-<id>-v1) stands for, if any. */
export function presetIdForAvatar(avatarVersion: string): string | null {
  const id = /^sample-([a-z]+)-v1$/.exec(avatarVersion)?.[1];
  return id && PRESET_CHARACTERS.some((preset) => preset.id === id) ? id : null;
}
