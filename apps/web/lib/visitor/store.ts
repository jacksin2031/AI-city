export type StoredDocument = Record<string, unknown>;

export interface VisitorTransaction {
  get(path: string): Promise<StoredDocument | null>;
  set(path: string, value: StoredDocument): void;
  delete(path: string): void;
}

export interface VisitorStore {
  run<T>(action: (tx: VisitorTransaction) => Promise<T>): Promise<T>;
  /** Non-transactional read of job documents. `limit` is 1-201; order is not guaranteed. */
  listJobs(limit: number): Promise<Array<{ id: string; value: StoredDocument }>>;
}

export function assertJobListLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 201) {
    throw new Error("Invalid job list limit");
  }
}
