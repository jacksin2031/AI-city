import { describe, expect, it } from "vitest";
import { createVisitorBoundary } from "./credentials";
import { handleVisitorRequest } from "./http";
import { VisitorService } from "./service";
import { MemoryVisitorStore } from "./test-store";

describe("code-free visitor admission", () => {
  it("fails closed on malformed persisted admission state", async () => {
    const store = new MemoryVisitorStore();
    await store.run(async (tx) => {
      tx.set("meta/open-admission", { startedAt: 1, count: "untrusted" });
    });
    await expect(new VisitorService(store).createOpenSession()).rejects.toMatchObject({
      code: "STORAGE_INVALID",
      status: 500,
    });
  });
  it("persists the twelve-per-minute quota across services without charging resumed sessions", async () => {
    let now = 1000;
    const store = new MemoryVisitorStore();
    const service = new VisitorService(store, () => now);
    const first = await service.createOpenSession();
    for (let i = 1; i < 12; i++) await service.createOpenSession();
    const restarted = new VisitorService(store, () => now);
    expect((await restarted.createOpenSession(first.token)).token).toBe(first.token);
    const before = store.dump();
    await expect(restarted.createOpenSession()).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
    });
    expect(store.dump()).toEqual(before);
    now += 60000;
    expect((await restarted.createOpenSession()).token).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not turn code-free admission into permission to read another visitor's job", async () => {
    const service = new VisitorService(new MemoryVisitorStore());
    const first = await service.createOpenSession();
    const second = await service.createOpenSession();
    const job = await service.createJob(first.token, {
      eventId: "fixture-event",
      requestId: "open-job",
      nickname: "架空",
      sampleId: "sora",
      answers: null,
      scenario: "SUCCESS",
    });
    await expect(service.getJob(second.token, job.job.jobId)).rejects.toMatchObject({
      code: "JOB_NOT_FOUND",
      status: 404,
    });
  });

  it("requires explicit enablement and rejects excess admission before touching storage", async () => {
    const origin = "https://exhibit.example";
    let reads = 0;
    const store = new MemoryVisitorStore();
    const service = new VisitorService({
      run: (action) => {
        reads++;
        return store.run(action);
      },
    });
    const boundary = createVisitorBoundary("fixture-only-stable-secret".repeat(2), "open-http");
    const request = (body: unknown = {}) =>
      new Request(`${origin}/api/visitor/session`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    expect((await handleVisitorRequest(request(), service, true, origin, boundary)).status).toBe(
      401,
    );
    expect(reads).toBe(0);
    let firstCookie = "";
    for (let i = 0; i < 12; i++) {
      const result = await handleVisitorRequest(request(), service, true, origin, boundary, true);
      expect(result.status).toBe(200);
      expect(await result.json()).toEqual({ mode: "MOCK" });
      expect(result.headers.get("set-cookie")).toContain("; Secure");
      if (i === 0) firstCookie = result.headers.get("set-cookie")?.split(";")[0] ?? "";
    }
    const before = reads;
    expect(
      (await handleVisitorRequest(request(), service, true, origin, boundary, true)).status,
    ).toBe(429);
    expect(reads).toBe(before);
    const resume = request();
    resume.headers.set("cookie", firstCookie);
    expect((await handleVisitorRequest(resume, service, true, origin, boundary, true)).status).toBe(
      200,
    );
    expect(
      (
        await handleVisitorRequest(
          request({ role: "ADMIN" }),
          service,
          true,
          origin,
          boundary,
          true,
        )
      ).status,
    ).toBe(400);
    const crossOrigin = request();
    crossOrigin.headers.set("origin", "https://wrong.invalid");
    expect(
      (await handleVisitorRequest(crossOrigin, service, true, origin, boundary, true)).status,
    ).toBe(403);
  });
});
