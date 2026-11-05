import { describe, expect, it } from "vitest";
import { getStore } from "./store";

// The in-memory store is the offline default; these tests pin the behaviour every caller relies on.
describe("memory store", () => {
  it("reports the mock kind by default", () => {
    expect(getStore().kind).toBe("memory");
  });

  it("round-trips documents and returns a copy, not the stored object", async () => {
    const store = getStore();
    await store.set("t", "a", { value: 1 });
    const first = await store.get("t", "a");
    expect(first).toEqual({ value: 1 });
    first!.value = 99;
    expect(await store.get("t", "a")).toEqual({ value: 1 });
  });

  it("returns null for a missing document", async () => {
    expect(await getStore().get("t", "missing")).toBeNull();
  });

  it("merges patches instead of replacing the document", async () => {
    const store = getStore();
    await store.set("patch", "a", { a: 1, b: 2 });
    await store.update("patch", "a", { b: 3 });
    expect(await store.get("patch", "a")).toEqual({ a: 1, b: 3 });
  });

  it("creates the document when patching something that does not exist", async () => {
    const store = getStore();
    await store.update("patchnew", "a", { a: 1 });
    expect(await store.get("patchnew", "a")).toEqual({ a: 1 });
  });

  it("only queries within the requested collection", async () => {
    const store = getStore();
    await store.set("c1", "a", { flag: true });
    await store.set("c2", "b", { flag: true });
    const found = await store.query("c1", "flag", true, 10);
    expect(found).toEqual([{ flag: true }]);
  });

  it("does not return documents whose field differs", async () => {
    const store = getStore();
    await store.set("q", "visible", { visible: true });
    await store.set("q", "hidden", { visible: false });
    const found = await store.query("q", "visible", true, 10);
    expect(found.map((d) => d.visible)).toEqual([true]);
  });

  it("respects the query limit", async () => {
    const store = getStore();
    for (let i = 0; i < 5; i++) await store.set("lim", String(i), { ok: true });
    expect(await store.query("lim", "ok", true, 2)).toHaveLength(2);
  });

  it("keeps blobs separate from documents and across buckets", async () => {
    const store = getStore();
    const bytes = Buffer.from("hello");
    await store.putBlob("private", "p/1.jpg", bytes, "image/jpeg");
    expect(await store.getBlob("assets", "p/1.jpg")).toBeNull();
    const read = await store.getBlob("private", "p/1.jpg");
    expect(read?.contentType).toBe("image/jpeg");
    expect(read?.bytes.equals(bytes)).toBe(true);
  });

  it("deletes blobs and reports a missing blob as null", async () => {
    const store = getStore();
    await store.putBlob("private", "gone.jpg", Buffer.from("x"), "image/jpeg");
    await store.deleteBlob("private", "gone.jpg");
    expect(await store.getBlob("private", "gone.jpg")).toBeNull();
    await expect(store.deleteBlob("private", "never.jpg")).resolves.toBeUndefined();
  });
});
