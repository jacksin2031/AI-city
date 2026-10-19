import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { DevelopmentServiceError } from "../development/service";
export function createVisitorBoundary(key: string, namespace: string, now = Date.now) {
  if (key.length < 32 || !/^[A-Za-z0-9_-]{1,64}$/.test(namespace))
    throw new Error("Invalid visitor signing configuration");
  const mac = (purpose: string, value: string) =>
    createHmac("sha256", key).update(`visitor-v1:${namespace}:${purpose}:${value}`).digest("hex");
  const same = (a: string, b: string) =>
    a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
  const buckets = new Map<string, { count: number; until: number }>();
  return {
    signSession: (value: string) => `${value}.${mac("session", value)}`,
    readSession: (value?: string): string | null => {
      if (!value || !/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(value)) return null;
      const raw = value.slice(0, 64);
      return same(value.slice(65), mac("session", raw)) ? raw : null;
    },
    signInvitation: (value: string) => `${value}${mac("invitation", value).slice(0, 32)}`,
    readInvitation: (value?: string): string | null => {
      if (!value || !/^[a-f0-9]{64}$/.test(value)) return null;
      const raw = value.slice(0, 32);
      return same(value.slice(32), mac("invitation", raw).slice(0, 32)) ? raw : null;
    },
    allow: (value: string) => {
      for (const [id, entry] of buckets) if (entry.until <= now()) buckets.delete(id);
      const id = createHash("sha256").update(value).digest("hex");
      let entry = buckets.get(id);
      if (!entry) {
        if (buckets.size >= 1024) throw new DevelopmentServiceError("RATE_LIMITED", 429);
        entry = { count: 0, until: now() + 60000 };
        buckets.set(id, entry);
      }
      if (++entry.count > 60) throw new DevelopmentServiceError("RATE_LIMITED", 429);
    },
  };
}
export type VisitorBoundary = ReturnType<typeof createVisitorBoundary>;
