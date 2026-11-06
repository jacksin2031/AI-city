import type { Firestore } from "@google-cloud/firestore";
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
    const snapshot = await this.db
      .collection(`visitorExhibitions/${this.namespace}/jobs`)
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, value: doc.data() }));
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
