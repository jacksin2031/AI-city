import { describe, expect, it, vi } from "vitest";
import { CloudAssetStorage } from "./cloud-asset-storage";

const task = "spine-12345678-1234-4123-8123-123456789abc";
const other = "spine-87654321-4321-4321-8321-cba987654321";
const bucket = "ai-city-private-asset-test";
const safe = {
  name: bucket,
  location: "ASIA-NORTHEAST1",
  softDeletePolicy: { retentionDurationSeconds: "0" },
  iamConfiguration: {
    publicAccessPrevention: "enforced",
    uniformBucketLevelAccess: { enabled: true },
  },
};
const json = (body: unknown, status = 200) => Response.json(body, { status });
const make = (fetcher: typeof fetch) => new CloudAssetStorage(bucket, async () => "t", fetcher);

describe("private cloud Spine assets", () => {
  it("writes only a new object under the task prefix after checking the bucket", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json(safe))
      .mockResolvedValueOnce(json({ generation: "9" }));
    await expect(make(fetcher).write(task, "skeleton.json", new Uint8Array([1]))).resolves.toBe(
      "9",
    );
    const [url, init] = fetcher.mock.calls[1] as [string, RequestInit];
    expect(url).toContain("ifGenerationMatch=0");
    expect(url).toContain(encodeURIComponent(`published/${task}/skeleton.json`));
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(init.redirect).toBe("error");
  });
  it("rejects unsafe buckets, bad task ids and path-like names before any write", async () => {
    const unsafe = vi.fn().mockResolvedValue(json({ ...safe, iamConfiguration: {} }));
    await expect(make(unsafe).write(task, "a.png", new Uint8Array([1]))).rejects.toThrow();
    expect(unsafe).toHaveBeenCalledTimes(1);
    const fetcher = vi.fn();
    for (const [t, n] of [
      ["../x", "a.png"],
      [task, "../a.png"],
      [task, "a/b.png"],
      [task, "noext"],
    ] as const)
      await expect(make(fetcher).write(t, n, new Uint8Array([1]))).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("reads a pinned generation, returns null for a missing object and enforces the size cap", async () => {
    const ok = vi
      .fn()
      .mockResolvedValueOnce(json({ generation: "4", size: "3" }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
    expect(await make(ok).read(task, "a.png", 10)).toEqual(new Uint8Array([1, 2, 3]));
    expect(String(ok.mock.calls[1]?.[0])).toContain("ifGenerationMatch=4");
    expect(
      await make(vi.fn().mockResolvedValue(new Response(null, { status: 404 }))).read(
        task,
        "a.png",
        10,
      ),
    ).toBeNull();
    await expect(
      make(vi.fn().mockResolvedValue(json({ generation: "4", size: "99" }))).read(
        task,
        "a.png",
        10,
      ),
    ).rejects.toThrow("CLOUD_ASSET_SIZE");
  });
  it("serves through assetReader using only the file name", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ generation: "4", size: "1" }))
      .mockResolvedValueOnce(new Response(new Uint8Array([7])));
    const bytes = await make(fetcher).assetReader(task).read(`/avatars/${task}/v1/page.png`, 10);
    expect(bytes).toEqual(new Uint8Array([7]));
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      encodeURIComponent(`published/${task}/page.png`),
    );
  });
  it("removes a whole task but never touches another prefix", async () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${decodeURIComponent(url)}`);
      if (url.includes("/o?"))
        return json({ items: [{ name: `published/${task}/a.png`, generation: "1" }] });
      if (url.endsWith(`/b/${bucket}`)) return json(safe);
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      const gone = calls.some((c) => c.startsWith("DELETE"));
      return gone ? new Response(null, { status: 404 }) : json({ generation: "1", size: "1" });
    }) as unknown as typeof fetch;
    await make(fetcher).removeTask(task);
    expect(calls.some((c) => c.startsWith("DELETE") && c.includes(`published/${task}/a.png`))).toBe(
      true,
    );
    expect(calls.some((c) => c.includes(other))).toBe(false);
  });
  it("refuses a listing entry outside the task prefix instead of deleting it", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(json({ items: [{ name: `published/${other}/a.png`, generation: "1" }] }));
    await expect(make(fetcher).removeTask(task)).rejects.toThrow("CLOUD_ASSET_CLEANUP_INCOMPLETE");
  });
});
