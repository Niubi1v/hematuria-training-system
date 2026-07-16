import { defineConfig, devices } from "@playwright/test";

import { resolvePreviewBlackboxConfig } from "./scripts/preview-blackbox-config.mjs";

const preview = resolvePreviewBlackboxConfig(process.env);
if (preview.blocked) throw new Error(`${preview.reason}: ${preview.message}`);

export default defineConfig({
  testDir: "./tests/preview",
  testMatch: "preview-blackbox.spec.mjs",
  timeout: 120_000,
  expect: { timeout: 45_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: "test-results/preview-blackbox",
  reporter: [["line"]],
  use: {
    baseURL: preview.baseURL,
    trace: "off",
    screenshot: "off",
    video: "off"
  },
  projects: [
    { name: "preview-desktop-chromium", use: { ...devices["Desktop Chrome"] } }
  ]
});
