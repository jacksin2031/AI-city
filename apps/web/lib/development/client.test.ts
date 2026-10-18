import { createServer } from "node:http";
import {
  createDevelopmentClient,
  DevelopmentApiError,
} from "@ai-city/contracts/development-client";
import { describe, expect, it } from "vitest";
import { handleDevelopmentRequest } from "./http";
import { LocalParticipationService } from "./service";

describe("B typed client against the real local API", () => {
  it("keeps a Node session with default fetch without requiring B to implement a cookie jar", async () => {
    const service = new LocalParticipationService();
    const server = createServer(async (incoming, outgoing) => {
      let body = "";
      for await (const chunk of incoming) body += String(chunk);
      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers)) {
        if (typeof value === "string") headers.set(key, value);
      }
      const response = await handleDevelopmentRequest(
        new Request(`http://${incoming.headers.host}${incoming.url}`, {
          method: incoming.method,
          headers,
          ...(incoming.method === "POST" ? { body } : {}),
        }),
        service,
        true,
      );
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(await response.text());
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("Local test server did not bind");
      const client = createDevelopmentClient({ baseUrl: `http://127.0.0.1:${address.port}` });
      await client.createSession();
      expect(await client.current()).toBeNull();
      const created = await client.createJob({
        requestId: "node-1",
        eventId: "fixture-event",
        nickname: "そら",
        sampleId: "sora",
        answers: null,
        scenario: "SUCCESS",
      });
      expect((await client.current())?.job.jobId).toBe(created.job.jobId);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
  it("runs create, preview, confirm, cursor reads and removal through the same interface B consumes", async () => {
    let now = Date.parse("2026-10-18T00:00:00Z");
    const service = new LocalParticipationService(() => now);
    let cookie = "";
    // In-process transport only; the actual HTTP handler, service and schemas stay real.
    const transport: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      if (cookie) headers.set("cookie", cookie);
      const response = await handleDevelopmentRequest(
        new Request(String(input), { ...init, headers }),
        service,
        true,
      );
      const nextCookie = response.headers.get("set-cookie");
      if (nextCookie) cookie = nextCookie.split(";")[0] ?? "";
      return response;
    };
    const client = createDevelopmentClient({ baseUrl: "http://127.0.0.1:3000", fetch: transport });
    await client.createSession();
    expect(await client.current()).toBeNull();
    const initial = await client.snapshot();
    const job = await client.createJob({
      requestId: "client-1",
      eventId: "fixture-event",
      nickname: "そら",
      sampleId: "sora",
      answers: null,
      scenario: "SUCCESS",
    });
    now += 1200;
    expect((await client.job(job.job.jobId)).job.state).toBe("READY");
    await client.confirm(job.job.jobId, {
      avatarPublicConsent: true,
      consentVersion: 1,
      fields: { nickname: true, personality: false, interests: false },
    });
    expect((await client.snapshot()).residents).toHaveLength(1);
    const events = await client.events(initial.streamId, initial.eventSeq);
    expect(events.events.map((event) => event.type)).toEqual(["RESIDENT_JOINED"]);
    expect((await client.events(events.streamId, events.latestSeq)).events).toEqual([]);
    await client.remove(job.job.jobId);
    expect((await client.snapshot()).residents).toEqual([]);
    expect((await client.events(events.streamId, events.latestSeq)).events[0]?.version).toBe(2);
    await expect(client.events("stale-stream", 0)).rejects.toMatchObject({
      code: "STREAM_RESET",
      status: 409,
    });
  });
  it("returns a typed error when B requests a missing private session", async () => {
    const service = new LocalParticipationService();
    const client = createDevelopmentClient({
      baseUrl: "http://127.0.0.1:3000",
      fetch: async (input, init) =>
        handleDevelopmentRequest(new Request(String(input), init), service, true),
    });
    await expect(client.current()).rejects.toBeInstanceOf(DevelopmentApiError);
  });
});
