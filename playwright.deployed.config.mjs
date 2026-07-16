import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/exploratory",
  timeout: 600_000,
  expect: { timeout: 8_000 },
  workers: 2,
  retries: 0,
  outputDir: "artifacts/exploratory-qa/reports/deployed-test-results",
  reporter: [
    ["line"],
    ["json", { outputFile: "artifacts/exploratory-qa/reports/deployed-results.json" }],
    ["junit", { outputFile: "artifacts/exploratory-qa/reports/deployed-junit.xml" }]
  ],
  use: {
    browserName: "chromium",
    channel: "chrome",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  projects: [
    { name: "deployed-1440x900", use: { viewport: { width: 1440, height: 900 } } },
    { name: "deployed-390x844", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }
  ]
});
