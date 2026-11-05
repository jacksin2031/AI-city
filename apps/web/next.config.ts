import type { NextConfig } from "next";
import { fallbackContentSecurityPolicy } from "./lib/csp";

const config: NextConfig = {
  // Project-owned AGENTS.md files must not be appended to by the development server.
  agentRules: false,
  // The bundled Spine tool contains JavaScript dependencies under app/; they are not routes.
  pageExtensions: ["ts", "tsx"],
  serverExternalPackages: ["@google-cloud/firestore"],
  transpilePackages: ["@ai-city/contracts", "@ai-city/city"],
  poweredByHeader: false,
  async redirects() {
    return [{ source: "/favicon.ico", destination: "/icon.svg", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
      // Pages receive a nonce-based policy from proxy.ts instead.
      {
        source: "/api/:path*",
        headers: [{ key: "Content-Security-Policy", value: fallbackContentSecurityPolicy }],
      },
    ];
  },
};
export default config;
