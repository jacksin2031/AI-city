import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  type CitySnapshot,
  CitySnapshotSchema,
  developmentAvatars,
  developmentCitySnapshot,
} from "@ai-city/contracts/development";
import {
  DeviceAdminSchema,
  type DeviceControl,
  DeviceDisplaySchema,
  type DevicePresetId,
  DevicePresetUpdateSchema,
  type DeviceUpdate,
  DeviceUpdateSchema,
  PRESET_CHARACTERS,
} from "@ai-city/contracts/device-link";
import type { z } from "zod";
import type { LocalParticipationService } from "../development/service";

export class DeviceLinkError extends Error {
  constructor(
    public code: string,
    public status = 403,
  ) {
    super(code);
  }
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
type Session = { role: "ADMIN" | "DISPLAY"; expiresAt: number; lastSeen: number };

/** Single-process mock controller. Sessions and pairing are intentionally lost on restart. */
export class DeviceLinkService {
  private sessions = new Map<string, Session>();
  private pairing: { digest: string; expiresAt: number } | null = null;
  private attempts = new Map<string, { count: number; until: number }>();
  private control: DeviceControl;
  private presetIds: DevicePresetId[] = [];
  private presetVersion = 0;
  private displayStreams = new Map<
    string,
    { streamId: string; baseSeq: number; presetVersion: number; seq: number }
  >();
  constructor(
    private participation: LocalParticipationService,
    private key = randomBytes(32).toString("hex"),
    private now = Date.now,
  ) {
    if (key.length < 32 || key.length > 256)
      throw new Error("Manager key must contain 32–256 characters");
    this.control = {
      schemaVersion: 1,
      mode: "MOCK",
      serverId: randomUUID(),
      revision: 0,
      displayMode: "LIVE",
      motionEnabled: true,
      updatedAt: new Date(now()).toISOString(),
    };
  }
  // HTTP layer permits this only with loopback binding and no remote origin.
  bootstrapKey() {
    return this.key;
  }
  private prune() {
    for (const [id, session] of this.sessions)
      if (session.expiresAt <= this.now()) this.sessions.delete(id);
  }
  rateClient(raw?: string) {
    const sign = (nonce: string) => createHmac("sha256", this.key).update(nonce).digest("hex");
    if (raw && /^[a-f0-9]{32}\.[a-f0-9]{64}$/.test(raw)) {
      const [nonce, signature] = raw.split(".");
      if (nonce && signature && timingSafeEqual(Buffer.from(signature), Buffer.from(sign(nonce))))
        return { bucket: nonce, cookie: null };
    }
    const nonce = randomBytes(16).toString("hex");
    return { bucket: nonce, cookie: `${nonce}.${sign(nonce)}` };
  }
  private throttle(kind: string, limit: number) {
    for (const [id, attempt] of this.attempts)
      if (attempt.until <= this.now()) this.attempts.delete(id);
    let entry = this.attempts.get(kind);
    if (!entry || entry.until <= this.now()) {
      if (this.attempts.size >= 4096) throw new DeviceLinkError("RATE_LIMITED", 429);
      entry = { count: 0, until: this.now() + 60_000 };
      this.attempts.set(kind, entry);
    }
    entry.count++;
    if (entry.count > limit) throw new DeviceLinkError("RATE_LIMITED", 429);
  }
  private issue(role: Session["role"]) {
    this.prune();
    if (this.sessions.size >= 100) throw new DeviceLinkError("CAPACITY", 429);
    const token = randomBytes(32).toString("hex");
    this.sessions.set(hash(token), {
      role,
      expiresAt: this.now() + (role === "ADMIN" ? 3_600_000 : 28_800_000),
      lastSeen: this.now(),
    });
    return token;
  }
  private require(token: string | undefined, role?: Session["role"]) {
    this.prune();
    const session = token ? this.sessions.get(hash(token)) : undefined;
    if (!session) throw new DeviceLinkError("PAIR_REQUIRED", 401);
    if (role && session.role !== role) throw new DeviceLinkError("ADMIN_REQUIRED");
    session.lastSeen = this.now();
    return session;
  }
  login(key: string, client = "direct") {
    if (!timingSafeEqual(Buffer.from(hash(key)), Buffer.from(hash(this.key)))) {
      this.throttle("login-global", 200);
      this.throttle(`login:${client}`, 6);
      throw new DeviceLinkError("LOGIN_FAILED", 401);
    }
    // Incorrect guesses cannot lock out a correct high-entropy credential.
    return this.issue("ADMIN");
  }
  createPairing(token: string | undefined) {
    this.require(token, "ADMIN");
    this.throttle(`create-pair:${hash(token ?? "")}`, 12);
    const code = String(randomInt(10_000_000, 100_000_000));
    const expiresAt = this.now() + 180_000;
    this.pairing = { digest: hash(code), expiresAt };
    return { code, expiresAt: new Date(expiresAt).toISOString() };
  }
  pair(code: string, client = "direct") {
    const current = this.pairing;
    if (!current || current.expiresAt <= this.now() || hash(code) !== current.digest) {
      this.throttle("pair-global", 200);
      this.throttle(`pair:${client}`, 12);
      if (current) this.throttle(`pair-code:${current.digest}:${client}`, 5);
      throw new DeviceLinkError("PAIR_FAILED", 401);
    }
    const token = this.issue("DISPLAY");
    const currentDisplay = hash(token);
    for (const [id, session] of this.sessions)
      if (session.role === "DISPLAY" && id !== currentDisplay) this.sessions.delete(id);
    this.pairing = null;
    return token;
  }
  adminState(token: string | undefined) {
    this.require(token, "ADMIN");
    const displays = [...this.sessions.values()].filter((session) => session.role === "DISPLAY");
    return DeviceAdminSchema.parse({
      control: this.control,
      snapshot: this.participation.snapshot(),
      presetIds: [...this.presetIds],
      pairedDisplays: displays.length,
      connectedDisplays: displays.filter((session) => this.now() - session.lastSeen < 10_000)
        .length,
    });
  }
  authorizeParticipant(token: string | undefined) {
    this.require(token, "ADMIN");
  }
  display(token: string | undefined) {
    this.require(token, "DISPLAY");
    const snapshot =
      this.control.displayMode === "MAINTENANCE"
        ? null
        : this.control.displayMode === "DEMO"
          ? // The demo screen no longer carries fixture residents; only enabled presets appear.
            this.withPresets({ ...developmentCitySnapshot, residents: [], avatars: [] }, "DEMO")
          : this.withPresets(this.participation.snapshot(), "LIVE");
    return DeviceDisplaySchema.parse({
      control: this.control,
      snapshot,
      // Only actual participants count as joins. DEMO residents are fictional presets.
      totalParticipants: this.control.displayMode === "LIVE" ? this.participation.joinedTotal() : 0,
    });
  }
  /** The display has its own monotonic stream because presets are not participant events. */
  withPresets(snapshot: CitySnapshot, mode: "DEMO" | "LIVE"): CitySnapshot {
    const key = `${mode}:${snapshot.streamId}`;
    let stream = this.displayStreams.get(key);
    if (!stream) {
      if (this.displayStreams.size >= 16)
        this.displayStreams.delete(this.displayStreams.keys().next().value as string);
      stream = {
        streamId: randomUUID(),
        baseSeq: snapshot.eventSeq,
        presetVersion: this.presetVersion,
        seq: 0,
      };
      this.displayStreams.set(key, stream);
    } else if (snapshot.eventSeq < stream.baseSeq) {
      // Never make an older snapshot look newer after an out-of-order store read.
      throw new DeviceLinkError("STALE_SNAPSHOT", 409);
    } else if (
      stream.baseSeq !== snapshot.eventSeq ||
      stream.presetVersion !== this.presetVersion
    ) {
      stream.baseSeq = snapshot.eventSeq;
      stream.presetVersion = this.presetVersion;
      stream.seq++;
    }
    const room = Math.max(0, 200 - snapshot.residents.length);
    const counts = new Map<DevicePresetId, number>();
    const presets = this.presetIds.slice(0, room).map((id) => {
      const preset = PRESET_CHARACTERS.find((entry) => entry.id === id);
      if (!preset) throw new Error("INVALID_PRESET");
      const number = (counts.get(id) ?? 0) + 1;
      counts.set(id, number);
      return { ...preset, number };
    });
    const residents = presets.map((preset) => ({
      schemaVersion: 1 as const,
      residentId: `preset-${preset.id}${preset.number === 1 ? "" : `-${preset.number}`}`,
      eventId: snapshot.eventId,
      nickname: `見本・${preset.name}`,
      avatarVersion: preset.avatarVersion,
      publicConsent: true as const,
      consentVersion: 1,
      personalityLabel: preset.personality,
      interests: [preset.interest],
      traits: [...preset.traits],
      publicState: "VISIBLE" as const,
    }));
    const avatars = [...snapshot.avatars];
    for (const preset of presets) {
      const avatar = developmentAvatars.find(
        (item) => item.manifest.avatarVersion === preset.avatarVersion,
      );
      if (avatar && !avatars.some((item) => item.manifest.avatarVersion === preset.avatarVersion))
        avatars.push(avatar);
    }
    return CitySnapshotSchema.parse({
      ...snapshot,
      streamId: stream.streamId,
      eventSeq: stream.seq,
      residents: [...snapshot.residents, ...residents],
      avatars,
    });
  }
  setPreset(token: string | undefined, raw: z.infer<typeof DevicePresetUpdateSchema>) {
    this.require(token, "ADMIN");
    const input = DevicePresetUpdateSchema.parse(raw);
    if (input.expectedRevision !== this.control.revision)
      throw new DeviceLinkError("REVISION_CONFLICT", 409);
    const index = this.presetIds.lastIndexOf(input.presetId);
    if (input.enabled && this.presetIds.length >= 20) throw new DeviceLinkError("CAPACITY", 429);
    const changed = input.enabled || index !== -1;
    if (changed) {
      if (input.enabled) this.presetIds.push(input.presetId);
      else this.presetIds.splice(index, 1);
      this.presetVersion++;
      this.control = {
        ...this.control,
        revision: this.control.revision + 1,
        updatedAt: new Date(this.now()).toISOString(),
      };
    }
    return this.adminState(token);
  }
  update(token: string | undefined, raw: DeviceUpdate) {
    this.require(token, "ADMIN");
    const input = DeviceUpdateSchema.parse(raw);
    if (input.expectedRevision !== this.control.revision)
      throw new DeviceLinkError("REVISION_CONFLICT", 409);
    this.control = {
      ...this.control,
      ...(input.displayMode === undefined ? {} : { displayMode: input.displayMode }),
      ...(input.motionEnabled === undefined ? {} : { motionEnabled: input.motionEnabled }),
      revision: this.control.revision + 1,
      updatedAt: new Date(this.now()).toISOString(),
    };
    return this.adminState(token);
  }
  removeResident(token: string | undefined, id: string) {
    this.require(token, "ADMIN");
    this.participation.removeResident(id);
    return this.adminState(token);
  }
  revokeDisplays(token: string | undefined) {
    this.require(token, "ADMIN");
    this.pairing = null;
    for (const [id, session] of this.sessions)
      if (session.role === "DISPLAY") this.sessions.delete(id);
    return this.adminState(token);
  }
  logout(token: string | undefined) {
    if (token) this.sessions.delete(hash(token));
  }
}
