import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

import { resolvePreviewBlackboxConfig } from "./preview-blackbox-config.mjs";

const config = resolvePreviewBlackboxConfig(process.env);
if (config.blocked) {
  console.error(`${config.reason}: ${config.message}`);
  process.exit(2);
}

const outputDir = path.resolve("test-results", "preview-blackbox");
fs.rmSync(outputDir, { recursive: true, force: true });

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve("@playwright/test/cli");
const result = spawnSync(process.execPath, [playwrightCli, "test", "--config=playwright.preview.config.mjs"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit"
});

function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const candidate = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(candidate) : [candidate];
  });
}

const secretBytes = Buffer.from(config.bypassSecret);
const leaked = filesUnder(outputDir).filter((file) => fs.readFileSync(file).includes(secretBytes));
if (leaked.length > 0) {
  fs.rmSync(outputDir, { recursive: true, force: true });
  console.error("PREVIEW_SECRET_LEAK_DETECTED: generated Preview test artifacts were removed.");
  process.exit(1);
}

console.log("Preview artifact credential scan passed.");

process.exit(result.status ?? 1);
