import { expect, it } from "vitest";
import { GET } from "./route";

it("reports the real mock foundation state without claiming live services", async () => {
  expect(await GET().json()).toEqual({
    status: "ok",
    mode: "mock",
    locale: "ja-JP",
    liveServicesConnected: false,
  });
});
