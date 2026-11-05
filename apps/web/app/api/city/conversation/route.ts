import { type Conversation, generateConversation } from "../../../../lib/server/chat";
import { getResident } from "../../../../lib/server/residents";
import { getStore } from "../../../../lib/server/store";

export const dynamic = "force-dynamic";
const CACHE_MS = 45_000;
const id = /^[A-Za-z0-9_-]{1,128}$/;

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
  if (cached && Date.now() - cached.createdAt < CACHE_MS && cached.order === `${a}__${b}`) {
    return Response.json({ speakers: { a: ra.nickname, b: rb.nickname }, ...cached });
  }
  const conversation = await generateConversation(ra, rb);
  await store.set("conversations", key, { ...conversation, order: `${a}__${b}` });
  return Response.json({ speakers: { a: ra.nickname, b: rb.nickname }, ...conversation });
}
