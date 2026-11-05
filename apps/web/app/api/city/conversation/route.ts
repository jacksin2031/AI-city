import {
  type Conversation,
  codexConversation,
  generateConversation,
} from "../../../../lib/server/chat";
import { getResident } from "../../../../lib/server/residents";
import { getStore } from "../../../../lib/server/store";

export const dynamic = "force-dynamic";
const CACHE_MS = 45_000;
const id = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Dialogue for one ordered pair.
 *
 * Priority is deliberate:
 *   1. Dialogue the local Codex worker already wrote for this exact pair. It is the
 *      only source that needs no cloud model, so it never expires on the 45s timer.
 *   2. A cloud model, when one is configured and reachable.
 *   3. The template fallback, always labelled `fallback`.
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
  const order = `${a}__${b}`;
  const cached = (await store.get("conversations", key)) as
    | (Conversation & { order?: string })
    | null;

  // A worker-produced conversation is reused as long as it belongs to this ordering.
  // Reusing it also keeps the participants' names correct when the pair is queried reversed.
  if (cached && cached.order === order) {
    const reused = codexConversation(cached, cached.createdAt);
    if (cached.source === "codex" && reused) {
      return Response.json({ speakers: { a: ra.nickname, b: rb.nickname }, ...reused });
    }
    if (Date.now() - cached.createdAt < CACHE_MS && cached.source !== "codex") {
      return Response.json({ speakers: { a: ra.nickname, b: rb.nickname }, ...cached });
    }
  }

  const conversation = await generateConversation(ra, rb);
  await store.set("conversations", key, { ...conversation, order });
  return Response.json({ speakers: { a: ra.nickname, b: rb.nickname }, ...conversation });
}
