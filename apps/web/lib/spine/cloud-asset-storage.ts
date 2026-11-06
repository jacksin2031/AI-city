import { z } from "zod";
import { verifyPhotoBucket } from "./photo-bucket-policy";

const MAX_ASSET = 32 * 1024 * 1024;
const TASK = /^spine-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const NAME = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/;
const metadata = z.object({
  generation: z.string().regex(/^[1-9][0-9]{0,19}$/),
  size: z.string().regex(/^[0-9]{1,20}$/),
});
const uploaded = z.object({ generation: z.string().regex(/^[1-9][0-9]{0,19}$/) });
const listing = z.object({
  items: z.array(z.object({ name: z.string(), generation: z.string() })).optional(),
  nextPageToken: z.string().optional(),
});
const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  json: "application/json",
  atlas: "text/plain",
};

/**
 * Published Spine bundle files in the private bucket, under `published/<task>/<file>`.
 * Objects are immutable (never overwritten) and are only ever served through the publication
 * check in `readPublishedSpineAsset`; there is no public URL or signed link.
 */
export class CloudAssetStorage {
  constructor(
    private readonly bucket: string,
    private readonly accessToken: () => Promise<string | null>,
    private readonly transport: typeof fetch = fetch,
  ) {
    if (!/^[a-z0-9][a-z0-9.-]{1,220}[a-z0-9]$/.test(bucket)) throw new Error("ASSET_BUCKET_UNSAFE");
  }

  private async request(url: string, options: RequestInit = {}) {
    const token = await this.accessToken();
    if (!token || /[\r\n]/.test(token)) throw new Error("CLOUD_ASSET_UNAVAILABLE");
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return this.transport(url, {
      ...options,
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  }

  private object(task: string, name: string): string {
    if (!TASK.test(task) || !NAME.test(name)) throw new Error("CLOUD_ASSET_NAME_INVALID");
    return `published/${task}/${name}`;
  }

  private bucketUrl() {
    return `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(this.bucket)}`;
  }

  private objectUrl(object: string) {
    return `${this.bucketUrl()}/o/${encodeURIComponent(object)}`;
  }

  private async verifyPolicy() {
    await verifyPhotoBucket(this.bucket, async () => {
      const result = await this.request(this.bucketUrl());
      if (!result.ok) throw new Error("CLOUD_ASSET_UNAVAILABLE");
      return result.json();
    });
  }

  private async metadataOf(object: string) {
    const result = await this.request(this.objectUrl(object));
    if (result.status === 404) return null;
    if (!result.ok) throw new Error("CLOUD_ASSET_UNAVAILABLE");
    return metadata.parse(await result.json());
  }

  /** Never replaces an existing object. */
  async write(task: string, name: string, bytes: Uint8Array): Promise<string> {
    const object = this.object(task, name);
    if (!bytes.byteLength || bytes.byteLength > MAX_ASSET) throw new Error("CLOUD_ASSET_SIZE");
    await this.verifyPolicy();
    const query = new URLSearchParams({
      uploadType: "media",
      name: object,
      ifGenerationMatch: "0",
    });
    const type = CONTENT_TYPES[name.slice(name.lastIndexOf(".") + 1)] ?? "application/octet-stream";
    const result = await this.request(
      `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(this.bucket)}/o?${query}`,
      {
        method: "POST",
        headers: { "Content-Type": type },
        body: Uint8Array.from(bytes).buffer,
      },
    );
    if (!result.ok) throw new Error("CLOUD_ASSET_WRITE_FAILED");
    return uploaded.parse(await result.json()).generation;
  }

  async read(task: string, name: string, maxBytes: number): Promise<Uint8Array | null> {
    const object = this.object(task, name);
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_ASSET)
      throw new Error("CLOUD_ASSET_SIZE");
    const info = await this.metadataOf(object);
    if (!info) return null;
    if (BigInt(info.size) > BigInt(maxBytes) || BigInt(info.size) === 0n)
      throw new Error("CLOUD_ASSET_SIZE");
    const query = new URLSearchParams({ alt: "media", ifGenerationMatch: info.generation });
    const result = await this.request(`${this.objectUrl(object)}?${query}`);
    if (!result.ok || !result.body) throw new Error("CLOUD_ASSET_READ_FAILED");
    const reader = result.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        total += chunk.value.byteLength;
        if (total > maxBytes) throw new Error("CLOUD_ASSET_SIZE");
        chunks.push(chunk.value);
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
    if (BigInt(total) !== BigInt(info.size)) throw new Error("CLOUD_ASSET_READ_FAILED");
    const output = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return output;
  }

  /** Deletes one named file; a missing file is not an error. */
  async remove(task: string, name: string): Promise<void> {
    const object = this.object(task, name);
    await this.verifyPolicy();
    const info = await this.metadataOf(object);
    if (!info) return;
    const query = new URLSearchParams({ ifGenerationMatch: info.generation });
    const result = await this.request(`${this.objectUrl(object)}?${query}`, { method: "DELETE" });
    if (!result.ok && result.status !== 404) throw new Error("CLOUD_ASSET_DELETE_FAILED");
    if (await this.metadataOf(object)) throw new Error("CLOUD_ASSET_DELETE_FAILED");
  }

  /** Removes every published file of one task (expiry or withdrawal). Never touches other tasks. */
  async removeTask(task: string): Promise<void> {
    if (!TASK.test(task)) throw new Error("CLOUD_ASSET_NAME_INVALID");
    const prefix = `published/${task}/`;
    let token: string | undefined;
    const names: string[] = [];
    do {
      const query = new URLSearchParams({ prefix, maxResults: "100" });
      if (token) query.set("pageToken", token);
      const result = await this.request(`${this.bucketUrl()}/o?${query}`);
      if (!result.ok) throw new Error("CLOUD_ASSET_UNAVAILABLE");
      const page = listing.parse(await result.json());
      for (const item of page.items ?? []) {
        const name = item.name.slice(prefix.length);
        if (!item.name.startsWith(prefix) || !NAME.test(name))
          throw new Error("CLOUD_ASSET_CLEANUP_INCOMPLETE");
        names.push(name);
      }
      token = page.nextPageToken;
    } while (token);
    for (const name of names) await this.remove(task, name);
  }

  /** For readPublishedSpineAsset only; that boundary checks the exact public path first. */
  assetReader(task: string) {
    return {
      read: (path: string, maxBytes: number) =>
        this.read(task, path.slice(path.lastIndexOf("/") + 1), maxBytes),
    };
  }
}
