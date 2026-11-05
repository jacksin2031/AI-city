/** Only call with the authenticated session's server-side view and the current public roster. */
export function focusTarget(
  view: {
    publication: "PRIVATE" | "PUBLISHED" | "REMOVED";
    resident: { residentId: string } | null;
  } | null,
  visibleResidentIds: readonly string[],
): string | null {
  const residentId = view?.resident?.residentId;
  return view?.publication === "PUBLISHED" && residentId && visibleResidentIds.includes(residentId)
    ? residentId
    : null;
}

import { randomUUID } from "node:crypto";

export class FocusBroker {
  private latest: { id: string; residentId: string; expiresAt: number } | null = null;
  constructor(private readonly now = Date.now) {}
  publish(residentId: string) {
    this.latest = { id: randomUUID(), residentId, expiresAt: this.now() + 10000 };
    return this.latest;
  }
  current() {
    return this.latest && this.latest.expiresAt > this.now() ? this.latest : null;
  }
}
