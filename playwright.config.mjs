import { defineConfig, devices } from "@playwright/test";

const localBrowser = process.env.CI ? {} : { channel: "chrome" };

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" },
  webServer: { command: "pnpm run dev", url: "http://127.0.0.1:3000", reuseExistingServer: !process.env.CI, timeout: 120_000 },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], ...localBrowser } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"], ...localBrowser } }
  ]
});
