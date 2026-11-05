import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { newSessionId, readSessionId } from "./session";

// next/headers is not available outside a request scope, so the cookie jar is stubbed.
const jar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "aicity_sid" && jar.value !== undefined ? { name, value: jar.value } : undefined,
    set: () => undefined,
  }),
}));

const SECRET = "a".repeat(32);

function signWith(secret: string, id: string) {
  return createHmac("sha256", secret).update(id).digest("base64url");
}

function withSecret() {
  process.env.SESSION_SECRET = SECRET;
  process.env.AI_CITY_BACKEND = "gcp";
}

describe("newSessionId", () => {
  it("produces an unpredictable, url-safe id each time", () => {
    const a = newSessionId();
    const b = newSessionId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(20);
  });
});

describe("readSessionId", () => {
  it("returns null when no cookie is present", async () => {
    withSecret();
    jar.value = undefined;
    expect(await readSessionId()).toBeNull();
  });

  it("accepts a correctly signed cookie", async () => {
    withSecret();
    const id = newSessionId();
    jar.value = `${id}.${signWith(SECRET, id)}`;
    expect(await readSessionId()).toBe(id);
  });

  it("rejects a signature made with a different secret", async () => {
    withSecret();
    const id = newSessionId();
    jar.value = `${id}.${signWith("b".repeat(32), id)}`;
    expect(await readSessionId()).toBeNull();
  });

  it("rejects an id that does not match its signature", async () => {
    withSecret();
    const id = newSessionId();
    // Swap in a different id while keeping the original MAC: the classic tamper attempt.
    jar.value = `${newSessionId()}.${signWith(SECRET, id)}`;
    expect(await readSessionId()).toBeNull();
  });

  it("rejects an unsigned id", async () => {
    withSecret();
    jar.value = newSessionId();
    expect(await readSessionId()).toBeNull();
  });

  it("rejects a malformed cookie rather than throwing", async () => {
    withSecret();
    for (const bad of [".", "...", "id.", ".mac", ""]) {
      jar.value = bad;
      expect(await readSessionId()).toBeNull();
    }
  });

  it("rejects a signature of a different length without a timing error", async () => {
    withSecret();
    const id = newSessionId();
    jar.value = `${id}.shortmac`;
    expect(await readSessionId()).toBeNull();
  });
});
