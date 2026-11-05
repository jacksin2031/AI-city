import { getResident } from "../../../../lib/server/residents";
import { getStore } from "../../../../lib/server/store";

// Same-origin avatar delivery: matches the contract's /avatars/... AssetReference, so no signed
// URL is ever handed to the browser. Only visible (consented, READY) residents are served.
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string; file: string }> },
) {
  const { id, file } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || file !== "front.png")
    return new Response(null, { status: 404 });
  const resident = await getResident(id);
  if (!resident?.visible) return new Response(null, { status: 404 });
  const blob = await getStore().getBlob("assets", `avatars/${id}.png`);
  if (!blob) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(blob.bytes), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
