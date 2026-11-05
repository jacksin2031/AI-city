import { describe, expect, it, vi } from "vitest";
import { CloudPhotoStorage } from "./cloud-photo-storage";

const task = "spine-12345678-1234-4123-8123-123456789abc";
const bucket = "ai-city-private-photo-test";
const safe = {
  name: bucket,
  location: "ASIA-NORTHEAST1",
  softDeletePolicy: { retentionDurationSeconds: "0" },
  iamConfiguration: {
    publicAccessPrevention: "enforced",
    uniformBucketLevelAccess: { enabled: true },
  },
};
const response = (body: unknown, status = 200) => Response.json(body, { status });

describe("private cloud photos", () => {
  it("checks the bucket and uploads only a new task-scoped photo", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(safe))
      .mockResolvedValueOnce(response({ generation: "123" }));
    const storage = new CloudPhotoStorage(bucket, async () => "test-token", fetcher);
    await expect(storage.write(task, new Uint8Array([1, 2]))).resolves.toBe("123");
    const [url, options] = fetcher.mock.calls[1] as [string, RequestInit];
    expect(url).toContain("ifGenerationMatch=0");
    expect(url).toContain(encodeURIComponent(`private/${task}/photo.png`));
    expect(options.method).toBe("POST");
    expect(options.redirect).toBe("error");
  });
  it("never uploads when bucket metadata is unsafe or the task is invalid", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        response({ ...safe, softDeletePolicy: { retentionDurationSeconds: "604800" } }),
      );
    const storage = new CloudPhotoStorage(bucket, async () => "test-token", fetcher);
    await expect(storage.write(task, new Uint8Array([1]))).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(storage.write("../photo", new Uint8Array([1]))).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("refuses an existing object rather than overwriting it", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(safe))
      .mockResolvedValueOnce(new Response(null, { status: 412 }));
    await expect(
      new CloudPhotoStorage(bucket, async () => "test-token", fetcher).write(
        task,
        new Uint8Array([1]),
      ),
    ).rejects.toThrow("CLOUD_PHOTO_WRITE_FAILED");
  });
  it("reads a pinned generation and refuses oversized objects", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ generation: "123", size: "3" }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
    const storage = new CloudPhotoStorage(bucket, async () => "test-token", fetcher);
    expect(await storage.read(task, 3)).toEqual(new Uint8Array([1, 2, 3]));
    expect(String(fetcher.mock.calls[1]?.[0])).toContain("ifGenerationMatch=123");
    const big = vi.fn().mockResolvedValue(response({ generation: "123", size: "4" }));
    await expect(
      new CloudPhotoStorage(bucket, async () => "test-token", big).read(task, 3),
    ).rejects.toThrow();
    expect(big).toHaveBeenCalledTimes(1);
  });
  it("deletes only the observed generation and checks bucket policy before reporting completion", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(safe))
      .mockResolvedValueOnce(response({ generation: "123", size: "3" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(response(safe));
    const storage = new CloudPhotoStorage(bucket, async () => "test-token", fetcher);
    await storage.remove(task);
    expect(String(fetcher.mock.calls[2]?.[0])).toContain("ifGenerationMatch=123");
    expect((fetcher.mock.calls[2]?.[1] as RequestInit | undefined)?.method).toBe("DELETE");
  });
  it("does not report deletion as complete if the bucket policy cannot be verified", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(safe))
      .mockResolvedValueOnce(response({ generation: "123", size: "3" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        response({ ...safe, softDeletePolicy: { retentionDurationSeconds: "604800" } }),
      );
    await expect(
      new CloudPhotoStorage(bucket, async () => "test-token", fetcher).remove(task),
    ).rejects.toThrow();
  });
  it("keeps cleanup pending if another generation exists after deletion", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(safe))
      .mockResolvedValueOnce(response({ generation: "123", size: "3" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(response({ generation: "124", size: "3" }));
    await expect(
      new CloudPhotoStorage(bucket, async () => "test-token", fetcher).remove(task),
    ).rejects.toThrow();
  });
  it("does not report success when a generation precondition fails", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(safe))
      .mockResolvedValueOnce(response({ generation: "123", size: "3" }))
      .mockResolvedValueOnce(new Response(null, { status: 412 }));
    await expect(
      new CloudPhotoStorage(bucket, async () => "test-token", fetcher).remove(task),
    ).rejects.toThrow("CLOUD_PHOTO_DELETE_FAILED");
  });
  it("rejects downloads exceeding the stated metadata size", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ generation: "123", size: "1" }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2])));
    await expect(
      new CloudPhotoStorage(bucket, async () => "test-token", fetcher).read(task, 10),
    ).rejects.toThrow();
  });
});
