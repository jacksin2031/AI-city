/** Worker liveness is a single Firestore document the Worker overwrites on a fixed interval. */
export const HEARTBEAT_PATH = "meta/spine-worker";
export const HEARTBEAT_INTERVAL_MS = 30_000;
export const OFFLINE_AFTER_MS = 120_000;
/** A heartbeat stamped further ahead than this is clock skew or garbage, not a live Worker. */
const MAX_FUTURE_SKEW_MS = 5 * 60_000;

export type Heartbeat = { seenAt: number; running: number };

export function evaluateWorker(
  heartbeat: Heartbeat | null,
  now: number,
): { online: boolean; lastSeenAt: string | null } {
  if (!heartbeat) return { online: false, lastSeenAt: null };
  const { seenAt } = heartbeat;
  if (!Number.isFinite(seenAt) || seenAt < 0 || seenAt > now + MAX_FUTURE_SKEW_MS)
    return { online: false, lastSeenAt: null };
  return {
    online: now - seenAt <= OFFLINE_AFTER_MS,
    lastSeenAt: new Date(seenAt).toISOString(),
  };
}
