import { describe, expect, it } from "vitest";
import { MemoryVisitorStore } from "./test-store";

describe("MemoryVisitorStore.listJobs", () => {
  async function seeded() {
    const store = new MemoryVisitorStore();
    await store.run(async (tx) => {
      tx.set("jobs/spine-a", { n: 1 });
      tx.set("jobs/spine-b", { n: 2 });
      tx.set("sessions/x", { n: 3 });
    });
    return store;
  }

  it("returns only job documents with the prefix removed", async () => {
    const jobs = await (await seeded()).listJobs(10);
    expect(jobs.map((job) => job.id).sort()).toEqual(["spine-a", "spine-b"]);
  });

  it("honours the limit", async () => {
    expect(await (await seeded()).listJobs(1)).toHaveLength(1);
  });

  it("rejects out-of-range limits", async () => {
    const store = await seeded();
    await expect(store.listJobs(0)).rejects.toThrow();
    await expect(store.listJobs(202)).rejects.toThrow();
  });
});
