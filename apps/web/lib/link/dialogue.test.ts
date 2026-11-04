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
    candidates: [
      { finishReason, content: { parts: [{ text: JSON.stringify({ lines, actions }) }] } },
    ],
  });
const lines = [
  { residentId: "fixture-sora", text: "こんにちは。" },
  { residentId: "fixture-haru", text: "こんにちは！" },
];
const actions = [
  { residentId: "fixture-sora", action: "wave" },
  { residentId: "fixture-haru", action: "walk" },
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
  it("refuses a configuration above the five-call per-process test limit", () => {
    expect(new DialogueService({ ...config, maxCalls: 6 }).available()).toBe(false);
  });
  it("never sends altered roster attributes to the model", async () => {
    const provider = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(String(init?.body)).not.toContain("private-roster-text");
      return response(lines);
    });
    const dialogue = new DialogueService(config, provider, Date.now, async () => "test");
    const altered = developmentCitySnapshot.residents.map((resident) => ({
      ...resident,
      nickname: "private-roster-text",
      personalityLabel: "private-roster-text",
      interests: ["private-roster-text"],
    }));
    await dialogue.generate(input, altered);
  });
  it("accepts only one safe AI-selected action for each fictional participant", async () => {
    const provider = vi.fn(async () =>
      Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: JSON.stringify({ lines, actions }) }] },
          },
        ],
      }),
    );
    const dialogue = new DialogueService(config, provider, Date.now, async () => "test");
    const result = await dialogue.generate(input, developmentCitySnapshot.residents);
    expect(result.actions).toEqual(actions);
    const bad = new DialogueService(
      config,
      vi.fn(async () =>
        Response.json({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      lines,
                      actions: [{ residentId: "fixture-sora", action: "delete" }, actions[1]],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      ),
      Date.now,
      async () => "test",
    );
    await expect(bad.generate(input, developmentCitySnapshot.residents)).rejects.toMatchObject({
      code: "DIALOGUE_PROVIDER_FAILED",
    });
  });
  it("requires an enabled configuration and a paired display without calling the provider", async () => {
    const provider = vi.fn();
    const dialogue = new DialogueService({ ...config, enabled: false }, provider);
    const device = new DeviceLinkService(new LocalParticipationService(), key);
    const admin = device.login(key);
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
