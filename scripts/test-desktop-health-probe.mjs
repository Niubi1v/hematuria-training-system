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
const transientRuns = Number(process.env.HEMATURIA_HEALTH_PROBE_TRANSIENT_RUNS || 1);
const permanentRuns = Number(process.env.HEMATURIA_HEALTH_PROBE_PERMANENT_RUNS || 1);
const realRuns = Number(process.env.HEMATURIA_HEALTH_PROBE_REAL_RUNS || 1);
for (const count of [transientRuns, permanentRuns, realRuns]) assert.ok(Number.isInteger(count) && count >= 1 && count <= 100);

for (const code of [
  "desktop_health_probe_connect_failed",
  "desktop_health_probe_timeout",
  "desktop_health_probe_http_failed",
  "desktop_health_probe_payload_invalid",
  "desktop_health_probe_status_not_ok"
]) {
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

async function launch(testFault) {
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
      ...(testFault ? { HEMATURIA_DESKTOP_TEST_HEALTH_PROBE: testFault } : {})
    },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  child.stdin.write("START\n");
  return { bearer, child, handshake, line: JSON.parse(await readFirstLine(child.stdout)), stderr: () => stderr, temporaryRoot };
}

async function cleanup(runtime) {
  if (runtime.child.exitCode === null) runtime.child.stdin.end();
  await waitForExit(runtime.child);
  await fs.rm(runtime.temporaryRoot, { recursive: true, force: true });
}

async function expectReady(testFault) {
  const runtime = await launch(testFault);
  try {
    assert.equal(runtime.line.event, "ready", JSON.stringify(runtime.line));
    assert.match(runtime.line.origin, /^http:\/\/127\.0\.0\.1:\d+$/u);
    assert.equal(runtime.line.healthProbe.attempts, testFault === "transient_connect" ? 2 : 1);
    const response = await fetch(`${runtime.line.origin}/api/health/`, {
      headers: { "X-Hematuria-Desktop-Token": runtime.bearer },
      signal: AbortSignal.timeout(2000)
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "ok");
    assert.equal(runtime.stderr().includes(runtime.bearer), false);
    assert.equal(runtime.stderr().includes(runtime.handshake), false);
    assert.equal(runtime.stderr().includes(runtime.temporaryRoot), false);
  } finally {
    await cleanup(runtime);
  }
}

async function expectFailure(testFault, expectedCode, expectedType, expectedAttempts = 1) {
  const runtime = await launch(testFault);
  try {
    const failure = runtime.line;
    assert.equal(failure.event, "failure");
    assert.equal(failure.code, expectedCode);
    assert.equal(failure.category, "loopback_unavailable", JSON.stringify(failure));
    assert.equal(failure.phase, "loopback_health");
    assert.equal(failure.failureType, expectedType);
    assert.equal(failure.attempts, expectedAttempts);
    assert.equal(Number.isSafeInteger(failure.durationMs), true);
    assert.equal(await waitForExit(runtime.child), 1);
    const log = runtime.stderr().trim().split(/\r?\n/u).map((line) => JSON.parse(line));
    const diagnostic = log.find((entry) => entry.event === "desktop_sidecar_start_failed");
    assert.equal(diagnostic.code, expectedCode);
    assert.equal(diagnostic.category, "loopback_unavailable");
    assert.equal(diagnostic.phase, "loopback_health");
    assert.equal(runtime.stderr().includes(runtime.bearer), false);
    assert.equal(runtime.stderr().includes(runtime.handshake), false);
    assert.equal(runtime.stderr().includes(runtime.temporaryRoot), false);
    return failure;
  } finally {
    await cleanup(runtime);
  }
}

for (let index = 0; index < transientRuns; index += 1) await expectReady("transient_connect");
const permanent = [];
for (let index = 0; index < permanentRuns; index += 1) {
  permanent.push(await expectFailure("permanent_connect", "desktop_health_probe_connect_failed", "transport", 4));
}
for (const scenario of [
  ["timeout", "desktop_health_probe_timeout", "timeout", 4],
  ["http_failed", "desktop_health_probe_http_failed", "http"],
  ["payload_invalid", "desktop_health_probe_payload_invalid", "payload"],
  ["status_not_ok", "desktop_health_probe_status_not_ok", "status"]
]) {
  await expectFailure(...scenario);
}
for (let index = 0; index < realRuns; index += 1) await expectReady("");

console.log(JSON.stringify({
  status: "passed",
  transientRecovered: transientRuns,
  permanentFailedClosed: permanent.length,
  realStartClose: realRuns,
  permanentAttempts: [...new Set(permanent.map((failure) => failure.attempts))]
}));
