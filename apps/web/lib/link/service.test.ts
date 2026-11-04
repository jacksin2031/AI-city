import { describe, expect, it } from "vitest";
import { LocalParticipationService } from "../development/service";
import { DeviceLinkService } from "./service";

const key = "test-only-manager-key-not-a-real-secret";
function setup() {
  let now = 1000;
  const participation = new LocalParticipationService(() => now);
  const service = new DeviceLinkService(participation, key, () => now);
  return {
    service,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
describe("device pairing and control", () => {
  it("requires a manager key and keeps display sessions read only", () => {
    const { service } = setup();
    expect(() => service.login("wrong")).toThrow();
    const admin = service.login(key);
    const pairing = service.createPairing(admin);
    const display = service.pair(pairing.code);
    expect(service.display(display).control.displayMode).toBe("DEMO");
    expect(() => service.update(display, { expectedRevision: 0, displayMode: "LIVE" })).toThrow();
    expect(() => service.adminState(display)).toThrow();
    expect(() => service.pair(pairing.code)).toThrow();
  });
  it("expires pairing codes, limits guesses and expires sessions", () => {
    const { service, advance } = setup();
    const admin = service.login(key);
    const first = service.createPairing(admin);
    advance(180001);
    expect(() => service.pair(first.code)).toThrow();
    const second = service.createPairing(admin);
    for (let attempt = 0; attempt < 5; attempt++) expect(() => service.pair("00000000")).toThrow();
    expect(() => service.pair(second.code)).not.toThrow();
    advance(3_600_001);
    expect(() => service.adminState(admin)).toThrow();
  });
  it("applies ordered controls, rejects stale writes and revokes display access", () => {
    const { service } = setup();
    const admin = service.login(key);
    const display = service.pair(service.createPairing(admin).code);
    service.update(admin, { expectedRevision: 0, displayMode: "LIVE", motionEnabled: false });
    expect(service.display(display).control).toMatchObject({
      revision: 1,
      displayMode: "LIVE",
      motionEnabled: false,
    });
    expect(() => service.update(admin, { expectedRevision: 0, displayMode: "DEMO" })).toThrow();
    service.update(admin, { expectedRevision: 1, displayMode: "MAINTENANCE" });
    expect(service.display(display).snapshot).toBeNull();
    service.revokeDisplays(admin);
    expect(() => service.display(display)).toThrow();
    expect(service.adminState(admin).pairedDisplays).toBe(0);
  });
  it("does not reset pairing guesses by asking for another code and throttles login guesses", () => {
    const { service } = setup();
    const admin = service.login(key);
    service.createPairing(admin);
    for (let i = 0; i < 12; i++) {
      try {
        service.pair("00000000");
      } catch {}
    }
    const next = service.createPairing(admin);
    expect(() => service.pair(next.code)).not.toThrow();
    for (let i = 0; i < 6; i++) {
      try {
        service.login("wrong");
      } catch {}
    }
    expect(() => service.login(key, "another-device")).not.toThrow();
  });
  it("never lets invalid global login/pair floods block correct credentials", () => {
    const { service } = setup();
    const admin = service.login(key);
    const code = service.createPairing(admin).code;
    for (let i = 0; i < 210; i++) {
      try {
        service.login("wrong", `client-${i}`);
      } catch {}
      try {
        service.pair("00000000", `client-${i}`);
      } catch {}
    }
    expect(() => service.login(key, "legitimate")).not.toThrow();
    expect(() => service.pair(code, "legitimate")).not.toThrow();
    expect(() => service.pair(code)).toThrow();
  });
});

it("lets only an admin add and remove fictional presets from the display", () => {
  const { service } = setup();
  const admin = service.login(key);
  const display = service.pair(service.createPairing(admin).code);
  service.update(admin, { expectedRevision: 0, displayMode: "LIVE" });
  const before = service.display(display).snapshot;
  expect(before?.residents).toHaveLength(0);
  expect(() =>
    service.setPreset(display, { expectedRevision: 1, presetId: "aoi", enabled: true }),
  ).toThrow();
  const result = service.setPreset(admin, { expectedRevision: 1, presetId: "aoi", enabled: true });
  expect(result.presetIds).toEqual(["aoi"]);
  expect(result.snapshot.residents).toHaveLength(0);
  const added = service.display(display).snapshot;
  expect(added?.residents.map((resident) => resident.residentId)).toEqual(["preset-aoi"]);
  expect(added?.residents[0]?.nickname).toContain("見本");
  expect(added?.eventSeq).toBeGreaterThan(before?.eventSeq ?? -1);
  expect(added?.streamId).toBe(before?.streamId);
  const repeated = service.setPreset(admin, {
    expectedRevision: 2,
    presetId: "aoi",
    enabled: true,
  });
  expect(repeated.control.revision).toBe(2);
  expect(service.display(display).snapshot?.residents).toHaveLength(1);
  expect(() =>
    service.setPreset(admin, { expectedRevision: 1, presetId: "aoi", enabled: false }),
  ).toThrow();
  service.setPreset(admin, { expectedRevision: 2, presetId: "aoi", enabled: false });
  expect(service.display(display).snapshot?.residents).toHaveLength(0);
});

it("does not resurrect removed residents when display snapshots arrive out of order", async () => {
  const { developmentCitySnapshot } = await import("@ai-city/contracts/development");
  const { service } = setup();
  const old = { ...developmentCitySnapshot, eventSeq: 1 };
  const removed = { ...old, eventSeq: 2, residents: [], avatars: [] };
  service.withPresets(old, "LIVE");
  const newest = service.withPresets(removed, "LIVE");
  expect(() => service.withPresets(old, "LIVE")).toThrow();
  expect(service.withPresets(removed, "LIVE").eventSeq).toBe(newest.eventSeq);
});
