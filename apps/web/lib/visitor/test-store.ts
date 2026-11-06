import {
  assertJobListLimit,
  type StoredDocument,
  type VisitorStore,
  type VisitorTransaction,
} from "./store";

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** A serialized, rollback-capable store for tests only. */
export class MemoryVisitorStore implements VisitorStore {
  private documents = new Map<string, StoredDocument>();
  private tail: Promise<void> = Promise.resolve();

  async run<T>(action: (tx: VisitorTransaction) => Promise<T>): Promise<T> {
    const previous = this.tail;
    let unlock = () => {};
    this.tail = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    await previous;

    const staged = new Map<string, StoredDocument | null>();
    const tx: VisitorTransaction = {
      get: async (path) => {
        if (staged.has(path)) {
          const value = staged.get(path);
          return value === null || value === undefined ? null : clone(value);
        }
        const value = this.documents.get(path);
        return value === undefined ? null : clone(value);
      },
      set: (path, value) => staged.set(path, clone(value)),
      delete: (path) => staged.set(path, null),
    };

    try {
      const result = await action(tx);
      for (const [path, value] of staged) {
        if (value === null) this.documents.delete(path);
        else this.documents.set(path, clone(value));
      }
      return result;
    } finally {
      unlock();
    }
  }

  async listJobs(limit: number): Promise<Array<{ id: string; value: StoredDocument }>> {
    assertJobListLimit(limit);
    const jobs: Array<{ id: string; value: StoredDocument }> = [];
    for (const [path, value] of this.documents) {
      if (!path.startsWith("jobs/")) continue;
      jobs.push({ id: path.slice("jobs/".length), value: clone(value) });
      if (jobs.length >= limit) break;
    }
    return jobs;
  }

  dump(): ReadonlyMap<string, StoredDocument> {
    return new Map([...this.documents].map(([path, value]) => [path, clone(value)]));
  }
}
