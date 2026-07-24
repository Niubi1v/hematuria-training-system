import { defineConfig, devices } from "@playwright/test";

const localBrowser = process.env.CI ? {} : { channel: "chrome" };
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const externalServer = process.env.PLAYWRIGHT_EXTERNAL_SERVER === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: { baseURL, trace: "retain-on-failure" },
  // Manage Next directly so Playwright owns the actual server process. A
  // package-manager wrapper can leave the Next grandchild alive during teardown
  // and make an otherwise completed E2E job run into the workflow timeout.
  webServer: externalServer ? undefined : {
    command: "node node_modules/next/dist/bin/next dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], ...localBrowser } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"], ...localBrowser } }
  ]
});
