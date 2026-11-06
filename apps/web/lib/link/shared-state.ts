import { validateRequestOrigin } from "../development/http";
import type { DeviceLinkService } from "./service";

const unavailable = () =>
  Response.json(
    {
      mode: "MOCK",
      error: {
        code: "STORE_UNAVAILABLE",
        message: "接続状態を保存できません。しばらく待ってお試しください。",
      },
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );

function linkToken(request: Request) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("ai-city-link="))
    ?.slice("ai-city-link=".length);
}

/**
 * Loads shared session state before a link request and persists changes after it. A login, pairing
 * or revoke that cannot be stored fails closed so the client never holds a session the next
 * instance would not recognise. Authenticated reads also re-issue the cookie so its Max-Age slides
 * with the server-side idle deadline.
 */
export async function withSharedDeviceState(
  request: Request,
  device: DeviceLinkService,
  remoteOrigin: string | undefined,
  handler: () => Promise<Response>,
): Promise<Response> {
  const token = linkToken(request);
  try {
    await device.sync(token);
  } catch {
    // A session this process already holds keeps working from memory while the store is down.
    // Anything else (login, pairing, an unknown token) cannot be validated, so it fails closed.
    if (!device.knows(token)) return unavailable();
  }
  const response = await handler();
  try {
    await device.flush();
  } catch {
    return unavailable();
  }
  const setsLinkCookie = response.headers
    .getSetCookie()
    .some((cookie) => cookie.startsWith("ai-city-link="));
  if (request.method === "GET" && response.ok && !setsLinkCookie) {
    const maxAge = device.cookieRefresh(token);
    if (maxAge !== null) {
      try {
        const origin = validateRequestOrigin(request, remoteOrigin);
        response.headers.append(
          "Set-Cookie",
          `ai-city-link=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${origin.protocol === "https:" ? "; Secure" : ""}`,
        );
      } catch {
        /* Origin was already rejected by the handler; no cookie is issued. */
      }
    }
  }
  return response;
}
