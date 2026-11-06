import { SpineWorkerStatusSchema } from "@ai-city/contracts/spine";
import { describe, expect, it } from "vitest";
import {
  evaluateWorker,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_PATH,
  OFFLINE_AFTER_MS,
} from "./heartbeat";

const now = 1_800_000_000_000;

describe("evaluateWorker", () => {
  it("exposes the agreed constants", () => {
    expect(HEARTBEAT_PATH).toBe("meta/spine-worker");
    expect(HEARTBEAT_INTERVAL_MS).toBe(30_000);
    expect(OFFLINE_AFTER_MS).toBe(120_000);
  });

  it("is offline without a heartbeat", () => {
    expect(evaluateWorker(null, now)).toEqual({ online: false, lastSeenAt: null });
  });

  it("is online within the window", () => {
    const seenAt = now - 119_000;
    expect(evaluateWorker({ seenAt, running: 0 }, now)).toEqual({
      online: true,
      lastSeenAt: new Date(seenAt).toISOString(),
    });
  });

  it("is offline after the window but keeps lastSeenAt", () => {
    const seenAt = now - 121_000;
    expect(evaluateWorker({ seenAt, running: 1 }, now)).toEqual({
      online: false,
      lastSeenAt: new Date(seenAt).toISOString(),
    });
  });

  it("treats a heartbeat far in the future as invalid", () => {
    expect(evaluateWorker({ seenAt: now + 6 * 60_000, running: 0 }, now)).toEqual({
      online: false,
      lastSeenAt: null,
    });
  });

  it("rejects NaN and negative timestamps", () => {
    for (const seenAt of [Number.NaN, -1]) {
      expect(evaluateWorker({ seenAt, running: 0 }, now)).toEqual({
        online: false,
        lastSeenAt: null,
      });
    }
  });

  it("produces output accepted by the status schema", () => {
    const status = evaluateWorker({ seenAt: now, running: 0 }, now);
    expect(SpineWorkerStatusSchema.parse(status)).toEqual(status);
  });
});
