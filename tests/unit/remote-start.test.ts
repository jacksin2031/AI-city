import { describe, expect, it } from "vitest";
import { validateRemoteEnvironment } from "../../scripts/start-remote.mjs";

describe("remote preview opt in", () => {
  it("requires HTTPS, a strong server key, mock opt in and a valid port", () => {
    const env = {
      AI_CITY_PUBLIC_ORIGIN: "https://city.example",
      AI_CITY_ADMIN_KEY: "test-only-key-never-a-real-credential",
      AI_CITY_ENABLE_LOCAL_MOCK: "1",
    };
    expect(validateRemoteEnvironment(env)).toEqual({ origin: "https://city.example", port: 8080 });
    for (const changed of [
      { AI_CITY_PUBLIC_ORIGIN: "http://city.example" },
      { AI_CITY_PUBLIC_ORIGIN: "https://city.example/path" },
      { AI_CITY_PUBLIC_ORIGIN: "https://evil@city.example" },
      { AI_CITY_ADMIN_KEY: "short" },
      { AI_CITY_ENABLE_LOCAL_MOCK: "0" },
      { PORT: "0" },
    ])
      expect(() => validateRemoteEnvironment({ ...env, ...changed })).toThrow();
  });
});
