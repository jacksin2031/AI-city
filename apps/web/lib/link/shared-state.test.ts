import { describe, expect, it } from "vitest";
import { LocalParticipationService } from "../development/service";
import { MemoryVisitorStore } from "../visitor/test-store";
import { handleLinkRequest } from "./http";
import { CONNECTED_WINDOW_MS, DeviceLinkService, DeviceStateConflictError } from "./service";
import { withSharedDeviceState } from "./shared-state";

const key = "test-only-manager-key-not-a-real-secret";
const remote = "https://city.example";
const HOUR = 3_600_000;
const MINUTE = 60_000;

function cluster() {
  let now = 1_000_000;
  const store = new MemoryVisitorStore();
  const spawn = () => {
    const service = new DeviceLinkService(new LocalParticipationService(() => now), key, () => now);
    service.attachStore(store);
    return service;
  };
  return {
    store,
    spawn,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
const request = (path: string, cookie?: string, input?: unknown) =>
  new Request(`${remote}/api/link/${path}`, {
    method: input === undefined ? "GET" : "POST",
    headers: {
      ...(input === undefined ? {} : { "content-type": "application/json", origin: remote }),
      ...(cookie ? { cookie } : {}),
    },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });

describe("shared device sessions", () => {
  it("keeps admin and tablet signed in across a process restart", async () => {
    const { spawn } = cluster();
    const first = spawn();
    const admin = first.login(key);
    const display = first.pair(first.createPairing(admin).code);
    await first.flush();

    const restarted = spawn();
    // Without loading shared state a fresh process knows nothing, which was the original defect.
    expect(() => restarted.display(display)).toThrow("PAIR_REQUIRED");
    await restarted.sync(display);
    expect(restarted.display(display).control.displayMode).toBe("LIVE");
    expect(restarted.adminState(admin)).toMatchObject({ pairedDisplays: 1, connectedDisplays: 1 });
  });

  it("restores controls and keeps the pairing code single-use across restarts", async () => {
    const { spawn } = cluster();
    const first = spawn();
    const admin = first.login(key);
    const code = first.createPairing(admin).code;
    first.update(admin, { expectedRevision: 0, displayMode: "MAINTENANCE" });
    await first.flush();

    const second = spawn();
    await second.sync();
    const display = second.pair(code);
    await second.flush();
    expect(second.display(display).control).toMatchObject({
      displayMode: "MAINTENANCE",
      revision: 1,
    });
    const third = spawn();
    await third.sync();
    expect(() => third.pair(code)).toThrow("PAIR_FAILED");
  });

  it("slides the display session while it polls and enforces idle and absolute limits", async () => {
    const { spawn, advance } = cluster();
    const service = spawn();
    const admin = service.login(key);
    const display = service.pair(service.createPairing(admin).code);
    // A kiosk polling hourly outlives the former fixed 8 hour window.
    for (let hour = 0; hour < 30; hour++) {
      advance(HOUR);
      expect(service.display(display).snapshot).not.toBeNull();
    }
    advance(24 * HOUR - 1);
    expect(() => service.display(display)).not.toThrow();
    advance(24 * HOUR + 1);
    expect(() => service.display(display)).toThrow("PAIR_REQUIRED");

    const tablet = service.pair(service.createPairing(service.login(key)).code);
    // Active polling still ends at the absolute cap of seven days, even though it is not idle.
    for (let step = 0; step < 7 * 24 - 1; step++) {
      advance(HOUR);
      service.display(tablet);
    }
    advance(2 * HOUR);
    expect(() => service.display(tablet)).toThrow("PAIR_REQUIRED");
  });

  it("keeps an active admin signed in past one hour but not past the twelve hour cap or when idle", () => {
    const { spawn, advance } = cluster();
    const service = spawn();
    const admin = service.login(key);
    for (let step = 0; step < 23; step++) {
      advance(30 * MINUTE);
      expect(() => service.adminState(admin)).not.toThrow();
    }
    advance(30 * MINUTE);
    expect(() => service.adminState(admin)).toThrow("PAIR_REQUIRED");
    const idle = service.login(key);
    advance(HOUR + 1);
    expect(() => service.adminState(idle)).toThrow("PAIR_REQUIRED");
  });

  it("counts only displays that are really connected and expires stale ones", async () => {
    const { spawn, advance } = cluster();
    const service = spawn();
    const admin = service.login(key);
    const display = service.pair(service.createPairing(admin).code);
    const otherAdmin = service.login(key);
    expect(service.adminState(admin)).toMatchObject({ pairedDisplays: 1, connectedDisplays: 1 });
    // Admin sessions never count as displays.
    expect(service.adminState(otherAdmin).pairedDisplays).toBe(1);
    advance(CONNECTED_WINDOW_MS + 1);
    expect(service.adminState(admin)).toMatchObject({ pairedDisplays: 1, connectedDisplays: 0 });
    service.display(display);
    expect(service.adminState(admin)).toMatchObject({ pairedDisplays: 1, connectedDisplays: 1 });
    advance(25 * HOUR);
    expect(service.adminState(service.login(key))).toMatchObject({
      pairedDisplays: 0,
      connectedDisplays: 0,
    });
  });

  it("shows a display polled on one instance as connected on another", async () => {
    const { spawn, advance } = cluster();
    const a = spawn();
    const b = spawn();
    const admin = a.login(key);
    const display = a.pair(a.createPairing(admin).code);
    await a.flush();
    await b.sync(admin);
    advance(20_000);
    a.display(display);
    await a.flush();
    advance(1_000);
    await b.sync(admin);
    expect(b.adminState(admin)).toMatchObject({ pairedDisplays: 1, connectedDisplays: 1 });
    // The tablet really stops polling: it disappears once the window has passed.
    advance(CONNECTED_WINDOW_MS + 1);
    await b.sync(admin);
    expect(b.adminState(admin).connectedDisplays).toBe(0);
  });

  it("keeps a steadily polling tablet connected on another instance for a long run", async () => {
    const { spawn, advance } = cluster();
    const a = spawn();
    const b = spawn();
    const admin = a.login(key);
    const display = a.pair(a.createPairing(admin).code);
    await a.flush();
    await b.sync(admin);
    // Tablet polls every second against `a`; the manager polls `b` every 2 seconds.
    for (let second = 1; second <= 300; second++) {
      advance(1_000);
      a.display(display);
      await a.flush();
      if (second % 2 === 0) {
        await b.sync(admin);
        expect(b.adminState(admin).connectedDisplays, `second ${second}`).toBe(1);
      }
    }
  });

  it("rejects a stale instance consuming a pairing code that another instance already used", async () => {
    const { spawn } = cluster();
    const a = spawn();
    const b = spawn();
    const admin = a.login(key);
    const code = a.createPairing(admin).code;
    await a.flush();
    await b.sync(admin);

    const first = a.pair(code);
    await a.flush();
    // `b` loaded the pairing before `a` consumed it and has not reloaded yet.
    const second = b.pair(code);
    await expect(b.flush()).rejects.toBeInstanceOf(DeviceStateConflictError);

    const c = spawn();
    await c.sync(first);
    expect(c.display(first).control.displayMode).toBe("LIVE");
    expect(c.adminState(admin).pairedDisplays).toBe(1);
    // The token minted by the losing instance was rolled back and is not known anywhere.
    expect(b.knows(second)).toBe(false);
    await c.sync(second);
    expect(() => c.display(second)).toThrow("PAIR_REQUIRED");
    expect(() => c.pair(code)).toThrow("PAIR_FAILED");
  });

  it("never resurrects a revoked tablet session from a stale structural flush", async () => {
    const { spawn, advance } = cluster();
    const a = spawn();
    const b = spawn();
    const admin = a.login(key);
    const display = a.pair(a.createPairing(admin).code);
    await a.flush();
    await b.sync(admin);
    await a.sync(admin);

    a.revokeDisplays(admin);
    await a.flush();
    // `b` still holds the old snapshot and makes an unrelated structural change.
    b.update(admin, { expectedRevision: 0, displayMode: "MAINTENANCE" });
    await expect(b.flush()).rejects.toBeInstanceOf(DeviceStateConflictError);

    advance(6_000);
    const c = spawn();
    await c.sync(admin);
    expect(c.adminState(admin).pairedDisplays).toBe(0);
    expect(() => c.display(display)).toThrow("PAIR_REQUIRED");
    // The rejected control change did not land either.
    expect(c.adminState(admin).control).toMatchObject({ displayMode: "LIVE", revision: 0 });
    // `b` converged on the stored state after the conflict.
    expect(() => b.display(display)).toThrow("PAIR_REQUIRED");
    expect(b.adminState(admin).control.revision).toBe(0);
  });

  it("returns no success response and no cookie when the HTTP flush loses the race", async () => {
    const { spawn } = cluster();
    const a = spawn();
    const b = spawn();
    const admin = a.login(key);
    const code = a.createPairing(admin).code;
    await a.flush();
    await b.sync(admin);
    a.pair(code);
    await a.flush();

    const call = () => handleLinkRequest(request("pair", undefined, { code }), b, true, remote);
    const response = await withSharedDeviceState(
      request("pair", undefined, { code }),
      b,
      remote,
      call,
    );
    expect(response.status).toBe(503);
    expect(response.headers.getSetCookie().some((c) => c.startsWith("ai-city-link="))).toBe(false);
    expect((await response.json()).error.code).toBe("STORE_UNAVAILABLE");
  });

  it("serialises concurrent flushes on one instance without self-conflicts", async () => {
    const { spawn } = cluster();
    const a = spawn();
    const admin = a.login(key);
    const code = a.createPairing(admin).code;
    const display = a.pair(code);
    await Promise.all([a.flush(), a.flush(), a.flush()]);
    a.revokeDisplays(admin);
    a.update(admin, { expectedRevision: 0, displayMode: "MAINTENANCE" });
    await Promise.all([a.flush(), a.flush()]);
    const b = spawn();
    await b.sync(admin);
    expect(b.adminState(admin).control.displayMode).toBe("MAINTENANCE");
    expect(() => b.display(display)).toThrow("PAIR_REQUIRED");
  });

  it("propagates revoke and logout, and a stale last-seen flush cannot resurrect a session", async () => {
    const { spawn, advance } = cluster();
    const a = spawn();
    const b = spawn();
    const admin = a.login(key);
    const display = a.pair(a.createPairing(admin).code);
    await a.flush();
    await b.sync(display);
    b.display(display);
    b.revokeDisplays(admin);
    await b.flush();
    advance(20_000);
    // `a` still believes the display exists and flushes only its last-seen time.
    a.display(display);
    await a.flush();
    const c = spawn();
    await c.sync(admin);
    expect(c.adminState(admin).pairedDisplays).toBe(0);
    await a.sync(display);
    expect(() => a.display(display)).toThrow("PAIR_REQUIRED");
    a.logout(admin);
    await a.flush();
    await c.sync(admin);
    advance(6_000);
    await c.sync(admin);
    expect(() => c.adminState(admin)).toThrow("PAIR_REQUIRED");
  });

  it("ignores malformed stored sessions and rejects unknown tokens", async () => {
    const { spawn, store } = cluster();
    await store.run(async (tx) => {
      tx.set("meta/device-link", {
        version: 1,
        sessions: {
          "not-a-hash": { role: "ADMIN", createdAt: 1_000_000, lastSeen: 1_000_000 },
          [`${"a".repeat(64)}`]: { role: "ROOT", createdAt: 1_000_000, lastSeen: 1_000_000 },
        },
        pairing: null,
        control: { bogus: true },
        presetIds: [],
        presetVersion: 0,
      });
    });
    const service = spawn();
    await service.sync();
    expect(() => service.adminState("a".repeat(64))).toThrow("PAIR_REQUIRED");
    expect(service.login(key)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("shared state at the HTTP boundary", () => {
  it("refreshes the cookie lifetime on authenticated reads and keeps Secure/HttpOnly", async () => {
    const { spawn, advance } = cluster();
    const service = spawn();
    const admin = service.login(key);
    const display = service.pair(service.createPairing(admin).code);
    const poll = () =>
      withSharedDeviceState(request("display", `ai-city-link=${display}`), service, remote, () =>
        handleLinkRequest(request("display", `ai-city-link=${display}`), service, true, remote),
      );
    const linkCookie = (response: Response) =>
      response.headers.getSetCookie().find((cookie) => cookie.startsWith("ai-city-link="));
    // Issued moments ago: no redundant Set-Cookie on the hot path.
    expect(linkCookie(await poll())).toBeUndefined();
    advance(2 * MINUTE);
    const refreshed = linkCookie(await poll());
    expect(refreshed).toContain(`ai-city-link=${display}`);
    expect(refreshed).toContain("HttpOnly; SameSite=Strict");
    expect(refreshed).toContain("Secure");
    expect(refreshed).toMatch(/Max-Age=86\d{3}/);
    // An unauthenticated or forged token never receives a cookie.
    const forged = await withSharedDeviceState(
      request("display", `ai-city-link=${"b".repeat(64)}`),
      service,
      remote,
      () =>
        handleLinkRequest(
          request("display", `ai-city-link=${"b".repeat(64)}`),
          service,
          true,
          remote,
        ),
    );
    expect(forged.status).toBe(401);
    expect(linkCookie(forged)).toBeUndefined();
  });

  it("fails closed when a login cannot be stored and does not hide the failure", async () => {
    const { spawn, store } = cluster();
    const service = spawn();
    const broken = Object.create(store) as MemoryVisitorStore;
    broken.run = async () => {
      throw new Error("firestore unavailable");
    };
    service.attachStore(broken);
    const response = await withSharedDeviceState(
      request("login", undefined, { key }),
      service,
      remote,
      () => handleLinkRequest(request("login", undefined, { key }), service, true, remote),
    );
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("STORE_UNAVAILABLE");
  });
});
