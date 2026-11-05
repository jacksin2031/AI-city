import {
  type Conversation,
  type ConversationSource,
  codexConversation,
  generateConversation,
} from "../../../../lib/server/chat";
import { getResident } from "../../../../lib/server/residents";
import { getStore } from "../../../../lib/server/store";

export const dynamic = "force-dynamic";
const CACHE_MS = 45_000;
const id = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Map a stored conversation onto the order the caller asked for.
 *
 * A conversation is cached per unordered PAIR, because it belongs to the two residents
 * rather than to the direction they were queried in. The stored `order` records which
 * resident spoke as "a"; when the caller asks the other way round we swap the speakers
 * instead of throwing the dialogue away and regenerating it.
 */
export function alignToRequest(
  stored: Conversation & { order?: string },
  a: string,
  b: string,
): Conversation {
  if (stored.order === `${a}__${b}`) return stored;
  return {
    ...stored,
    lines: stored.lines.map((line) => ({
      ...line,
      speaker: line.speaker === "a" ? "b" : "a",
    })),
  };
}

/**
 * Dialogue for one pair of residents.
 *
 * Priority is deliberate:
 *   1. Dialogue the local Codex worker already wrote for this pair. It is the only
 *      source that needs no cloud model, so it never expires on the 45s timer.
 *   2. A cloud model, when one is configured and reachable.
 *   3. The template fallback, always labelled `fallback`.
 *
 * A worker dialogue is never overwritten by a model result: only a model-produced or
 * fallback entry is replaced, so a transient cloud failure cannot destroy good content.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const a = url.searchParams.get("a") ?? "";
  const b = url.searchParams.get("b") ?? "";
  if (!id.test(a) || !id.test(b) || a === b)
    return Response.json({ error: "bad_pair" }, { status: 400 });
  const [ra, rb] = await Promise.all([getResident(a), getResident(b)]);
  if (!ra?.visible || !rb?.visible) return Response.json({ error: "not_found" }, { status: 404 });
  const store = getStore();
  const key = [a, b].sort().join("__");
  const cached = (await store.get("conversations", key)) as
    | (Conversation & { order?: string })
    | null;

  if (cached) {
    const reusable = codexConversation(alignToRequest(cached, a, b), cached.createdAt);
    const isWorkerDialogue = cached.source === "codex";
    const stillFresh = Date.now() - (cached.createdAt ?? 0) < CACHE_MS;
    if (isWorkerDialogue && reusable) {
      return Response.json({ speakers: { a: ra.nickname, b: rb.nickname }, ...reusable });
    }
    if (!isWorkerDialogue && stillFresh) {
      return Response.json({ speakers: { a: ra.nickname, b: rb.nickname }, ...cached });
    }
  }

  const conversation = await generateConversation(ra, rb);
  // Never let a model or fallback result replace worker dialogue that is still valid.
  if (!(cached?.source === "codex")) {
    await store.set("conversations", key, { ...conversation, order: `${a}__${b}` });
  }
  return Response.json({
    speakers: { a: ra.nickname, b: rb.nickname },
    ...conversation,
  });
}
