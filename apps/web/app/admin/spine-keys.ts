import type { SpineAdjustment } from "@ai-city/contracts";
import type { SpineAdminTask } from "@ai-city/contracts/spine";

/** Identity of a published bundle; the descriptor object itself changes on every poll. */
export function bundleKey(bundle: NonNullable<SpineAdminTask["preview"]>["bundle"]): string {
  return `${bundle.sha256}:${bundle.skeleton}`;
}

/** Content key of an adjustment, stable across polls that deliver equal values. */
export function adjustmentKey(adjustment: SpineAdjustment | null): string {
  return JSON.stringify(adjustment);
}
