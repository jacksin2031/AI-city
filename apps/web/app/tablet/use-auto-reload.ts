import { useEffect } from "react";
import { initialWatch, observeVersion } from "./version-watch";

const POLL_MS = 60_000;
/** Never reload twice within this window, whatever the server says. */
const MIN_GAP_MS = 5 * 60_000;
const STAMP = "ai-city-auto-reload-at";

/**
 * A display screen stays open for days, so after a deploy it would keep running old code until
 * someone reloads it. This checks which deployment is serving and reloads once a newer one has
 * been seen twice in a row. A failed check changes nothing.
 */
export function useAutoReload() {
  useEffect(() => {
    let state = initialWatch;
    let stopped = false;
    async function check() {
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok || stopped) return;
        const body: unknown = await response.json();
        const version = body && typeof body === "object" && "version" in body ? body.version : null;
        if (typeof version !== "string" || version === "dev") return;
        const next = observeVersion(state, version);
        state = next.state;
        if (!next.reload) return;
        try {
          const last = Number(sessionStorage.getItem(STAMP) ?? 0);
          if (Date.now() - last < MIN_GAP_MS) return;
          sessionStorage.setItem(STAMP, String(Date.now()));
        } catch {
          // Without storage the check above cannot run; reloading once is still correct.
        }
        location.reload();
      } catch {
        // Offline or a restart in progress: try again next time.
      }
    }
    void check();
    const timer = window.setInterval(check, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);
}
