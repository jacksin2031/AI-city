export type StoredDocument = Record<string, unknown>;

export interface VisitorTransaction {
  get(path: string): Promise<StoredDocument | null>;
  set(path: string, value: StoredDocument): void;
  delete(path: string): void;
}

export interface VisitorStore {
  run<T>(action: (tx: VisitorTransaction) => Promise<T>): Promise<T>;
}
