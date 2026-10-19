import { describe, expect, it } from "vitest";
import { visitorConfig } from "./config";

const local = {
  AI_CITY_ENABLE_LOCAL_MOCK: "1",
  AI_CITY_VISITOR_HMAC_KEY: "fixture-only-stable-key".repeat(3),
  AI_CITY_ENABLE_VISITORS: "1",
  AI_CITY_VISITOR_PROJECT_ID: "demo-ai-city",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  AI_CITY_LOOPBACK_PREVIEW: "1",
};
describe("visitor storage fails closed", () => {
  it("does not connect to any database by default", () => {
    expect(visitorConfig({})).toBeNull();
    expect(visitorConfig({ GOOGLE_CLOUD_PROJECT: "ai-city-511822" })).toBeNull();
  });
  it("requires a loopback emulator and a demo-only project", () => {
    expect(visitorConfig(local)).toMatchObject({ projectId: "demo-ai-city", emulator: true });
    for (const override of [
      { AI_CITY_VISITOR_PROJECT_ID: "ai-city-511822" },
      { FIRESTORE_EMULATOR_HOST: "example.com:8080" },
      { AI_CITY_LOOPBACK_PREVIEW: "0" },
      { AI_CITY_PUBLIC_ORIGIN: "https://exhibit.example" },
    ])
      expect(() => visitorConfig({ ...local, ...override })).toThrow();
  });
  it("requires separate explicit cloud enablement and exact HTTPS origin", () => {
    const cloud = {
      AI_CITY_ENABLE_LOCAL_MOCK: "1",
      AI_CITY_ADMIN_KEY: "fixture-only-stable-admin-key-for-config",
      AI_CITY_VISITOR_HMAC_KEY: "fixture-only-stable-key".repeat(3),
      AI_CITY_VISITOR_NAMESPACE: "approved-preview",
      AI_CITY_ENABLE_VISITORS: "1",
      AI_CITY_VISITOR_PROJECT_ID: "ai-city-511822",
      AI_CITY_PUBLIC_ORIGIN: "https://exhibit.example",
    };
    expect(() => visitorConfig(cloud)).toThrow();
    expect(() =>
      visitorConfig({
        ...cloud,
        AI_CITY_VISITOR_ALLOW_CLOUD: "1",
        AI_CITY_VISITOR_NAMESPACE: undefined,
      }),
    ).toThrow();
    expect(visitorConfig({ ...cloud, AI_CITY_VISITOR_ALLOW_CLOUD: "1" })).toMatchObject({
      projectId: "ai-city-511822",
      emulator: false,
    });
    for (const key of [undefined, "short"]) {
      expect(() =>
        visitorConfig({ ...cloud, AI_CITY_VISITOR_ALLOW_CLOUD: "1", AI_CITY_ADMIN_KEY: key }),
      ).toThrow();
    }
    for (const origin of [
      "http://exhibit.example",
      "https://exhibit.example/path",
      "https://exhibit.example/",
      "https://localhost",
    ]) {
      expect(() =>
        visitorConfig({
          ...cloud,
          AI_CITY_VISITOR_ALLOW_CLOUD: "1",
          AI_CITY_PUBLIC_ORIGIN: origin,
        }),
      ).toThrow();
    }
  });
  it("rejects a namespace that could escape its exhibition", () => {
    expect(() => visitorConfig({ ...local, AI_CITY_VISITOR_NAMESPACE: "../other" })).toThrow();
  });
  it("does not run persistent sessions with an ephemeral or missing signing key", () => {
    expect(() => visitorConfig({ ...local, AI_CITY_VISITOR_HMAC_KEY: undefined })).toThrow();
    expect(() => visitorConfig({ ...local, AI_CITY_VISITOR_HMAC_KEY: "short" })).toThrow();
    expect(() => visitorConfig({ ...local, AI_CITY_ENABLE_LOCAL_MOCK: "0" })).toThrow();
  });
});
