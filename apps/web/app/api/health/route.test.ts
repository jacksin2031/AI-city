import { expect, it } from "vitest";
import { GET } from "./route";

it("reports mock mode, fallback chat and sample avatars by default", async () => {
  expect(await GET().json()).toEqual({
    status: "ok",
    mode: "mock",
    locale: "ja-JP",
    liveServicesConnected: false,
    chat: "fallback",
    avatars: "sample",
  });
});
