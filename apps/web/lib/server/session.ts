import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "aicity_sid";
const MAX_AGE = 60 * 60 * 12;

const globalForSecret = globalThis as unknown as { __aiCityDevSecret?: string };

function secret(): string {
  const configured = process.env.SESSION_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.AI_CITY_BACKEND === "gcp")
    throw new Error("SESSION_SECRET (>=32 chars) is required");
  // Offline mock: a throwaway per-process secret. Sessions do not survive a restart.
  globalForSecret.__aiCityDevSecret ??= randomBytes(32).toString("hex");
  return globalForSecret.__aiCityDevSecret;
}

function sign(id: string) {
  return createHmac("sha256", secret()).update(id).digest("base64url");
}

export function newSessionId() {
  return randomBytes(18).toString("base64url");
}

export async function setSessionCookie(id: string, secure: boolean) {
  (await cookies()).set(COOKIE, `${id}.${sign(id)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: MAX_AGE,
  });
}

/** Returns the session id only if the cookie carries a valid server signature. */
export async function readSessionId(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [id, mac] = raw.split(".");
  if (!id || !mac) return null;
  const expected = Buffer.from(sign(id));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return id;
}
