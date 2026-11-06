import { SpineTaskIdSchema } from "@ai-city/contracts/spine";
import type { Firestore } from "@google-cloud/firestore";
import { SPINE_TASK_INDEX_PATH, spineTaskIds } from "../spine/admin-index";
import {
  assertJobListLimit,
  type StoredDocument,
  type VisitorStore,
  type VisitorTransaction,
} from "./store";

/** Server SDK only. Web clients retain deny-all rules; caller authorization is mandatory. */
export class FirestoreVisitorStore implements VisitorStore {
  constructor(
    private db: Firestore,
    private namespace: string,
  ) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(namespace)) throw new Error("Invalid visitor namespace");
  }
  async listJobs(limit: number): Promise<Array<{ id: string; value: StoredDocument }>> {
    assertJobListLimit(limit);
    const base = `visitorExhibitions/${this.namespace}`;
    // Cloud Run's deliberately restricted role has datastore.entities.get, not
    // datastore.entities.list. A collection query makes the entire admin view 503.
    const [state, index] = await this.db.getAll(
      this.db.doc(`${base}/meta/state`),
      this.db.doc(`${base}/${SPINE_TASK_INDEX_PATH}`),
    );
    const active = state?.data()?.activeSessions;
    const owners =
      active && typeof active === "object" && !Array.isArray(active)
        ? Object.keys(active)
            .filter((owner) => /^[a-f0-9]{64}$/.test(owner))
            .slice(0, 200)
        : [];
    const ownerDocuments = owners.length
      ? await this.db.getAll(
          ...owners.map((owner) => this.db.doc(`${base}/requests/spine-owner-${owner}`)),
        )
      : [];
    const knownTasks = new Set<string>();
    // Active sessions are included first, so an older job can still be recovered
    // after a release, before the persistent index was introduced.
    for (const record of ownerDocuments) {
      const task = record.data()?.task;
      if (SpineTaskIdSchema.safeParse(task).success) knownTasks.add(task as string);
    }
    for (const task of spineTaskIds(index?.data()).reverse()) knownTasks.add(task);
    const tasks = [...knownTasks].slice(0, limit);
    if (!tasks.length) return [];
    const records = await this.db.getAll(
      ...tasks.map((task) => this.db.doc(`${base}/jobs/spine-${task}`)),
    );
    return records.flatMap((record) =>
      record.exists ? [{ id: record.id, value: record.data() ?? {} }] : [],
    );
  }
  run<T>(action: (tx: VisitorTransaction) => Promise<T>): Promise<T> {
    return this.db.runTransaction(
      async (transaction) => {
        const pending = new Map<string, StoredDocument | null>();
        const ref = (path: string) => {
          if (!/^(meta|sessions|jobs|requests)\/[A-Za-z0-9_-]{1,128}$/.test(path)) {
            throw new Error("Invalid visitor document path");
          }
          return this.db.doc(`visitorExhibitions/${this.namespace}/${path}`);
        };
        const result = await action({
          get: async (path) => {
            ref(path);
            if (pending.has(path)) return structuredClone(pending.get(path) ?? null);
            const snapshot = await transaction.get(ref(path));
            return snapshot.exists ? (snapshot.data() ?? null) : null;
          },
          set: (path, value) => {
            ref(path);
            if (Buffer.byteLength(JSON.stringify(value), "utf8") > 700_000) {
              throw new Error("Visitor document capacity exceeded");
            }
            pending.set(path, structuredClone(value));
          },
          delete: (path) => {
            ref(path);
            pending.set(path, null);
          },
        });
        // Buffer writes until after all reads and successful validation. No partial commit on failure.
        for (const [path, value] of pending) {
          if (value === null) transaction.delete(ref(path));
          else transaction.set(ref(path), value);
        }
        return result as T;
      },
      { maxAttempts: 3 },
    );
  }
}
