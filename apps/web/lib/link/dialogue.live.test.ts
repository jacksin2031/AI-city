import { developmentCitySnapshot } from "@ai-city/contracts/development";
import { expect, it } from "vitest";
import { DialogueService } from "./dialogue";

// Explicit opt-in: this test makes one billable request using fictional fixtures only.
it.skipIf(process.env.AI_CITY_LIVE_DIALOGUE_TEST !== "1")(
  "validates one live fictional dialogue and its bounded actions",
  async () => {
    const project = process.env.AI_CITY_DIALOGUE_PROJECT;
    if (!project) throw new Error("AI_CITY_DIALOGUE_PROJECT is required");
    const service = new DialogueService({
      enabled: true,
      project,
      model: "gemini-3.1-flash-lite",
      maxCalls: 1,
    });
    const result = await service.generate(
      {
        schemaVersion: 1,
        requestId: "synthetic-live-test",
        eventId: "fixture-event",
        residentIds: ["fixture-sora", "fixture-haru"],
        place: "station",
        locale: "ja-JP",
        maxLines: 4,
      },
      developmentCitySnapshot.residents,
    );
    expect(result.source).toBe("LIVE");
    expect(result.actions).toHaveLength(2);
    expect(service.available()).toBe(false);
  },
  30_000,
);
