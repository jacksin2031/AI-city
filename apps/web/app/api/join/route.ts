import { derivePersonality, validAnswers } from "../../../lib/server/personality";
import {
  CONSENT_VERSION,
  EVENT_ID,
  getResident,
  getSession,
  newResidentId,
  publicView,
  type ResidentDoc,
  sanitizeNickname,
  scheduleMockCompletion,
} from "../../../lib/server/residents";
import { readSessionId } from "../../../lib/server/session";
import { getStore } from "../../../lib/server/store";

const colors = new Set(["green", "violet", "amber"]);
const marks = new Set(["none", "star", "heart"]);

export async function POST(request: Request) {
  const sid = await readSessionId();
  const session = sid ? await getSession(sid) : null;
  if (!sid || !session) return Response.json({ error: "no_session" }, { status: 401 });
  if (session.residentId) return Response.json({ ok: true, residentId: session.residentId });
  const body = (await request.json().catch(() => null)) as {
    nickname?: unknown;
    answers?: unknown;
    color?: unknown;
    mark?: unknown;
  } | null;
  const nickname = typeof body?.nickname === "string" ? sanitizeNickname(body.nickname) : "";
  if (!nickname) return Response.json({ error: "nickname_required" }, { status: 400 });
  const answers = body?.answers == null ? null : body.answers;
  if (answers !== null && !validAnswers(answers))
    return Response.json({ error: "bad_answers" }, { status: 400 });
  const color = typeof body?.color === "string" && colors.has(body.color) ? body.color : "green";
  const mark = typeof body?.mark === "string" && marks.has(body.mark) ? body.mark : "none";

  const store = getStore();
  const hasPhoto =
    session.consent.photo && (await store.getBlob("private", `photos/${sid}.jpg`)) !== null;
  const residentId = newResidentId();
  const resident: ResidentDoc = {
    residentId,
    sid,
    eventId: EVENT_ID,
    nickname,
    ...derivePersonality(answers),
    consentVersion: CONSENT_VERSION,
    publicConsent: true,
    hasPhoto,
    color,
    mark,
    avatarState: "QUEUED",
    avatarSource: "generated",
    visible: false,
    createdAt: Date.now(),
  };
  await store.set("residents", residentId, resident);
  await store.set("jobs", residentId, {
    jobId: residentId,
    residentId,
    state: "QUEUED",
    attempt: 0,
    hasPhoto,
    sid,
    createdAt: Date.now(),
  });
  await store.update("sessions", sid, { residentId });
  if (store.kind === "memory") scheduleMockCompletion(residentId);
  return Response.json({ ok: true, residentId });
}

// Participants can withdraw at any time: hide the resident, delete the avatar and the photo.
export async function DELETE() {
  const sid = await readSessionId();
  const session = sid ? await getSession(sid) : null;
  if (!sid || !session) return Response.json({ error: "no_session" }, { status: 401 });
  const store = getStore();
  const residentId = session.residentId;
  if (residentId) {
    await store.update("residents", residentId, { visible: false, avatarState: "FAILED" });
    await store.update("jobs", residentId, { state: "CANCELLED" });
    await store.deleteBlob("assets", `avatars/${residentId}.png`);
  }
  await store.deleteBlob("private", `photos/${sid}.jpg`);
  await store.update("sessions", sid, { residentId: null, withdrawnAt: Date.now() });
  return Response.json({ ok: true });
}

export async function GET() {
  const sid = await readSessionId();
  const session = sid ? await getSession(sid) : null;
  if (!session?.residentId) return Response.json({ error: "no_resident" }, { status: 404 });
  const resident = await getResident(session.residentId);
  if (!resident) return Response.json({ error: "no_resident" }, { status: 404 });
  return Response.json({ state: resident.avatarState, resident: publicView(resident) });
}
