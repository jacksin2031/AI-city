export function GET() {
  return Response.json({
    status: "ok",
    mode: "mock",
    locale: "ja-JP",
    liveServicesConnected: false,
  });
}
