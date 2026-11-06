import type { Firestore } from "@google-cloud/firestore";
import { describe, expect, it } from "vitest";
import { SPINE_TASK_INDEX_PATH } from "../spine/admin-index";
import { buildAdminView } from "../spine/admin-view";
import { HEARTBEAT_PATH } from "../spine/heartbeat";
import { FirestoreVisitorStore } from "./firestore";

const namespace = "test-exhibition";
const root = `visitorExhibitions/${namespace}`;
const owner = "a".repeat(64);
const review = "spine-11111111-1111-4111-8111-111111111111";
const historical = "spine-22222222-2222-4222-8222-222222222222";
const now = 1_800_000_000_000;

/** Simulates the intentionally restricted Cloud Run identity: document get only. */
function restrictedFirestore(records: Record<string, Record<string, unknown>>) {
  const reads: string[] = [];
  const db = {
    doc: (path: string) => ({ path }),
    getAll: async (...refs: Array<{ path: string }>) =>
      refs.map((ref) => {
        reads.push(ref.path);
        return {
          id: ref.path.split("/").at(-1) ?? "",
          exists: Object.hasOwn(records, ref.path),
          data: () => records[ref.path],
        };
      }),
    collection: () => {
      throw new Error("datastore.entities.list is deliberately forbidden");
    },
    runTransaction: async (
      fn: (tx: { get: (ref: { path: string }) => Promise<unknown> }) => Promise<unknown>,
    ) =>
      fn({
        get: async (ref) => ({
          exists: Object.hasOwn(records, ref.path),
          data: () => records[ref.path],
        }),
      }),
  };
  return { store: new FirestoreVisitorStore(db as unknown as Firestore, namespace), reads };
}

describe("Firestore admin task listing without collection list permission", () => {
  it("recovers a legacy REVIEW task from its active session and reports a live Worker", async () => {
    const docs = {
      [`${root}/meta/state`]: { activeSessions: { [owner]: now + 20_000 } },
      [`${root}/requests/spine-owner-${owner}`]: { task: review },
      [`${root}/jobs/spine-${review}`]: {
        state: "REQUIRES_REVIEW",
        stateSince: now - 10_000,
      },
      [`${root}/${HEARTBEAT_PATH}`]: { seenAt: now - 5_000, running: 0 },
    };
    const { store, reads } = restrictedFirestore(docs);
    const view = await buildAdminView(store, now);
    expect(view.worker.online).toBe(true);
    expect(view.tasks.map((t) => t.task)).toEqual([review]);
    expect(view.tasks[0]?.state).toBe("REQUIRES_REVIEW");
    expect(reads).toContain(`${root}/jobs/spine-${review}`);
    expect(view.tasks[0]).not.toHaveProperty("owner");
  });

  it("uses the persistent index for jobs beyond their original session", async () => {
    const docs = {
      [`${root}/meta/state`]: { activeSessions: {} },
      [`${root}/${SPINE_TASK_INDEX_PATH}`]: { tasks: [historical] },
      [`${root}/jobs/spine-${historical}`]: { state: "FAILED", stateSince: now },
    };
    const { store, reads } = restrictedFirestore(docs);
    expect((await store.listJobs(201)).map((j) => j.id)).toEqual([`spine-${historical}`]);
    expect(reads).toContain(`${root}/jobs/spine-${historical}`);
  });

  it("does not attempt Firestore reads for invalid limits or absent task IDs", async () => {
    const { store, reads } = restrictedFirestore({});
    await expect(store.listJobs(0)).rejects.toThrow("Invalid job list limit");
    await expect(store.listJobs(202)).rejects.toThrow("Invalid job list limit");
    expect(await store.listJobs(201)).toEqual([]);
    expect(reads).not.toContain(`${root}/jobs/spine-${review}`);
  });
});
