import { defineConfig, devices } from "@playwright/test";

// Smoke tests against the production build. Locally, PLAYWRIGHT_CHANNEL=chrome reuses an
// installed Chrome instead of downloading Playwright's Chromium.
export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    locale: "ja-JP",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
    },
  ],
  webServer: {
    command: "pnpm build && pnpm start",
    url: "http://127.0.0.1:3000/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: { NEXT_TELEMETRY_DISABLED: "1", AI_CITY_ENABLE_LOCAL_MOCK: "1" },
  },
});
