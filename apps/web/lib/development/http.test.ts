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
