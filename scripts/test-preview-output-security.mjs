import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  REDACTED,
  assessCapturedPreviewRun,
  hasUnredactedSensitiveText,
  redactSensitiveText,
  redactSensitiveValue,
  removePreviewOutputDirectories,
  scanPreviewOutputDirectories,
  valueHasUnredactedSensitiveData
} from "./preview-output-security.mjs";

const canary = `preview-canary-${crypto.randomBytes(24).toString("hex")}`;
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hematuria-preview-output-security-"));
const cookieHeader = ["Coo", "kie"].join("");
const setCookieHeader = ["Set", cookieHeader].join("-");

function expectUnsafe(label, value) {
  assert.equal(valueHasUnredactedSensitiveData(value, [canary]), true, `${label} must be rejected`);
  const safe = redactSensitiveValue(value, [canary]);
  assert.equal(valueHasUnredactedSensitiveData(safe, [canary]), false, `${label} must redact recursively`);
  assert.equal(JSON.stringify(safe).includes(canary), false, `${label} redaction must remove exact canary bytes`);
}

try {
  const failures = [
    ["302", new Error(`HTTP 302 Location: https://vercel.com/login\nx-vercel-protection-bypass: ${canary}`)],
    ["401", { status: 401, headers: { authorization: `Bearer ${canary}` } }],
    ["403", { status: 403, headers: { cookie: `bypass=${canary}` } }],
    ["500", { status: 500, response: { attemptToken: canary } }],
    ["timeout", new Error(`request timeout; ${cookieHeader}: preview=${canary}`)],
    ["dns", new Error(`getaddrinfo ENOTFOUND preview.invalid?sessionToken=${canary}`)],
    ["navigation", new Error(`page.goto failed; Authorization: Bearer ${canary}`)],
    ["interception", { message: "route.continue failed", request: { "x-vercel-protection-bypass": canary } }],
    ["assertion", { matcherResult: { actual: `attempt_token=${canary}` } }],
    ["uncaught", new Error("uncaught wrapper", { cause: new Error(`signature=${canary}`) })]
  ];
  for (const [label, value] of failures) expectUnsafe(label, value);

  const safeAudit = {
    headers: {
      "x-vercel-protection-bypass": REDACTED,
      "x-vercel-set-bypass-cookie": REDACTED
    },
    bypassInjected: true,
    sameOriginInjectionRequestCount: 2,
    crossOriginInjectionRequestCount: 0
  };
  assert.equal(valueHasUnredactedSensitiveData(safeAudit, [canary]), false);

  const rawUrl = `https://preview.example.test/fail?attemptToken=${encodeURIComponent(canary)}`;
  const safeUrl = redactSensitiveText(rawUrl, [canary]);
  assert.equal(safeUrl.includes(canary), false);
  assert.equal(hasUnredactedSensitiveText(safeUrl, [canary]), false);

  const channels = [
    ["reporter.json", JSON.stringify({ headers: { authorization: `Bearer ${canary}` } })],
    ["report.html", `<pre>${cookieHeader}: bypass=${canary}</pre>`],
    ["trace.zip", `synthetic trace metadata\nx-vercel-protection-bypass: ${canary}`],
    ["temporary.log", `stderr ${setCookieHeader}: bypass=${canary}`]
  ];
  for (const [file, contents] of channels) fs.writeFileSync(path.join(tempRoot, file), contents);
  fs.writeFileSync(path.join(tempRoot, `screenshot-${canary}.png`), "synthetic screenshot filename canary");

  const artifactScan = scanPreviewOutputDirectories([tempRoot], [canary]);
  assert.equal(artifactScan.safe, false, "report, HTML, trace, screenshot filename and temporary files must be scanned");
  assert.equal(artifactScan.scanError, false);
  assert.equal(artifactScan.findings, channels.length + 1);

  const captured = assessCapturedPreviewRun({
    stdout: `request failed x-vercel-protection-bypass: ${canary}`,
    stderr: `Authorization: Bearer ${canary}`,
    error: failures.at(-1)[1],
    outputDirectories: [tempRoot],
    secrets: [canary]
  });
  assert.equal(captured.safe, false, "stdout, stderr, nested errors and generated files must fail closed together");

  const cleanDir = fs.mkdtempSync(path.join(os.tmpdir(), "hematuria-preview-output-clean-"));
  try {
    const spawnFailure = assessCapturedPreviewRun({
      stdout: "",
      stderr: "",
      error: new Error("synthetic child process launch failure"),
      outputDirectories: [cleanDir],
      secrets: [canary]
    });
    assert.equal(spawnFailure.safe, false, "runner launch errors must fail closed even without credential text");
    assert.equal(spawnFailure.executionError, true);
  } finally {
    removePreviewOutputDirectories([cleanDir]);
  }

  const playwrightConfig = fs.readFileSync(path.resolve("playwright.preview.config.mjs"), "utf8");
  assert.match(playwrightConfig, /trace:\s*"off"/);
  assert.match(playwrightConfig, /screenshot:\s*"off"/);
  assert.match(playwrightConfig, /video:\s*"off"/);
  assert.match(playwrightConfig, /reporter:\s*\[\["line"\]\]/);

  console.log(`Preview output security canary passed: ${failures.length} error paths and ${channels.length + 1} artifact channels rejected without credential output.`);
} finally {
  removePreviewOutputDirectories([tempRoot]);
}
