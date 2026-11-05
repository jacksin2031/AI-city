import { publicView, type ResidentDoc } from "../../../../lib/server/residents";
import { getStore } from "../../../../lib/server/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const docs = (await getStore().query("residents", "visible", true, 40)) as ResidentDoc[];
  const residents = docs.sort((a, b) => a.createdAt - b.createdAt).map(publicView);
  return Response.json({ residents }, { headers: { "Cache-Control": "no-store" } });
}
