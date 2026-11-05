export function GET() {
  const live = process.env.AI_CITY_BACKEND === "gcp";
  return Response.json({
    status: "ok",
    mode: live ? "cloud" : "mock",
    locale: "ja-JP",
    liveServicesConnected: live,
    chat: process.env.AI_CITY_CHAT === "gemini" ? "gemini" : "fallback",
    avatars: live ? "local-codex-worker" : "sample",
  });
}
