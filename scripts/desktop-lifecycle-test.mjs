import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptsDirectory, "..");
const appRootArgument = process.argv.indexOf("--app-root");
const appRoot = appRootArgument >= 0
  ? path.resolve(repoRoot, String(process.argv[appRootArgument + 1] || ""))
  : repoRoot;
const sidecarEntry = path.join(appRoot, "desktop", "sidecar", "index.cjs");
const fakeLlamaEntry = path.join(scriptsDirectory, "desktop-fake-llama-server.mjs");
const allowedOrigin = "http://tauri.localhost";
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hematuria-desktop-lifecycle-"));
const children = new Set();

function secret() {
  return crypto.randomBytes(32).toString("base64url");
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function eventually(predicate, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("desktop_lifecycle_eventually_timeout");
}

function readFirstLine(stream, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => finish(new Error("sidecar_handshake_timeout")), timeoutMs);
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      const newline = buffer.indexOf("\n");
      if (newline >= 0) finish(null, buffer.slice(0, newline));
    };
    const onEnd = () => finish(new Error("sidecar_exited_before_handshake"));
    const finish = (error, line) => {
      clearTimeout(timeout);
      stream.off("data", onData);
      stream.off("end", onEnd);
      if (error) reject(error);
      else resolve(line);
    };
    stream.on("data", onData);
    stream.once("end", onEnd);
  });
}

function waitForExit(child, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null) return resolve(child.exitCode);
    const timeout = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // It may have exited at the timeout boundary.
      }
      reject(new Error("sidecar_exit_timeout"));
    }, timeoutMs);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
}

async function launch(name) {
  const dataDirectory = path.join(temporaryRoot, name);
  const modelPath = path.join(dataDirectory, "models", "Qwen3-1.7B-Q4_K_M.gguf");
  const llamaPidFile = path.join(dataDirectory, "fake-llama.pid");
  const bearer = secret();
  const handshake = secret();
  await fs.mkdir(path.dirname(modelPath), { recursive: true });
  await fs.writeFile(modelPath, "lifecycle-test-model-placeholder", "utf8");

  const child = spawn(process.execPath, [sidecarEntry], {
    cwd: appRoot,
    env: {
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      LOCALAPPDATA: process.env.LOCALAPPDATA,
      PATH: process.env.PATH,
      NODE_NO_WARNINGS: "1",
      HEMATURIA_APP_ROOT: appRoot,
      HEMATURIA_DESKTOP_DATA_DIR: dataDirectory,
      HEMATURIA_DESKTOP_DATABASE_PATH: path.join(dataDirectory, "hematuria.sqlite3"),
      HEMATURIA_LLAMA_SERVER_PATH: process.execPath,
      HEMATURIA_LLAMA_SERVER_PREFIX_ARGS: JSON.stringify([fakeLlamaEntry]),
      HEMATURIA_DESKTOP_TEST_MODE: "1",
      HEMATURIA_DESKTOP_TEST_LLAMA_PID_FILE: llamaPidFile,
      HEMATURIA_DESKTOP_ALLOWED_ORIGINS: allowedOrigin,
      HEMATURIA_DESKTOP_BEARER: bearer,
      HEMATURIA_DESKTOP_HANDSHAKE: handshake
    },
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"]
  });
  children.add(child);
  let diagnostics = "";
  child.stderr.on("data", (chunk) => {
    diagnostics = `${diagnostics}${chunk.toString("utf8")}`.slice(-32_000);
  });
  const linePromise = readFirstLine(child.stdout);
  child.stdin.write("START\n");
  let ready;
  try {
    ready = JSON.parse(await linePromise);
  } catch (error) {
    throw new Error(`${error.message}\n${diagnostics}`);
  }
  assert.equal(ready.event, "ready");
  assert.equal(ready.protocolVersion, 1);
  assert.equal(ready.handshake, handshake);
  assert.equal(ready.pid, child.pid);
  assert.equal(ready.databaseSchemaVersion, 1);
  assert.equal(ready.localAi.status, "ready");
  assert.match(ready.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(await fs.stat(path.join(dataDirectory, "hematuria.sqlite3")).then((value) => value.isFile()), true);
  const llamaPid = Number(await fs.readFile(llamaPidFile, "utf8"));
  assert.equal(processExists(llamaPid), true);
  return { bearer, child, dataDirectory, diagnostics: () => diagnostics, llamaPid, ready };
}

async function authorizedFetch(runtime, pathname = "/api/health/", options = {}) {
  return fetch(`${runtime.ready.origin}${pathname}`, {
    ...options,
    headers: {
      Origin: allowedOrigin,
      "X-Hematuria-Desktop-Token": runtime.bearer,
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(5000)
  });
}

try {
  const first = await launch("first");
  const second = await launch("second");
  assert.notEqual(first.ready.origin, second.ready.origin, "each launch must use a fresh random port");
  assert.notEqual(first.bearer, second.bearer, "each launch must use a fresh bearer");

  const unauthenticated = await fetch(`${first.ready.origin}/api/health/`);
  assert.equal(unauthenticated.status, 401);
  assert.deepEqual(await unauthenticated.json(), { error: "unauthorized" });

  const wrongLaunchToken = await fetch(`${second.ready.origin}/api/health/`, {
    headers: { "X-Hematuria-Desktop-Token": first.bearer }
  });
  assert.equal(wrongLaunchToken.status, 401);

  const health = await authorizedFetch(first);
  assert.equal(health.status, 200);
  const healthPayload = await health.json();
  assert.equal(healthPayload.status, "ok");
  assert.equal(JSON.stringify(healthPayload).includes(first.bearer), false);

  const settings = await authorizedFetch(first, "/api/desktop/settings/");
  assert.equal(settings.status, 200);
  const settingsPayload = await settings.json();
  assert.deepEqual(Object.keys(settingsPayload).sort(), [
    "llamaStatus",
    "localAiEnabled",
    "modelDirectory",
    "modelFilePath",
    "modelPresent",
    "version"
  ].sort());
  assert.equal(settingsPayload.modelPresent, true);
  assert.equal(settingsPayload.localAiEnabled, true);
  assert.equal(settingsPayload.llamaStatus, "ready");
  assert.equal(settingsPayload.version, 1);
  assert.equal(JSON.stringify(settingsPayload).includes(first.bearer), false);
  assert.equal((await authorizedFetch(first, "/api/desktop/settings")).status, 200);

  const unexpectedSetting = await authorizedFetch(first, "/api/desktop/settings/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: "must-not-be-accepted" })
  });
  assert.equal(unexpectedSetting.status, 400);
  const relativeDirectory = await authorizedFetch(first, "/api/desktop/settings/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modelDirectory: "relative-models" })
  });
  assert.equal(relativeDirectory.status, 400);

  const originalLlamaPid = first.llamaPid;
  const disabledSettings = await authorizedFetch(first, "/api/desktop/settings/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ localAiEnabled: false })
  });
  assert.equal(disabledSettings.status, 200);
  assert.equal((await disabledSettings.json()).llamaStatus, "disabled");
  await eventually(() => !processExists(originalLlamaPid));

  const alternateModelDirectory = path.join(first.dataDirectory, "alternate-models");
  await fs.mkdir(alternateModelDirectory, { recursive: true });
  await fs.writeFile(
    path.join(alternateModelDirectory, "Qwen3-1.7B-Q4_K_M.gguf"),
    "replacement-lifecycle-test-model-placeholder",
    "utf8"
  );
  const restartedSettings = await authorizedFetch(first, "/api/desktop/settings/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modelDirectory: alternateModelDirectory, localAiEnabled: true })
  });
  assert.equal(restartedSettings.status, 200);
  const restartedPayload = await restartedSettings.json();
  assert.equal(restartedPayload.modelDirectory, path.normalize(alternateModelDirectory));
  assert.equal(restartedPayload.modelPresent, true);
  assert.equal(restartedPayload.llamaStatus, "ready");
  first.llamaPid = Number(await fs.readFile(path.join(first.dataDirectory, "fake-llama.pid"), "utf8"));
  assert.notEqual(first.llamaPid, originalLlamaPid);
  assert.equal(processExists(first.llamaPid), true);

  const preflight = await fetch(`${first.ready.origin}/api/health/`, {
    method: "OPTIONS",
    headers: {
      Origin: allowedOrigin,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "X-Hematuria-Desktop-Token, X-Training-State"
    }
  });
  assert.equal(preflight.status, 204);
  assert.match(
    String(preflight.headers.get("access-control-allow-headers")),
    /X-Hematuria-Desktop-Token/i
  );
  assert.match(
    String(preflight.headers.get("access-control-allow-headers")),
    /X-Training-State/i
  );

  const rejectedOrigin = await fetch(`${first.ready.origin}/api/health/`, {
    headers: {
      Origin: "https://attacker.invalid",
      "X-Hematuria-Desktop-Token": first.bearer
    }
  });
  assert.equal(rejectedOrigin.status, 403);

  const unknownRoute = await authorizedFetch(first, "/api/not-present/");
  assert.equal(unknownRoute.status, 404);

  const firstOrigin = first.ready.origin;
  first.child.stdin.end();
  assert.equal(await waitForExit(first.child), 0, first.diagnostics());
  children.delete(first.child);
  await eventually(() => !processExists(first.llamaPid));
  await assert.rejects(
    fetch(`${firstOrigin}/api/health/`, { signal: AbortSignal.timeout(500) }),
    /fetch failed|aborted|timeout/i
  );

  second.child.stdin.end();
  assert.equal(await waitForExit(second.child), 0, second.diagnostics());
  children.delete(second.child);
  await eventually(() => !processExists(second.llamaPid));

  const rustLifecycleSource = await fs.readFile(path.join(repoRoot, "src-tauri", "src", "lib.rs"), "utf8");
  assert.match(rustLifecycleSource, /JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE/);
  assert.match(rustLifecycleSource, /AssignProcessToJobObject/);
  assert.match(rustLifecycleSource, /let job = JobObject::create\(\)\?/);
  assert.doesNotMatch(rustLifecycleSource, /JobObject::create\(\)\.ok\(\)/);
  assert.match(rustLifecycleSource, /taskkill/);
  const sidecarSource = await fs.readFile(sidecarEntry, "utf8");
  assert.match(sidecarSource, /\/v1\/models/);
  assert.match(sidecarSource, /for \(let attempt = 0; attempt < 3; attempt \+= 1\)/);
  const tauriConfig = JSON.parse(await fs.readFile(path.join(repoRoot, "src-tauri", "tauri.conf.json"), "utf8"));
  assert.equal(tauriConfig.build.frontendDist, "../out");
  assert.deepEqual(tauriConfig.bundle.targets, ["nsis"]);
  assert.match(tauriConfig.app.security.csp, /http:\/\/127\.0\.0\.1:\*/);

  console.log("Desktop lifecycle passed: gated handshake, SQLite readiness, random ports/tokens, settings-driven llama restart, CORS/auth, child cleanup, and Tauri kill-tree policy.");
} finally {
  for (const child of children) {
    try {
      child.stdin.end();
      child.kill("SIGKILL");
    } catch {
      // Test cleanup remains scoped to children created by this process.
    }
  }
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
