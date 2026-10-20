import { describe, expect, it } from "vitest";
import { createDevelopmentClient } from "./development-client";

describe("additive persistent visitor transport", () => {
  it("shares simultaneous session initialization to avoid losing one anonymous identity", async () => {
    let issued = 0;
    const client = createDevelopmentClient({
      apiPath: "/api/visitor",
      fetch: async () => {
        issued++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return Response.json({ mode: "MOCK" });
      },
    });
    await Promise.all([client.createSession(), client.createSession()]);
    expect(issued).toBe(1);
  });
  it("aborts an unavailable transport instead of waiting forever", async () => {
    const client = createDevelopmentClient({
      fetch: async (_input, init) =>
        new Promise((_resolve, reject) => {
          if (!init?.signal) {
            reject(new Error("Missing request deadline"));
            return;
          }
          init.signal.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
        }),
    });
    await expect(client.createSession()).rejects.toMatchObject({ name: "TimeoutError" });
  }, 10000);
  it("uses the visitor endpoint and its own cookie jar without changing the default client", async () => {
    const requests: { url: string; cookie: string | null }[] = [];
    const transport: typeof fetch = async (input, init) => {
      requests.push({ url: String(input), cookie: new Headers(init?.headers).get("cookie") });
      return Response.json(String(input).endsWith("/session") ? { mode: "MOCK" } : null, {
        headers: { "set-cookie": "ai-city-visitor=test-cookie; Path=/api/visitor; HttpOnly" },
      });
    };
    const visitor = createDevelopmentClient({
      baseUrl: "http://127.0.0.1:3000",
      apiPath: "/api/visitor",
      fetch: transport,
    });
    await visitor.createSession();
    await visitor.current();
    expect(requests).toEqual([
      { url: "http://127.0.0.1:3000/api/visitor/session", cookie: null },
      {
        url: "http://127.0.0.1:3000/api/visitor/jobs/current",
        cookie: "ai-city-visitor=test-cookie",
      },
    ]);
    const local = createDevelopmentClient({ baseUrl: "http://127.0.0.1:3000", fetch: transport });
    await local.createSession();
    expect(requests.at(-1)?.url).toBe("http://127.0.0.1:3000/api/dev/session");
  });
});
