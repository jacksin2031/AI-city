import { type AnimatedCharacter, fetchSpineBundle } from "@ai-city/city";
import { useEffect, useState } from "react";

/**
 * Draws the participant's own finished character once, so the summary card can show the real
 * figure rather than a stand-in. Returns null while loading or when the character is not
 * available; a failure here must never block the rest of the card.
 */
export function useSpinePortrait(enabled: boolean) {
  const [portrait, setPortrait] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt deliberately retries the published bundle fetch.
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let player: AnimatedCharacter | undefined;
    let bundle: Awaited<ReturnType<typeof fetchSpineBundle>> | undefined;
    let url: string | null = null;

    void (async () => {
      try {
        const response = await fetch("/api/visitor/spine/bundle", {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("PORTRAIT_BUNDLE_UNAVAILABLE");
        const body: unknown = await response.json();
        const descriptor =
          body && typeof body === "object" && "bundle" in body ? body.bundle : null;
        if (controller.signal.aborted) return;
        if (!descriptor) throw new Error("PORTRAIT_BUNDLE_UNAVAILABLE");
        bundle = await fetchSpineBundle(
          descriptor as Parameters<typeof fetchSpineBundle>[0],
          controller.signal,
        );
        if (controller.signal.aborted) return;
        player = bundle.create();
        // One settled idle frame is enough for a still portrait.
        player.advance("movement/idle-front", "front", 0);
        url = player.canvas.toDataURL("image/png");
        if (!controller.signal.aborted) {
          setPortrait(url);
          setUnavailable(false);
        }
      } catch {
        // Keep the person's published record, but explain the asset failure and allow retry.
        if (!controller.signal.aborted) setUnavailable(true);
      }
    })();

    return () => {
      controller.abort();
      player?.dispose();
      bundle?.dispose();
    };
  }, [enabled, attempt]);

  return {
    image: portrait,
    unavailable,
    retry: () => {
      setPortrait(null);
      setUnavailable(false);
      setAttempt((previous) => previous + 1);
    },
  };
}
