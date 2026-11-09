export const dynamic = "force-dynamic";

/**
 * Which deployment answered. Cloud Run sets K_REVISION to the revision name, which changes on
 * every deploy, so a screen that stays open for days can tell that newer code exists. It names a
 * revision only; nothing about the project's data or settings.
 */
export function GET() {
  return Response.json(
    { version: process.env.K_REVISION ?? "dev" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
