import { describe, expect, it } from "vitest";
import { handleDevelopmentRequest } from "./http";
import { LocalParticipationService } from "./service";

function request(path: string, body?: unknown, cookie?: string, origin = "http://127.0.0.1:3000") {
  return new Request(`http://127.0.0.1:3000/api/dev/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json", origin }),
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("local API boundary", () => {
  it("refuses unauthenticated hosted participation before allocating a session", async () => {
    const req = new Request("https://city.example/api/dev/session", {
      method: "POST",
      headers: { origin: "https://city.example", "content-type": "application/json" },
      body: "{}",
    });
    expect(
      (
        await handleDevelopmentRequest(
          req,
          new LocalParticipationService(),
          true,
          "https://city.example",
        )
      ).status,
    ).toBe(403);
  });
  it("never treats old local consent as hosted publication consent", async () => {
    let now = 0;
    const service = new LocalParticipationService(() => now);
    const token = service.createSession();
    const job = service.createJob(token, {
      eventId: "fixture-event",
      requestId: "hosted-scope",
      nickname: "架空",
      sampleId: "sora",
      answers: null,
      scenario: "SUCCESS",
    });
    now = 1100;
    const post = (consent: unknown) =>
      new Request(`https://city.example/api/dev/jobs/${job.job.jobId}/confirm`, {
        method: "POST",
        headers: {
          origin: "https://city.example",
          "content-type": "application/json",
          cookie: `ai-city-local-session=${token}`,
        },
        body: JSON.stringify(consent),
      });
    const base = {
      avatarPublicConsent: true,
      consentVersion: 1,
      fields: { nickname: true, personality: false, interests: false },
    };
    expect(
      (await handleDevelopmentRequest(post(base), service, true, "https://city.example", true))
        .status,
    ).toBe(403);
    expect(service.snapshot().residents).toHaveLength(0);
    expect(
      (
        await handleDevelopmentRequest(
          post({ ...base, consentVersion: 2, publicationScope: "HOSTED_PREVIEW" }),
          service,
          true,
          "https://city.example",
          true,
        )
      ).status,
    ).toBe(200);
    expect(service.snapshot().residents[0]?.consentVersion).toBe(2);
  });
  it("supports the configured HTTPS participant origin without allowing arbitrary hosts", async () => {
    const service = new LocalParticipationService();
    const response = await handleDevelopmentRequest(
      new Request("https://city.example/api/dev/session", {
        method: "POST",
        headers: { origin: "https://city.example", "content-type": "application/json" },
        body: "{}",
      }),
      service,
      true,
      "https://city.example",
      true,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });
  it("uses the verified loopback Host for origin checks when Next normalizes the internal URL", async () => {
    const request = new Request("http://localhost:3000/api/dev/session", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3000",
        origin: "http://127.0.0.1:3000",
        "content-type": "application/json",
      },
      body: "{}",
    });
    expect(
      (await handleDevelopmentRequest(request, new LocalParticipationService(), true)).status,
    ).toBe(200);
    const forged = new Request("http://localhost:3000/api/dev/session", {
      method: "POST",
      headers: {
        host: "evil.example:3000",
        origin: "http://evil.example:3000",
        "content-type": "application/json",
      },
      body: "{}",
    });
    expect(
      (await handleDevelopmentRequest(forged, new LocalParticipationService(), true)).status,
    ).toBe(403);
  });
  it("fails closed when disabled or requested through a non-loopback host", async () => {
    const service = new LocalParticipationService();
    expect(
      (
        await handleDevelopmentRequest(
          request("city/snapshot?eventId=fixture-event"),
          service,
          false,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await handleDevelopmentRequest(
          new Request("https://example.com/api/dev/session", { method: "POST" }),
          service,
          true,
        )
      ).status,
    ).toBe(403);
  });
  it("rejects cross-origin mutations, missing sessions, invalid bodies and unknown fields", async () => {
    const service = new LocalParticipationService();
    expect(
      (
        await handleDevelopmentRequest(
          request("session", {}, undefined, "https://evil.example"),
          service,
          true,
        )
      ).status,
    ).toBe(403);
    expect((await handleDevelopmentRequest(request("jobs", {}), service, true)).status).toBe(401);
    const session = await handleDevelopmentRequest(request("session", {}), service, true);
    const cookie = session.headers.get("set-cookie")?.split(";")[0] ?? "";
    expect(session.headers.get("set-cookie")).toContain("HttpOnly");
    expect(session.headers.get("set-cookie")).toContain("SameSite=Strict");
    expect(
      (await handleDevelopmentRequest(request("jobs", { photo: "private" }, cookie), service, true))
        .status,
    ).toBe(400);
    expect(
      (await handleDevelopmentRequest(request("session", { unused: true }), service, true)).status,
    ).toBe(400);
    expect(
      (await handleDevelopmentRequest(request("city/snapshot?eventId=other"), service, true))
        .status,
    ).toBe(404);
    expect(
      (
        await handleDevelopmentRequest(
          request("city/snapshot?eventId=fixture-event&eventId=other"),
          service,
          true,
        )
      ).status,
    ).toBe(400);
  });
  it("rejects oversized JSON before creating state", async () => {
    const response = await handleDevelopmentRequest(
      request("session", { data: "x".repeat(5000) }),
      new LocalParticipationService(),
      true,
    );
    expect(response.status).toBe(413);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
