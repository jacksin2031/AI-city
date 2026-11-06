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
  DeviceControlSchema,
  DeviceDisplaySchema,
  type DevicePresetId,
  DevicePresetUpdateSchema,
  type DeviceUpdate,
  DeviceUpdateSchema,
  PRESET_CHARACTERS,
} from "@ai-city/contracts/device-link";
import type { z } from "zod";
import type { LocalParticipationService } from "../development/service";
import type { VisitorStore } from "../visitor/store";

export class DeviceLinkError extends Error {
  constructor(
    public code: string,
    public status = 403,
  ) {
    super(code);
  }
}
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
type Session = { role: "ADMIN" | "DISPLAY"; createdAt: number; lastSeen: number };
/**
 * Sessions slide: every authenticated request extends the idle deadline, but never past the
 * absolute cap. A kiosk that keeps polling stays connected for days; an abandoned one expires.
 */
const SESSION_TTL = {
  ADMIN: { idle: 3_600_000, absolute: 43_200_000 },
  DISPLAY: { idle: 86_400_000, absolute: 604_800_000 },
} as const;
const RELOAD_INTERVAL_MS = 5_000;
const SEEN_PERSIST_INTERVAL_MS = 15_000;
/**
 * A display counts as connected while its last poll is newer than this. Another instance only sees
 * a poll after it is persisted (up to SEEN_PERSIST_INTERVAL_MS) and then reloaded (up to
 * RELOAD_INTERVAL_MS), so the window must exceed both combined or a healthy tablet shows as absent.
 */
export const CONNECTED_WINDOW_MS = 45_000;
const COOKIE_REFRESH_INTERVAL_MS = 60_000;
const STATE_PATH = "meta/device-link";
const sessionExpiry = (session: Session) =>
  Math.min(
    session.createdAt + SESSION_TTL[session.role].absolute,
    session.lastSeen + SESSION_TTL[session.role].idle,
  );
/** Raised when another instance changed the shared document since this one loaded it. */
export class DeviceStateConflictError extends Error {
  constructor() {
    super("STATE_CONFLICT");
  }
}
type PersistedState = {
  version: number;
  /** Compare-and-set counter; bumped by every structural write. Missing means 0. */
  storeRevision?: number;
  sessions: Record<string, Session>;
  pairing: { digest: string; expiresAt: number } | null;
  control: DeviceControl;
  presetIds: DevicePresetId[];
  presetVersion: number;
};

/**
 * Exhibit controller. Local mock keeps everything in memory. When a store is attached, sessions,
 * the pairing digest, controls and presets are shared through one document so a restart, a new
 * revision or an overlapping instance does not sign the admin or tablet out.
 */
export class DeviceLinkService {
  private sessions = new Map<string, Session>();
  private store: VisitorStore | null = null;
  private loadedAt = Number.NEGATIVE_INFINITY;
  private structuralDirty = false;
  private baseRevision = 0;
  private flushQueue: Promise<void> = Promise.resolve();
  private seenDirty = false;
  private persistedSeenAt = 0;
  private cookieAt = new Map<string, number>();
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
      dialogueEnabled: true,
      updatedAt: new Date(now()).toISOString(),
    };
  }
  // HTTP layer permits this only with loopback binding and no remote origin.
  bootstrapKey() {
    return this.key;
  }
  private prune() {
    for (const [id, session] of this.sessions)
      if (sessionExpiry(session) <= this.now()) {
        this.sessions.delete(id);
        this.cookieAt.delete(id);
      }
  }
  /** Attach shared persistence. Without a store the controller stays process-local. */
  attachStore(store: VisitorStore | null) {
    if (this.store === store) return;
    this.store = store;
    this.loadedAt = Number.NEGATIVE_INFINITY;
  }
  private snapshotState(): PersistedState {
    return {
      version: 1,
      sessions: Object.fromEntries(this.sessions),
      pairing: this.pairing,
      control: this.control,
      presetIds: [...this.presetIds],
      presetVersion: this.presetVersion,
    };
  }
  private applyState(raw: unknown) {
    const doc = raw as Partial<PersistedState> | null;
    this.baseRevision = Number.isSafeInteger(doc?.storeRevision) ? Number(doc?.storeRevision) : 0;
    if (!doc || doc.version !== 1 || typeof doc.sessions !== "object" || !doc.sessions) return;
    // A structural change made here that is not yet persisted wins over the stored copy.
    if (this.structuralDirty) return;
    const next = new Map<string, Session>();
    for (const [id, value] of Object.entries(doc.sessions)) {
      if (
        !/^[a-f0-9]{64}$/.test(id) ||
        !value ||
        (value.role !== "ADMIN" && value.role !== "DISPLAY") ||
        !Number.isFinite(value.createdAt) ||
        !Number.isFinite(value.lastSeen)
      )
        continue;
      next.set(id, {
        role: value.role,
        createdAt: value.createdAt,
        lastSeen: Math.max(value.lastSeen, this.sessions.get(id)?.lastSeen ?? 0),
      });
    }
    this.sessions = next;
    this.pairing = doc.pairing ?? null;
    const control = DeviceControlSchema.safeParse(doc.control);
    if (control.success) this.control = control.data;
    if (Array.isArray(doc.presetIds)) this.presetIds = doc.presetIds as DevicePresetId[];
    if (Number.isFinite(doc.presetVersion)) this.presetVersion = Number(doc.presetVersion);
  }
  /** Load shared state before a request is served; throttled unless the token is unknown here. */
  async sync(token?: string) {
    if (!this.store) return;
    const known = token ? this.sessions.has(hash(token)) : true;
    if (known && this.now() - this.loadedAt < RELOAD_INTERVAL_MS) return;
    const doc = await this.store.run((tx) => tx.get(STATE_PATH));
    this.loadedAt = this.now();
    this.applyState(doc);
  }
  /**
   * Persist structural changes at once and last-seen times at a bounded cadence. Structural writes
   * are compare-and-set on `storeRevision` inside one transaction: if another instance wrote since
   * this one loaded, nothing is written, the unsaved local change is discarded in favour of the
   * stored state, and DeviceStateConflictError is thrown so the caller returns no success response.
   */
  flush(): Promise<void> {
    const run = this.flushQueue.then(() => this.flushNow());
    this.flushQueue = run.catch(() => undefined);
    return run;
  }
  private async flushNow() {
    const store = this.store;
    if (!store) return;
    this.prune();
    if (this.structuralDirty) {
      this.structuralDirty = false;
      this.seenDirty = false;
      let written = 0;
      try {
        await store.run(async (tx) => {
          const current = (await tx.get(STATE_PATH)) as unknown as PersistedState | null;
          const storedRevision = Number.isSafeInteger(current?.storeRevision)
            ? Number(current?.storeRevision)
            : 0;
          if (storedRevision !== this.baseRevision) throw new DeviceStateConflictError();
          const next = this.snapshotState();
          // Same revision: only last-seen times may differ, and the newer one wins.
          for (const [id, stored] of Object.entries(current?.sessions ?? {})) {
            const mine = next.sessions[id];
            if (mine && Number.isFinite(stored?.lastSeen))
              mine.lastSeen = Math.max(mine.lastSeen, stored.lastSeen);
          }
          written = storedRevision + 1;
          next.storeRevision = written;
          tx.set(STATE_PATH, next as unknown as Record<string, unknown>);
        });
      } catch (error) {
        if (error instanceof DeviceStateConflictError) {
          // Drop the rejected mutation (e.g. a token issued here) and adopt what is stored.
          const latest = await store.run((tx) => tx.get(STATE_PATH)).catch(() => null);
          if (latest) {
            this.loadedAt = this.now();
            this.applyState(latest);
          } else {
            this.loadedAt = Number.NEGATIVE_INFINITY;
            this.sessions.clear();
            this.pairing = null;
          }
        } else this.structuralDirty = true;
        throw error;
      }
      this.baseRevision = written;
      this.persistedSeenAt = this.now();
      return;
    }
    if (!this.seenDirty || this.now() - this.persistedSeenAt < SEEN_PERSIST_INTERVAL_MS) return;
    this.persistedSeenAt = this.now();
    try {
      await store.run(async (tx) => {
        const doc = (await tx.get(STATE_PATH)) as unknown as PersistedState | null;
        if (!doc || doc.version !== 1) return;
        // Only refresh sessions that still exist, so a stale instance cannot resurrect a revoked one.
        for (const [id, stored] of Object.entries(doc.sessions)) {
          const local = this.sessions.get(id);
          if (local) stored.lastSeen = Math.max(stored.lastSeen, local.lastSeen);
        }
        tx.set(STATE_PATH, doc as unknown as Record<string, unknown>);
      });
      this.seenDirty = false;
    } catch {
      // Last-seen is advisory; the next request retries and the in-memory value stays correct.
    }
  }
  /** Whether this process currently holds a live session for the token. */
  knows(token: string | undefined) {
    this.prune();
    return Boolean(token && this.sessions.has(hash(token)));
  }
  /** Seconds a refreshed cookie should live, or null when it was refreshed recently. */
  cookieRefresh(token: string | undefined): number | null {
    if (!token) return null;
    const id = hash(token);
    const session = this.sessions.get(id);
    if (!session) return null;
    if (this.now() - (this.cookieAt.get(id) ?? 0) < COOKIE_REFRESH_INTERVAL_MS) return null;
    this.cookieAt.set(id, this.now());
    return Math.max(1, Math.floor((sessionExpiry(session) - this.now()) / 1000));
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
    this.sessions.set(hash(token), { role, createdAt: this.now(), lastSeen: this.now() });
    this.cookieAt.set(hash(token), this.now());
    this.structuralDirty = true;
    return token;
  }
  private require(token: string | undefined, role?: Session["role"]) {
    this.prune();
    const session = token ? this.sessions.get(hash(token)) : undefined;
    if (!session) throw new DeviceLinkError("PAIR_REQUIRED", 401);
    if (role && session.role !== role) throw new DeviceLinkError("ADMIN_REQUIRED");
    session.lastSeen = this.now();
    this.seenDirty = true;
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
    this.structuralDirty = true;
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
    this.structuralDirty = true;
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
      connectedDisplays: displays.filter(
        (session) => this.now() - session.lastSeen < CONNECTED_WINDOW_MS,
      ).length,
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
      this.structuralDirty = true;
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
      ...(input.dialogueEnabled === undefined ? {} : { dialogueEnabled: input.dialogueEnabled }),
      revision: this.control.revision + 1,
      updatedAt: new Date(this.now()).toISOString(),
    };
    this.structuralDirty = true;
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
    this.structuralDirty = true;
    return this.adminState(token);
  }
  logout(token: string | undefined) {
    if (token && this.sessions.delete(hash(token))) this.structuralDirty = true;
  }
}
