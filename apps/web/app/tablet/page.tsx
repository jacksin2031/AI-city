import Tablet from "./tablet-client";

// Render the Cloud Run revision alongside the HTML/RSC payload. A display opened from a
// stale revision must know which code it is running before its FIRST /api/version poll.
export const dynamic = "force-dynamic";

export default function Page() {
  return <Tablet initialVersion={process.env.K_REVISION ?? "dev"} />;
}
