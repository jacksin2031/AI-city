/** ChatWorker liveness is a public-safe summary of one private Firestore heartbeat. */
export const CHAT_WORKER_HEARTBEAT_PATH = "meta/chat-worker";
export const CHAT_WORKER_HEARTBEAT_INTERVAL_MS = 30_000;
export const CHAT_WORKER_OFFLINE_AFTER_MS = 120_000;
const MAX_FUTURE_SKEW_MS = 5 * 60_000;
const MAX_DATE_MS = 253_402_300_799_999;

export type ChatWorkerPhase = "IDLE" | "GENERATING" | "ERROR";
export type ChatWorkerStatus = {
  configured: boolean;
  online: boolean;
  phase: ChatWorkerPhase | null;
  lastSeenAt: string | null;
  lastGeneratedAt: string | null;
};

function validTime(raw: unknown, now: number): number | null {
  return typeof raw === "number" &&
    Number.isSafeInteger(raw) &&
    raw >= 0 &&
    raw <= MAX_DATE_MS &&
    raw <= now + MAX_FUTURE_SKEW_MS
    ? raw
    : null;
}

/** Invalid or stale data never reports a Worker online. No host/path/credential is exposed. */
export function evaluateChatWorkerHeartbeat(
  raw: unknown,
  now: number,
  configured = true,
): ChatWorkerStatus {
  const offline: ChatWorkerStatus = {
    configured,
    online: false,
    phase: null,
    lastSeenAt: null,
    lastGeneratedAt: null,
  };
  if (!configured || !raw || typeof raw !== "object") return offline;
  const data = raw as Record<string, unknown>;
  const seenAt = validTime(data.seenAt, now);
  if (seenAt === null || typeof data.active !== "boolean") return offline;
  const phase =
    data.phase === "IDLE" || data.phase === "GENERATING" || data.phase === "ERROR"
      ? data.phase
      : null;
  const generatedAt = validTime(data.lastGeneratedAt, now);
  return {
    configured: true,
    online: data.active && phase !== null && now - seenAt <= CHAT_WORKER_OFFLINE_AFTER_MS,
    phase,
    lastSeenAt: new Date(seenAt).toISOString(),
    lastGeneratedAt: generatedAt === null ? null : new Date(generatedAt).toISOString(),
  };
}
