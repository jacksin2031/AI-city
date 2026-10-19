import { describe, expect, it } from "vitest";
import { createVisitorBoundary } from "./credentials";
import { handleVisitorRequest as handleRaw } from "./http";
import { VisitorService } from "./service";
import { MemoryVisitorStore } from "./test-store";

const origin = "https://exhibit.example";
const security = createVisitorBoundary("fixture-only-secret".repeat(3), "http-test");
const handleVisitorRequest = (
  request: Request,
  service: VisitorService | null,
  enabled: boolean,
  remoteOrigin?: string,
) => handleRaw(request, service, enabled, remoteOrigin, security);
const admission = async (service: VisitorService) => ({
  invitation: security.signInvitation((await service.createInvitation()).code),
});
const request = (path: string, body?: unknown, cookie?: string) =>
  new Request(`${origin}/api/visitor/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      host: "exhibit.example",
      ...(body === undefined ? {} : { origin, "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
describe("persistent visitor HTTP boundary", () => {
  it("is disabled by default and does not mint credentials in JSON", async () => {
    const service = new VisitorService(new MemoryVisitorStore());
    expect(
      (await handleVisitorRequest(request("session", {}), service, false, origin)).status,
    ).toBe(404);
    expect((await handleVisitorRequest(request("session", {}), service, true, origin)).status).toBe(
      401,
    );
    const created = await handleVisitorRequest(
      request("session", await admission(service)),
      service,
      true,
      origin,
    );
    expect(created.status).toBe(200);
    expect(await created.json()).toEqual({ mode: "MOCK" });
    expect(created.headers.get("set-cookie")).toMatch(
      /^ai-city-visitor=[a-f0-9]{64}\.[a-f0-9]{64}; Path=\/api\/visitor; HttpOnly; SameSite=Strict; Max-Age=86400; Secure$/,
    );
  });
  it("isolates visitors, rejects origin/extra fields, and exposes no bulk snapshot", async () => {
    const service = new VisitorService(new MemoryVisitorStore());
    const a = await handleVisitorRequest(
      request("session", await admission(service)),
      service,
      true,
      origin,
    );
    const b = await handleVisitorRequest(
      request("session", await admission(service)),
      service,
      true,
      origin,
    );
    const cookieA = a.headers.get("set-cookie")?.split(";")[0];
    const cookieB = b.headers.get("set-cookie")?.split(";")[0];
    const crossSiteRead = request("jobs/current", undefined, cookieA);
    crossSiteRead.headers.set("sec-fetch-site", "same-site");
    expect((await handleVisitorRequest(crossSiteRead, service, true, origin)).status).toBe(403);
    const job = await handleVisitorRequest(
      request(
        "jobs",
        {
          eventId: "fixture-event",
          requestId: "http-test",
          nickname: "架空",
          sampleId: "sora",
          answers: null,
          scenario: "SUCCESS",
        },
        cookieA,
      ),
      service,
      true,
      origin,
    );
    expect(job.status).toBe(201);
    const id = (await job.json()).job.jobId;
    expect(
      (await handleVisitorRequest(request(`jobs/${id}`, undefined, cookieB), service, true, origin))
        .status,
    ).toBe(404);
    expect(
      (
        await handleVisitorRequest(
          request("city/snapshot", undefined, cookieA),
          service,
          true,
          origin,
        )
      ).status,
    ).toBe(404);
    expect(
      (await handleVisitorRequest(request("session", { role: "ADMIN" }), service, true, origin))
        .status,
    ).toBe(400);
    const badOrigin = request("session", {});
    badOrigin.headers.set("origin", "https://evil.example");
    expect((await handleVisitorRequest(badOrigin, service, true, origin)).status).toBe(403);
    expect(
      (
        await handleVisitorRequest(
          request("jobs/current", undefined, "ai-city-link=unrelated"),
          service,
          true,
          origin,
        )
      ).status,
    ).toBe(401);
  });
  it("fails closed on database failure and rejects oversized bodies", async () => {
    const service = new VisitorService({
      run: async () => {
        throw new Error("private database error");
      },
    });
    const result = await handleVisitorRequest(
      request("session", { invitation: security.signInvitation("a".repeat(32)) }),
      service,
      true,
      origin,
    );
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("private database error");
    expect(
      (
        await handleVisitorRequest(
          request("session", { invitation: "a".repeat(64) }),
          service,
          true,
          origin,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await handleVisitorRequest(
          request("jobs/current", undefined, `ai-city-visitor=${"a".repeat(64)}.${"b".repeat(64)}`),
          service,
          true,
          origin,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await handleVisitorRequest(
          request("session", { value: "x".repeat(5000) }),
          service,
          true,
          origin,
        )
      ).status,
    ).toBe(413);
  });
});
