import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const compatibility = require("../server/desktopCompatibility.js");
const codes = [
  "desktop_health_probe_connect_failed",
  "desktop_health_probe_timeout",
  "desktop_health_probe_http_failed",
  "desktop_health_probe_payload_invalid",
  "desktop_health_probe_status_not_ok"
];

for (const code of codes) {
  assert.equal(compatibility.classifyRuntimeError(code), "loopback_unavailable", code);
}

function secret() {
  return crypto.randomBytes(32).toString("base64url");
}

function readFirstLine(stream, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => finish(new Error("health_probe_test_timeout")), timeoutMs);
    const finish = (error, line) => {
      clearTimeout(timeout);
      stream.off("data", onData);
      stream.off("end", onEnd);
      if (error) reject(error);
      else resolve(line);
    };
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      const index = buffer.indexOf("\n");
      if (index >= 0) finish(null, buffer.slice(0, index));
    };
    const onEnd = () => finish(new Error("health_probe_sidecar_closed"));
    stream.on("data", onData);
    stream.once("end", onEnd);
  });
}

function waitForExit(child) {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve) => child.once("exit", resolve));
}

async function expectFailure(testFault, expectedCode, expectedType) {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hematuria-health-probe-"));
  const bearer = secret();
  const handshake = secret();
  const child = spawn(process.execPath, [path.join(repoRoot, "desktop", "sidecar", "index.cjs")], {
    cwd: repoRoot,
    env: {
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      LOCALAPPDATA: process.env.LOCALAPPDATA,
      PATH: process.env.PATH,
      NODE_NO_WARNINGS: "1",
      HEMATURIA_APP_ROOT: repoRoot,
      HEMATURIA_DESKTOP_DATA_DIR: temporaryRoot,
      HEMATURIA_DESKTOP_DATABASE_PATH: path.join(temporaryRoot, "hematuria.sqlite3"),
      HEMATURIA_DESKTOP_DISABLE_LOCAL_AI: "1",
      HEMATURIA_DESKTOP_ALLOWED_ORIGINS: "http://tauri.localhost",
      HEMATURIA_DESKTOP_BEARER: bearer,
      HEMATURIA_DESKTOP_HANDSHAKE: handshake,
      HEMATURIA_DESKTOP_TEST_MODE: "1",
      HEMATURIA_DESKTOP_TEST_HEALTH_PROBE: testFault
    },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  try {
    child.stdin.write("START\n");
    const failure = JSON.parse(await readFirstLine(child.stdout));
    assert.equal(failure.event, "failure");
    assert.equal(failure.code, expectedCode);
    assert.equal(failure.category, "loopback_unavailable", JSON.stringify(failure));
    assert.equal(failure.phase, "loopback_health");
    assert.equal(failure.failureType, expectedType);
    assert.equal(failure.attempts, 1);
    assert.equal(Number.isSafeInteger(failure.durationMs), true);
    assert.equal(await waitForExit(child), 1);
    const log = stderr.trim().split(/\r?\n/u).map((line) => JSON.parse(line));
    const diagnostic = log.find((entry) => entry.event === "desktop_sidecar_start_failed");
    assert.equal(diagnostic.code, expectedCode);
    assert.equal(diagnostic.category, "loopback_unavailable");
    assert.equal(diagnostic.phase, "loopback_health");
    assert.equal(diagnostic.attempts, 1);
    assert.equal(stderr.includes(bearer), false);
    assert.equal(stderr.includes(handshake), false);
    assert.equal(stderr.includes(temporaryRoot), false);
    return failure;
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    await waitForExit(child);
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

const results = [];
for (const scenario of [
  ["transient_connect", "desktop_health_probe_connect_failed", "transport"],
  ["permanent_connect", "desktop_health_probe_connect_failed", "transport"],
  ["http_failed", "desktop_health_probe_http_failed", "http"],
  ["payload_invalid", "desktop_health_probe_payload_invalid", "payload"],
  ["status_not_ok", "desktop_health_probe_status_not_ok", "status"]
]) {
  results.push(await expectFailure(...scenario));
}

console.log(JSON.stringify({ status: "passed", singleShotTransientFailure: true, scenarios: results.map(({ code, phase, failureType, attempts }) => ({ code, phase, failureType, attempts })) }));
