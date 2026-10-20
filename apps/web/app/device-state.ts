import type { DeviceAdmin, DeviceDisplay } from "@ai-city/contracts/device-link";

/** Control revisions and resident sequence numbers are independent clocks. */
export function mergeDeviceState<T extends DeviceAdmin | DeviceDisplay>(
  previous: T | null,
  next: T,
): T {
  if (previous?.control.serverId !== next.control.serverId) return next;
  if (next.control.revision < previous.control.revision) return previous;
  if (
    next.snapshot &&
    previous.snapshot &&
    next.snapshot.streamId === previous.snapshot.streamId &&
    next.snapshot.eventSeq < previous.snapshot.eventSeq
  )
    return { ...next, snapshot: previous.snapshot };
  return next;
}
