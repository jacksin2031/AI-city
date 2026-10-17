import { type NextRequest, NextResponse } from "next/server";
import { pageContentSecurityPolicy } from "./lib/csp";

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = pageContentSecurityPolicy(nonce, process.env.NODE_ENV === "development");
  // Next.js reads the nonce from the request CSP header and applies it to its own scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|icon.svg|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
