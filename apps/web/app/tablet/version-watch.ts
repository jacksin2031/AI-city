/** Consecutive polls that must agree on a new version before the screen reloads. */
export const CONFIRMATIONS = 2;

export type VersionWatch = { known: string | null; pending: string | null; count: number };
export const initialWatch: VersionWatch = { known: null, pending: null, count: 0 };

/** A runtime server-rendered version anchors the client even if the first API poll is newer. */
export function watchForRenderedVersion(version: string): VersionWatch {
  return version && version !== "dev" ? { known: version, pending: null, count: 0 } : initialWatch;
}

/**
 * Decide from one poll whether the page should reload. The first answer is remembered as the
 * running version. A different answer only counts once it repeats, so a deploy that is still
 * rolling out (an old instance answering between new ones) does not cause a reload.
 */
export function observeVersion(
  state: VersionWatch,
  seen: string,
): { state: VersionWatch; reload: boolean } {
  if (state.known === null)
    return { state: { known: seen, pending: null, count: 0 }, reload: false };
  if (seen === state.known) return { state: { ...state, pending: null, count: 0 }, reload: false };
  const count = state.pending === seen ? state.count + 1 : 1;
  return { state: { ...state, pending: seen, count }, reload: count >= CONFIRMATIONS };
}
