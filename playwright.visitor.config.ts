import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: "visitor.spec.ts",
  testIgnore: [],
  workers: 1,
  retries: 0,
  use: { ...base.use, baseURL: "http://127.0.0.1:3001", trace: "off" },
  webServer: {
    command: "pnpm --filter @ai-city/web exec next start --hostname 127.0.0.1 --port 3001",
    url: "http://127.0.0.1:3001/api/health",
    reuseExistingServer: false,
    timeout: 90000,
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
      AI_CITY_ENABLE_LOCAL_MOCK: "1",
      AI_CITY_LOOPBACK_PREVIEW: "1",
      AI_CITY_ENABLE_VISITORS: "1",
      AI_CITY_VISITOR_CODE_FREE: process.env.AI_CITY_TEST_CODE_FREE === "1" ? "1" : "0",
      AI_CITY_VISITOR_PROJECT_ID: "demo-ai-city",
      AI_CITY_VISITOR_NAMESPACE: "browser-acceptance",
      AI_CITY_VISITOR_HMAC_KEY: "fixture-only-stable-key-for-local-acceptance",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
      GOOGLE_APPLICATION_CREDENTIALS: "/ai-city-emulator-must-not-use-adc.json",
    },
  },
});
