import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests/local-fullstack",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["line"]],
  use: {
    baseURL,
    trace: "off",
    screenshot: "off",
    video: "off"
  },
  webServer: {
    command: "node scripts/dev-fullstack.mjs",
    url: `${baseURL}/api/health/`,
    reuseExistingServer: false,
    timeout: 180_000
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } }
  ]
});
