import { SpineAdminViewSchema } from "@ai-city/contracts/spine";
import { describe, expect, it } from "vitest";
import { MemoryVisitorStore } from "../visitor/test-store";
import { buildAdminView, STUCK_AFTER_MS } from "./admin-view";
import { HEARTBEAT_PATH } from "./heartbeat";
import { makeSpineJob } from "./jobs";

const now = 1_800_000_000_000;
const owner = "a".repeat(64);
const consent = {
  processing: true,
  automaticPublication: true,
  version: 1,
  recordedAt: "2026-11-05T00:00:00.000Z",
} as const;
const bundle = {
  runtime: "4.3" as const,
  skeleton: "/avatars/person/v1/skeleton.json",
  atlas: "/avatars/person/v1/skeleton.atlas",
  pages: ["/avatars/person/v1/page.png"],
  orientationPolicy: "/avatars/person/v1/orientation-policy.json",
  buildManifest: "/avatars/person/v1/build-manifest.json",
  sha256: "e".repeat(64),
};
const uuid = (n: number) => `${n.toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`;

type Over = Record<string, unknown>;
async function put(store: MemoryVisitorStore, n: number, over: Over = {}) {
  const base = makeSpineJob(owner, "c".repeat(64), consent, undefined, now - 1_000);
  await store.run(async (tx) => tx.set(`jobs/spine-spine-${uuid(n)}`, { ...base, ...over }));
}
const running = (since?: number) => ({
  state: "RUNNING",
  worker: "w1",
  ...(since === undefined ? {} : { stateSince: since }),
});

describe("buildAdminView", () => {
  it("lists tasks with attention first, hides withdrawn, counts queue", async () => {
    const store = new MemoryVisitorStore();
    await store.run(async (tx) => tx.set(HEARTBEAT_PATH, { seenAt: now - 5_000, running: 1 }));
    await put(store, 0xa1); // QUEUED
    await put(store, 0xa2, running(now - 60_000)); // healthy RUNNING
    await put(store, 0xa3, running(now - STUCK_AFTER_MS - 1)); // stuck RUNNING
    await put(store, 0xa4, { state: "FAILED", worker: "w1", stateSince: now - 10 });
    await put(store, 0xa5, { state: "UNKNOWN", worker: "w1" });
    await put(store, 0xa6, {
      state: "WITHDRAWN",
      processingConsent: false,
      publicationConsent: false,
      photoSha256: null,
      consent: null,
    });
    await put(store, 0xa7, { state: "PUBLISHED", worker: "w1", bundle });
    const view = await buildAdminView(store, now);
    expect(SpineAdminViewSchema.parse(view)).toEqual(view);
    expect(view.worker.online).toBe(true);
    expect(view.queued).toBe(1);
    expect(view.running).toBe(2);
    expect(view.truncated).toBe(false);
    expect(view.repairs).toEqual([]);
    expect(view.tasks).toHaveLength(6);
    expect(view.tasks.some((t) => t.task === `spine-${uuid(0xa6)}`)).toBe(false);
    const attention = view.tasks.filter((t) => t.needsAttention).map((t) => t.state);
    expect(attention.sort()).toEqual(["FAILED", "RUNNING", "UNKNOWN"]);
    expect(view.tasks.slice(0, 3).every((t) => t.needsAttention)).toBe(true);
    expect(view.tasks.slice(3).every((t) => !t.needsAttention)).toBe(true);
    const t = view.tasks.find((x) => x.task === `spine-${uuid(0xa1)}`);
    expect(t?.code).toBe("000000a1");
    expect(t?.stateSince).toBe(new Date(now - 1_000).toISOString());
    expect(t?.preview).toBeNull();
    expect(view.tasks.find((x) => x.state === "PUBLISHED")?.preview).toEqual({
      bundle,
      adjustment: null,
    });
  });

  it("shows the saved adjustment in the preview and ignores a corrupt one", async () => {
    const store = new MemoryVisitorStore();
    const adjustment = { version: 1, parts: { hair: { dx: 0, dy: 0.1, scale: 1 } } };
    await put(store, 1, { state: "PUBLISHED", worker: "w1", bundle, adjustment });
    await put(store, 2, {
      state: "PUBLISHED",
      worker: "w1",
      bundle,
      adjustment: { version: 1, parts: { hair: { dx: 9, dy: 0, scale: 1 } } },
    });
    const view = await buildAdminView(store, now);
    expect(view.tasks.find((t) => t.code === "00000001")?.preview).toEqual({ bundle, adjustment });
    expect(view.tasks.find((t) => t.code === "00000002")?.preview).toEqual({
      bundle,
      adjustment: null,
    });
  });

  it("reports unknown stateSince for legacy records and never flags them stuck", async () => {
    const store = new MemoryVisitorStore();
    const base = makeSpineJob(owner, "c".repeat(64), consent, undefined, 0);
    const { stateSince: _drop, ...legacy } = base;
    await store.run(async (tx) =>
      tx.set(`jobs/spine-spine-${uuid(9)}`, { ...legacy, state: "RUNNING", worker: "w1" }),
    );
    const [t] = (await buildAdminView(store, now)).tasks;
    expect(t?.stateSince).toBeNull();
    expect(t?.needsAttention).toBe(false);
  });

  it("drops the preview of a corrupt bundle without failing the view", async () => {
    const store = new MemoryVisitorStore();
    await put(store, 1, { state: "PUBLISHED", worker: "w1", bundle: { skeleton: "bad" } });
    await put(store, 2, { state: "PUBLISHED", worker: "w1", bundle });
    const view = await buildAdminView(store, now);
    expect(view.tasks).toHaveLength(2);
    expect(view.tasks.find((t) => t.code === "00000001")?.preview).toBeNull();
    expect(view.tasks.find((t) => t.code === "00000002")?.preview).toEqual({
      bundle,
      adjustment: null,
    });
  });

  it("reports an offline worker when there is no heartbeat", async () => {
    const view = await buildAdminView(new MemoryVisitorStore(), now);
    expect(view.worker).toEqual({ online: false, lastSeenAt: null });
  });

  it("reads the repair log", async () => {
    const store = new MemoryVisitorStore();
    const entry = { at: "2026-11-06T00:00:00.000Z", action: "cancel", code: "000000a1" };
    await store.run(async (tx) => tx.set("meta/spine-repair-log", { entries: [entry] }));
    expect((await buildAdminView(store, now)).repairs).toEqual([entry]);
  });

  it("never leaks private fields and has the exact key sets", async () => {
    const store = new MemoryVisitorStore();
    await put(store, 1, { state: "PUBLISHED", worker: "w1", bundle });
    await put(store, 2, { photoStorage: "CLOUD_PRIVATE", photoGeneration: "123" });
    const view = await buildAdminView(store, now);
    const text = JSON.stringify(view);
    for (const word of ["owner", "photoSha256", "photoGeneration", "consent", "CLOUD_PRIVATE"])
      expect(text).not.toContain(word);
    expect(Object.keys(view).sort()).toEqual(
      ["queued", "repairs", "running", "tasks", "truncated", "worker"].sort(),
    );
    for (const task of view.tasks) {
      expect(Object.keys(task).sort()).toEqual(
        ["code", "needsAttention", "preview", "state", "stateSince", "task"].sort(),
      );
      expect("worker" in task).toBe(false);
      expect("bundle" in task).toBe(false);
    }
    expect(text.match(/"bundle"/g)).toHaveLength(1);
    for (const task of view.tasks)
      if (task.preview) expect(Object.keys(task.preview).sort()).toEqual(["adjustment", "bundle"]);
  });

  it("truncates to 200 tasks", async () => {
    const store = new MemoryVisitorStore();
    for (let i = 1; i <= 201; i++) await put(store, i);
    const view = await buildAdminView(store, now);
    expect(view.tasks).toHaveLength(200);
    expect(view.truncated).toBe(true);
  });

  it("keeps tasks visible when a stored timestamp is corrupt or out of range", async () => {
    const store = new MemoryVisitorStore();
    await put(store, 1, { stateSince: Number.MAX_SAFE_INTEGER });
    await put(store, 2, { stateSince: "invalid" });
    await put(store, 3, running(now - STUCK_AFTER_MS - 1));
    const view = await buildAdminView(store, now);
    expect(view.tasks).toHaveLength(3);
    expect(view.tasks.filter((task) => task.stateSince === null)).toHaveLength(2);
    expect(view.running).toBe(1);
    expect(view.tasks.find((task) => task.code === "00000003")?.needsAttention).toBe(true);
  });
});
