import { describe, expect, it } from "vitest";
import { LocalParticipationService } from "../development/service";
import { handleLinkRequest } from "./http";
import { DeviceLinkService } from "./service";

const key = "test-only-manager-key-not-a-real-secret";
const remote = "https://city.example";
const request = (
  path: string,
  input?: unknown,
  cookie?: string,
  origin = "http://127.0.0.1:3000",
  host?: string,
) =>
  new Request(`${origin}/api/link/${path}`, {
    method: input === undefined ? "GET" : "POST",
    headers: {
      ...(input === undefined ? {} : { "content-type": "application/json", origin }),
      ...(cookie ? { cookie } : {}),
      ...(host ? { host } : {}),
    },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
describe("device HTTP boundary", () => {
  it("does not expose bootstrap just because a request claims a loopback Host", async () => {
    const service = new DeviceLinkService(new LocalParticipationService(), key);
    expect((await handleLinkRequest(request("bootstrap", {}), service, true)).status).toBe(403);
    expect(
      (await handleLinkRequest(request("bootstrap", {}), service, true, undefined, true)).status,
    ).toBe(200);
  });
  it("requires opt in, exact HTTPS origin and forbids remote bootstrap", async () => {
    const service = new DeviceLinkService(new LocalParticipationService(), key);
    expect((await handleLinkRequest(request("admin"), service, false)).status).toBe(404);
    expect(
      (await handleLinkRequest(request("login", { key }, undefined, remote), service, true)).status,
    ).toBe(403);
    expect(
      (await handleLinkRequest(request("bootstrap", {}, undefined, remote), service, true, remote))
        .status,
    ).toBe(403);
    expect(
      (
        await handleLinkRequest(
          request("login", { key }, undefined, "http://city.example"),
          service,
          true,
          "http://city.example",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handleLinkRequest(
          request("login", { key }, undefined, remote, "evil.example"),
          service,
          true,
          remote,
        )
      ).status,
    ).toBe(403);
    const good = await handleLinkRequest(
      request("login", { key }, undefined, remote),
      service,
      true,
      remote,
    );
    expect(good.status).toBe(200);
    expect(good.headers.get("set-cookie")).toContain("Secure");
    expect(good.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Strict");
    expect(await good.json()).toEqual({ mode: "MOCK" });
  });
  it("isolates manager/device cookies and rejects cross-site mutations and extra data", async () => {
    const service = new DeviceLinkService(new LocalParticipationService(), key);
    const admin = service.login(key);
    const display = service.pair(service.createPairing(admin).code);
    const cookie = `ai-city-link=${display}`;
    expect(
      (await handleLinkRequest(request("admin", undefined, cookie), service, true)).status,
    ).toBe(403);
    expect(
      (
        await handleLinkRequest(
          request("control", { expectedRevision: 0, displayMode: "LIVE" }, cookie),
          service,
          true,
        )
      ).status,
    ).toBe(403);
    expect(
      (await handleLinkRequest(request("display", undefined, cookie), service, true)).status,
    ).toBe(200);
    const cross = request(
      "control",
      { expectedRevision: 0, displayMode: "LIVE" },
      `ai-city-link=${admin}`,
    );
    cross.headers.set("origin", "https://evil.example");
    expect((await handleLinkRequest(cross, service, true)).status).toBe(403);
    expect(
      (await handleLinkRequest(request("login", { key, photo: "private" }), service, true)).status,
    ).toBe(400);
    expect(
      (await handleLinkRequest(request("login", { key: "x".repeat(5000) }), service, true)).status,
    ).toBe(413);
    expect(
      (await handleLinkRequest(request("display?token=leak", undefined, cookie), service, true))
        .status,
    ).toBe(400);
  });
});
