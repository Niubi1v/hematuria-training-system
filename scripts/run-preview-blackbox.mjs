import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

import { resolvePreviewBlackboxConfig } from "./preview-blackbox-config.mjs";
import {
  assessCapturedPreviewRun,
  redactSensitiveText,
  removePreviewOutputDirectories
} from "./preview-output-security.mjs";

const config = resolvePreviewBlackboxConfig(process.env);
if (config.blocked) {
  console.error(`${config.reason}: ${config.message}`);
  process.exit(2);
}

const outputDir = path.resolve("test-results", "preview-blackbox");
fs.rmSync(outputDir, { recursive: true, force: true });

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve("@playwright/test/cli");
const result = spawnSync(process.execPath, [playwrightCli, "test", "--config=playwright.preview.config.mjs", ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: process.env,
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024,
  stdio: ["ignore", "pipe", "pipe"]
});

const assessment = assessCapturedPreviewRun({
  stdout: result.stdout || "",
  stderr: result.stderr || "",
  error: result.error || null,
  outputDirectories: [outputDir],
  secrets: [config.bypassSecret]
});
if (!assessment.safe) {
  removePreviewOutputDirectories([outputDir]);
  console.error("SECURITY_BLOCKED: Preview output failed credential redaction checks and dedicated output was removed.");
  process.exit(1);
}

if (result.stdout) process.stdout.write(redactSensitiveText(result.stdout, [config.bypassSecret]));
if (result.stderr) process.stderr.write(redactSensitiveText(result.stderr, [config.bypassSecret]));

removePreviewOutputDirectories([outputDir]);
console.log(`Preview output credential scan passed: ${assessment.artifactScan.filesScanned} generated files checked.`);

process.exit(result.status ?? 1);
