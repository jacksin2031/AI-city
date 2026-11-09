import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/version", () => {
  const original = process.env.K_REVISION;
  afterEach(() => {
    if (original === undefined) delete process.env.K_REVISION;
    else process.env.K_REVISION = original;
  });
  it("reports the Cloud Run revision and is never cached", async () => {
    process.env.K_REVISION = "ai-city-web-00042-abc";
    const response = GET();
    expect(await response.json()).toEqual({ version: "ai-city-web-00042-abc" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("falls back to dev outside Cloud Run", async () => {
    delete process.env.K_REVISION;
    expect(await GET().json()).toEqual({ version: "dev" });
  });
});
