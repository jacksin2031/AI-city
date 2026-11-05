import { CONSENT_VERSION, type SessionDoc } from "../../../lib/server/residents";
import { newSessionId, setSessionCookie } from "../../../lib/server/session";
import { getStore } from "../../../lib/server/store";

// The server records consent itself; it never trusts a client-supplied `publicConsent` flag later.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    terms?: unknown;
    photo?: unknown;
    public?: unknown;
  } | null;
  if (body?.terms !== true || body?.public !== true) {
    return Response.json({ error: "consent_required" }, { status: 400 });
  }
  const sid = newSessionId();
  const doc: SessionDoc = {
    sid,
    consent: {
      version: CONSENT_VERSION,
      terms: true,
      photo: body.photo === true,
      public: true,
      at: Date.now(),
    },
  };
  await getStore().set("sessions", sid, doc);
  const secure =
    request.headers.get("x-forwarded-proto") === "https" ||
    new URL(request.url).protocol === "https:";
  await setSessionCookie(sid, secure);
  return Response.json({ ok: true, photoConsent: doc.consent.photo });
}

export async function GET() {
  const { readSessionId } = await import("../../../lib/server/session");
  const { getSession } = await import("../../../lib/server/residents");
  const sid = await readSessionId();
  const session = sid ? await getSession(sid) : null;
  if (!session) return Response.json({ session: false });
  return Response.json({
    session: true,
    photoConsent: session.consent.photo,
    hasResident: !!session.residentId,
  });
}
