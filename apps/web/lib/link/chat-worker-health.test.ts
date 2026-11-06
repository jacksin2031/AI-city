import { describe, expect, it } from "vitest";
import {
  CHAT_WORKER_HEARTBEAT_INTERVAL_MS,
  CHAT_WORKER_HEARTBEAT_PATH,
  CHAT_WORKER_OFFLINE_AFTER_MS,
  evaluateChatWorkerHeartbeat,
} from "./chat-worker-health";

const NOW = Date.parse("2026-11-06T12:00:00.000Z");

describe("ChatWorker heartbeat status", () => {
  it("uses a separate storage key and liveness interval from the photo Worker", () => {
    expect(CHAT_WORKER_HEARTBEAT_PATH).toBe("meta/chat-worker");
    expect(CHAT_WORKER_HEARTBEAT_INTERVAL_MS).toBe(30_000);
    expect(CHAT_WORKER_OFFLINE_AFTER_MS).toBe(120_000);
  });

  it("treats a missing heartbeat as offline rather than active", () => {
    expect(evaluateChatWorkerHeartbeat(null, NOW)).toEqual({
      configured: true,
      online: false,
      phase: null,
      lastSeenAt: null,
      lastGeneratedAt: null,
    });
  });

  it("reports idle and generating states without exposing host, pid, model or stored lines", () => {
    const idle = evaluateChatWorkerHeartbeat(
      { seenAt: NOW - 30_000, active: true, phase: "IDLE", lastGeneratedAt: null, model: "secret" },
      NOW,
    );
    expect(idle).toEqual({
      configured: true,
      online: true,
      phase: "IDLE",
      lastSeenAt: new Date(NOW - 30_000).toISOString(),
      lastGeneratedAt: null,
    });
    const generating = evaluateChatWorkerHeartbeat(
      { seenAt: NOW, active: true, phase: "GENERATING", lastGeneratedAt: NOW - 60_000 },
      NOW,
    );
    expect(generating.online).toBe(true);
    expect(generating.phase).toBe("GENERATING");
    expect(generating.lastGeneratedAt).toBe(new Date(NOW - 60_000).toISOString());
    expect("model" in idle).toBe(false);
  });

  it("reports an active error distinctly from an offline Worker", () => {
    const status = evaluateChatWorkerHeartbeat(
      { seenAt: NOW, active: true, phase: "ERROR", lastGeneratedAt: null },
      NOW,
    );
    expect(status.online).toBe(true);
    expect(status.phase).toBe("ERROR");
  });

  it("marks a stopped Worker offline immediately", () => {
    expect(
      evaluateChatWorkerHeartbeat(
        { seenAt: NOW, active: false, phase: "IDLE", lastGeneratedAt: null },
        NOW,
      ).online,
    ).toBe(false);
  });

  it("marks an expired heartbeat offline even when the last phase was generating", () => {
    const status = evaluateChatWorkerHeartbeat(
      { seenAt: NOW - CHAT_WORKER_OFFLINE_AFTER_MS - 1, active: true, phase: "GENERATING" },
      NOW,
    );
    expect(status.online).toBe(false);
    expect(status.lastSeenAt).toBeTruthy();
  });

  it("rejects invalid, impossible and too-far-future timestamps", () => {
    for (const seenAt of ["today", Number.NaN, -1, NOW + 300_001, 999_999_999_999_999]) {
      expect(evaluateChatWorkerHeartbeat({ seenAt, active: true, phase: "IDLE" }, NOW).online).toBe(
        false,
      );
    }
    expect(
      evaluateChatWorkerHeartbeat({ seenAt: NOW, active: "true", phase: "IDLE" }, NOW).online,
    ).toBe(false);
    expect(
      evaluateChatWorkerHeartbeat({ seenAt: NOW, active: true, phase: "UNKNOWN" }, NOW).online,
    ).toBe(false);
  });

  it("does not imply cloud monitoring is configured in local-only mock", () => {
    expect(evaluateChatWorkerHeartbeat(null, NOW, false).configured).toBe(false);
    expect(evaluateChatWorkerHeartbeat(null, NOW, false).online).toBe(false);
  });
});
