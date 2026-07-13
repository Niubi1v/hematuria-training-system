import { defineConfig } from "@playwright/test";

const artifacts = "artifacts/exploratory-qa";
const node = JSON.stringify(process.execPath);

export default defineConfig({
  testDir: "./tests/exploratory",
  timeout: 90_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: `${artifacts}/reports/test-results`,
  reporter: [
    ["line"],
    ["html", { outputFolder: `${artifacts}/reports/html`, open: "never" }],
    ["json", { outputFile: `${artifacts}/reports/results.json` }],
    ["junit", { outputFile: `${artifacts}/reports/junit.xml` }]
  ],
  use: {
    baseURL: "http://127.0.0.1:3000",
    browserName: "chromium",
    channel: "chrome",
    headless: true,
    screenshot: "off",
    trace: "off",
    video: "off"
  },
  webServer: {
    command: `${node} node_modules/next/dist/bin/next dev`,
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 120_000
  },
  projects: [
    { name: "qa-1440x900", use: { viewport: { width: 1440, height: 900 } } },
    { name: "qa-1280x720", use: { viewport: { width: 1280, height: 720 } } },
    { name: "qa-390x844", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "qa-360x800", use: { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true } }
  ]
});
