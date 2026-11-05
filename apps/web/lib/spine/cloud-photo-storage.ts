import { z } from "zod";
import { verifyPhotoBucket } from "./photo-bucket-policy";

const MAX_PHOTO = 24 * 1024 * 1024;
const TASK = /^spine-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const metadata = z.object({
  generation: z.string().regex(/^[1-9][0-9]{0,19}$/),
  size: z.string().regex(/^[0-9]{1,20}$/),
});
const uploaded = z.object({ generation: z.string().regex(/^[1-9][0-9]{0,19}$/) });

/** Private photo operations only. No route enables this adapter until durable cleanup is wired. */
export class CloudPhotoStorage {
  constructor(
    private readonly bucket: string,
    private readonly accessToken: () => Promise<string | null>,
    private readonly transport: typeof fetch = fetch,
  ) {
    if (!/^[a-z0-9][a-z0-9.-]{1,220}[a-z0-9]$/.test(bucket)) throw new Error("PHOTO_BUCKET_UNSAFE");
  }

  private async request(url: string, options: RequestInit = {}) {
    const token = await this.accessToken();
    if (!token || /[\r\n]/.test(token)) throw new Error("CLOUD_PHOTO_UNAVAILABLE");
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return this.transport(url, {
      ...options,
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  }

  private object(task: string): string {
    if (!TASK.test(task)) throw new Error("CLOUD_PHOTO_TASK_INVALID");
    return `private/${task}/photo.png`;
  }

  private objectUrl(name: string) {
    return `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(this.bucket)}/o/${encodeURIComponent(name)}`;
  }

  private async verifyPolicy() {
    await verifyPhotoBucket(this.bucket, async (name) => {
      const result = await this.request(
        `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(name)}`,
      );
      if (!result.ok) throw new Error("CLOUD_PHOTO_UNAVAILABLE");
      return result.json();
    });
  }

  private async objectMetadata(name: string) {
    const result = await this.request(this.objectUrl(name));
    if (result.status === 404) return null;
    if (!result.ok) throw new Error("CLOUD_PHOTO_UNAVAILABLE");
    return metadata.parse(await result.json());
  }

  async write(task: string, bytes: Uint8Array): Promise<string> {
    const name = this.object(task);
    if (!bytes.byteLength || bytes.byteLength > MAX_PHOTO) throw new Error("CLOUD_PHOTO_SIZE");
    await this.verifyPolicy();
    const query = new URLSearchParams({ uploadType: "media", name, ifGenerationMatch: "0" });
    const result = await this.request(
      `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(this.bucket)}/o?${query}`,
      {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: Uint8Array.from(bytes).buffer,
      },
    );
    if (!result.ok) throw new Error("CLOUD_PHOTO_WRITE_FAILED");
    return uploaded.parse(await result.json()).generation;
  }

  async read(task: string, maxBytes: number): Promise<Uint8Array | null> {
    const name = this.object(task);
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_PHOTO)
      throw new Error("CLOUD_PHOTO_SIZE");
    const info = await this.objectMetadata(name);
    if (!info) return null;
    if (BigInt(info.size) > BigInt(maxBytes) || BigInt(info.size) === 0n)
      throw new Error("CLOUD_PHOTO_SIZE");
    const query = new URLSearchParams({ alt: "media", ifGenerationMatch: info.generation });
    const result = await this.request(`${this.objectUrl(name)}?${query}`);
    if (!result.ok || !result.body) throw new Error("CLOUD_PHOTO_READ_FAILED");
    const reader = result.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        total += chunk.value.byteLength;
        if (total > maxBytes) throw new Error("CLOUD_PHOTO_SIZE");
        chunks.push(chunk.value);
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
    if (BigInt(total) !== BigInt(info.size)) throw new Error("CLOUD_PHOTO_READ_FAILED");
    const output = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return output;
  }

  async remove(task: string): Promise<void> {
    const name = this.object(task);
    await this.verifyPolicy();
    const info = await this.objectMetadata(name);
    if (info) {
      const query = new URLSearchParams({ ifGenerationMatch: info.generation });
      const result = await this.request(`${this.objectUrl(name)}?${query}`, { method: "DELETE" });
      if (!result.ok) throw new Error("CLOUD_PHOTO_DELETE_FAILED");
    }
    if (await this.objectMetadata(name)) throw new Error("CLOUD_PHOTO_DELETE_FAILED");
    // Policy can change during deletion; a failed second check is never reported as complete.
    await this.verifyPolicy();
  }
}
