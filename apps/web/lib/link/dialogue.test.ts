import { developmentCitySnapshot } from "@ai-city/contracts/development";
import { describe, expect, it, vi } from "vitest";
import { LocalParticipationService } from "../development/service";
import { DialogueService, handleDialogueRequest } from "./dialogue";
import { DeviceLinkService } from "./service";

const key = "test-only-manager-key-not-a-real-secret";
const input = {
  schemaVersion: 1,
  requestId: "test-1",
  eventId: "fixture-event",
  residentIds: ["fixture-sora", "fixture-haru"],
  locale: "ja-JP",
  maxLines: 4,
};
const response = (lines: unknown, finishReason = "STOP") =>
  Response.json({
    candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify({ lines }) }] } }],
  });
const lines = [
  { residentId: "fixture-sora", text: "こんにちは。" },
  { residentId: "fixture-haru", text: "こんにちは！" },
];
const config = {
  enabled: true,
  project: "test-project",
  model: "gemini-3.1-flash-lite",
  maxCalls: 2,
};
const request = (body?: unknown, token?: string) =>
  new Request("http://127.0.0.1:3000/api/link/dialogue", {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined
        ? {}
        : { "Content-Type": "application/json", Origin: "http://127.0.0.1:3000" }),
      ...(token ? { Cookie: `ai-city-link=${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

describe("fictional dialogue boundary", () => {
  it("requires an enabled configuration and a paired display without calling the provider", async () => {
    const provider = vi.fn();
    const dialogue = new DialogueService({ ...config, enabled: false }, provider);
    const device = new DeviceLinkService(new LocalParticipationService(), key);
    const admin = device.login(key);
    device.update(admin, { expectedRevision: 0, displayMode: "DEMO" });
    const display = device.pair(device.createPairing(admin).code);
    expect((await handleDialogueRequest(request(undefined), device, dialogue, true)).status).toBe(
      401,
    );
    expect(
      (await handleDialogueRequest(request(undefined, admin), device, dialogue, true)).status,
    ).toBe(403);
    const status = await handleDialogueRequest(request(undefined, display), device, dialogue, true);
    expect(await status.json()).toEqual({ available: false });
    expect(
      (await handleDialogueRequest(request(input, display), device, dialogue, true)).status,
    ).toBe(503);
    expect(provider).not.toHaveBeenCalled();
  });
  it("uses only server-side fictional public context, enforces cooldown and caps calls", async () => {
    let time = 0;
    const provider = vi.fn(async () => response(lines));
    const dialogue = new DialogueService(
      config,
      provider,
      () => time,
      async () => "synthetic-token",
    );
    const residents = developmentCitySnapshot.residents;
    const result = await dialogue.generate({ ...input, place: "station" }, residents);
    expect(result).toMatchObject({ source: "LIVE", safety: "PASSED", lines });
    const [url, init] = provider.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("aiplatform.googleapis.com/v1/projects/test-project/locations/global/");
    expect(JSON.parse(String(init.body)).contents[0].parts[0].text).not.toContain(
      "synthetic-token",
    );
    const context = JSON.parse(JSON.parse(String(init.body)).contents[0].parts[0].text);
    expect(context.place).toBe("御茶ノ水の駅の近く");
    expect(
      context.residents.map((resident: { personality: string }) => resident.personality),
    ).toEqual(["のんびり探検家", "好奇心いっぱい"]);
    expect(context).not.toHaveProperty("coordinates");
    await expect(dialogue.generate(input, residents)).rejects.toMatchObject({
      code: "DIALOGUE_RATE_LIMITED",
    });
    time += 30_000;
    await dialogue.generate(input, residents);
    expect(dialogue.available()).toBe(false);
    expect(provider).toHaveBeenCalledTimes(2);
  });
  it("rejects extra private fields, unknown participants, blocked or invalid model results", async () => {
    const provider = vi.fn(async () => response(lines));
    const dialogue = new DialogueService(config, provider, Date.now, async () => "test");
    await expect(
      dialogue.generate({ ...input, rawAnswers: [1] }, developmentCitySnapshot.residents),
    ).rejects.toThrow();
    await expect(
      dialogue.generate({ ...input, place: "任意内容" }, developmentCitySnapshot.residents),
    ).rejects.toThrow();
    await expect(
      dialogue.generate(
        { ...input, residentIds: ["fixture-sora", "resident-private"] },
        developmentCitySnapshot.residents,
      ),
    ).rejects.toMatchObject({ code: "DIALOGUE_RESIDENT_UNAVAILABLE" });
    expect(provider).not.toHaveBeenCalled();
    const blocked = new DialogueService(
      config,
      vi.fn(async () => response(lines, "SAFETY")),
      Date.now,
      async () => "test",
    );
    await expect(blocked.generate(input, developmentCitySnapshot.residents)).rejects.toMatchObject({
      code: "DIALOGUE_BLOCKED",
    });
    const wrong = new DialogueService(
      config,
      vi.fn(async () => response([{ residentId: "someone-else", text: "こんにちは" }])),
      Date.now,
      async () => "test",
    );
    await expect(wrong.generate(input, developmentCitySnapshot.residents)).rejects.toMatchObject({
      code: "DIALOGUE_PROVIDER_FAILED",
    });
  });
  it("rejects cross-origin requests and discards results if the display is revoked while waiting", async () => {
    const device = new DeviceLinkService(new LocalParticipationService(), key);
    const admin = device.login(key);
    device.update(admin, { expectedRevision: 0, displayMode: "DEMO" });
    const display = device.pair(device.createPairing(admin).code);
    let finish!: (response: Response) => void;
    let started!: () => void;
    const waiting = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const providerStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const provider = vi.fn(() => {
      started();
      return waiting;
    });
    const dialogue = new DialogueService(config, provider, Date.now, async () => "test");
    const cross = request(input, display);
    cross.headers.set("origin", "https://other.example");
    expect((await handleDialogueRequest(cross, device, dialogue, true)).status).toBe(403);
    expect(provider).not.toHaveBeenCalled();
    const pending = handleDialogueRequest(request(input, display), device, dialogue, true);
    await providerStarted;
    device.revokeDisplays(admin);
    finish(response(lines));
    expect((await pending).status).toBe(401);
  });
});

describe("worker-written dialogue", () => {
  const residents = developmentCitySnapshot.residents;
  const stored = [
    { residentId: input.residentIds[0] as string, text: "こんにちは" },
    { residentId: input.residentIds[1] as string, text: "いい天気ですね" },
  ];
  it("serves stored worker dialogue without any model call or cooldown", async () => {
    const provider = vi.fn();
    const reader = vi.fn(async () => ({ lines: stored, createdAt: 1 }));
    const dialogue = new DialogueService(
      { ...config, enabled: false },
      provider,
      Date.now,
      undefined,
      reader,
    );
    expect(dialogue.available()).toBe(true);
    for (let i = 0; i < 3; i++)
      expect(await dialogue.generate(input, residents)).toMatchObject({
        source: "LIVE",
        safety: "PASSED",
        lines: stored,
      });
    expect(reader).toHaveBeenCalledWith([...input.residentIds].sort().join("__"));
    expect(provider).not.toHaveBeenCalled();
  });
  it("answers 404 (not 503) while the worker has not written the pair, and ignores bad data", async () => {
    const missing = new DialogueService(
      { ...config, enabled: false },
      vi.fn(),
      Date.now,
      undefined,
      async () => null,
    );
    await expect(missing.generate(input, residents)).rejects.toMatchObject({
      code: "DIALOGUE_PENDING",
      status: 404,
    });
    const foreign = new DialogueService(
      { ...config, enabled: false },
      vi.fn(),
      Date.now,
      undefined,
      async () => ({
        lines: [
          { residentId: "someone-else", text: "x" },
          { residentId: input.residentIds[0] as string, text: "y" },
        ],
        createdAt: 1,
      }),
    );
    await expect(foreign.generate(input, residents)).rejects.toMatchObject({
      code: "DIALOGUE_PENDING",
    });
  });
});
