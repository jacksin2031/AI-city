import { Firestore } from "@google-cloud/firestore";
import { Storage } from "@google-cloud/storage";

// Two interchangeable backends: in-memory (offline mock, default) and Google Cloud
// (Firestore + GCS). Nothing here is reachable from the browser except through route handlers.
export type Doc = Record<string, unknown>;

export interface Store {
  readonly kind: "memory" | "gcp";
  get(collection: string, id: string): Promise<Doc | null>;
  set(collection: string, id: string, data: Doc): Promise<void>;
  update(collection: string, id: string, patch: Doc): Promise<void>;
  query(collection: string, field: string, value: unknown, limit: number): Promise<Doc[]>;
  putBlob(
    bucket: "private" | "assets",
    path: string,
    bytes: Buffer,
    contentType: string,
  ): Promise<void>;
  getBlob(
    bucket: "private" | "assets",
    path: string,
  ): Promise<{ bytes: Buffer; contentType: string } | null>;
  deleteBlob(bucket: "private" | "assets", path: string): Promise<void>;
}

function createMemoryStore(): Store {
  const docs = new Map<string, Doc>();
  const blobs = new Map<string, { bytes: Buffer; contentType: string }>();
  const key = (collection: string, id: string) => `${collection}/${id}`;
  return {
    kind: "memory",
    async get(collection, id) {
      const doc = docs.get(key(collection, id));
      return doc ? structuredClone(doc) : null;
    },
    async set(collection, id, data) {
      docs.set(key(collection, id), structuredClone(data));
    },
    async update(collection, id, patch) {
      const current = docs.get(key(collection, id)) ?? {};
      docs.set(key(collection, id), { ...current, ...structuredClone(patch) });
    },
    async query(collection, field, value, limit) {
      const out: Doc[] = [];
      for (const [k, doc] of docs) {
        if (k.startsWith(`${collection}/`) && doc[field] === value) out.push(structuredClone(doc));
        if (out.length >= limit) break;
      }
      return out;
    },
    async putBlob(bucket, path, bytes, contentType) {
      blobs.set(`${bucket}/${path}`, { bytes, contentType });
    },
    async getBlob(bucket, path) {
      return blobs.get(`${bucket}/${path}`) ?? null;
    },
    async deleteBlob(bucket, path) {
      blobs.delete(`${bucket}/${path}`);
    },
  };
}

function createGcpStore(): Store {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const firestore = new Firestore({ projectId });
  const storage = new Storage({ projectId });
  const buckets = {
    private: process.env.AI_CITY_PRIVATE_BUCKET ?? "",
    assets: process.env.AI_CITY_ASSET_BUCKET ?? "",
  };
  const file = (bucket: "private" | "assets", path: string) =>
    storage.bucket(buckets[bucket]).file(path);
  return {
    kind: "gcp",
    async get(collection, id) {
      const snap = await firestore.collection(collection).doc(id).get();
      return snap.exists ? (snap.data() as Doc) : null;
    },
    async set(collection, id, data) {
      await firestore.collection(collection).doc(id).set(data);
    },
    async update(collection, id, patch) {
      await firestore.collection(collection).doc(id).set(patch, { merge: true });
    },
    async query(collection, field, value, limit) {
      const snap = await firestore
        .collection(collection)
        .where(field, "==", value)
        .limit(limit)
        .get();
      return snap.docs.map((d) => d.data() as Doc);
    },
    async putBlob(bucket, path, bytes, contentType) {
      await file(bucket, path).save(bytes, { contentType, resumable: false });
    },
    async getBlob(bucket, path) {
      const f = file(bucket, path);
      const [exists] = await f.exists();
      if (!exists) return null;
      const [bytes] = await f.download();
      const [meta] = await f.getMetadata();
      return { bytes, contentType: String(meta.contentType ?? "application/octet-stream") };
    },
    async deleteBlob(bucket, path) {
      await file(bucket, path).delete({ ignoreNotFound: true });
    },
  };
}

const globalForStore = globalThis as unknown as { __aiCityStore?: Store };

export function getStore(): Store {
  globalForStore.__aiCityStore ??=
    process.env.AI_CITY_BACKEND === "gcp" ? createGcpStore() : createMemoryStore();
  return globalForStore.__aiCityStore;
}
