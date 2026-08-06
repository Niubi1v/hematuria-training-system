import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const compatibility = require("../server/desktopCompatibility.js");
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedCategories = [
  "runtime_resources_missing",
  "node_spawn_failed",
  "job_object_failed",
  "sidecar_handshake_timeout",
  "sidecar_exited",
  "data_directory_unwritable",
  "sqlite_open_failed",
  "sqlite_locked_or_corrupt",
  "loopback_unavailable",
  "model_missing_or_invalid",
  "llama_dependency_missing",
  "llama_cpu_incompatible",
  "llama_memory_insufficient",
  "llama_start_failed",
  "security_software_suspected",
  "unknown_runtime_failure"
];

function readFirstLine(stream) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      const index = buffer.indexOf("\n");
      if (index >= 0) finish(null, buffer.slice(0, index));
    };
    const onEnd = () => finish(new Error("desktop_r5_sidecar_exited_before_handshake"));
    const finish = (error, line) => {
      stream.off("data", onData);
      stream.off("end", onEnd);
      if (error) reject(error);
      else resolve(line);
    };
    stream.on("data", onData);
    stream.once("end", onEnd);
  });
}

async function waitForExit(child) {
  if (child.exitCode !== null) return child.exitCode;
  return new Promise((resolve) => child.once("exit", (code) => resolve(code)));
}

function assertSafeDiagnostic(serialized, bearer) {
  assert.equal(serialized.includes(bearer), false);
  assert.equal(serialized.includes("patient questions"), false);
  assert.equal(serialized.includes("conversationHistory"), false);
  assert.equal(serialized.includes("training content"), false);
  assert.equal(serialized.includes("caseId"), false);
  assert.equal(serialized.includes("reasoning"), false);
  assert.equal(serialized.includes("Authorization"), false);
  if (process.env.USERPROFILE) assert.equal(serialized.includes(process.env.USERPROFILE), false);
}

async function sidecarDiagnosticRoundTrip() {
  const temporaryRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "hematuria-r5-compatibility-"));
  const dataDirectory = path.join(temporaryRoot, "r5-data");
  const bearer = crypto.randomBytes(32).toString("base64url");
  const handshake = crypto.randomBytes(32).toString("base64url");
  const sidecar = spawn(process.execPath, [path.join(repoRoot, "desktop", "sidecar", "index.cjs")], {
    cwd: repoRoot,
    env: {
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      LOCALAPPDATA: process.env.LOCALAPPDATA,
      USERPROFILE: process.env.USERPROFILE,
      PATH: process.env.PATH,
      NODE_NO_WARNINGS: "1",
      HEMATURIA_APP_ROOT: repoRoot,
      HEMATURIA_DESKTOP_DATA_DIR: dataDirectory,
      HEMATURIA_DESKTOP_DATABASE_PATH: path.join(dataDirectory, "hematuria.sqlite3"),
      HEMATURIA_DESKTOP_DISABLE_LOCAL_AI: "1",
      HEMATURIA_DESKTOP_ALLOWED_ORIGINS: "http://tauri.localhost",
      HEMATURIA_DESKTOP_BEARER: bearer,
      HEMATURIA_DESKTOP_HANDSHAKE: handshake,
      HEMATURIA_PRODUCT_VERSION: "r5-test",
      HEMATURIA_PRODUCT_HEAD: "r5-authoritative-head",
      NEXT_PUBLIC_GIT_SHA: "stale-renderer-head"
    },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  });
  let stderr = "";
  sidecar.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  try {
    sidecar.stdin.write("START\n");
    const ready = JSON.parse(await readFirstLine(sidecar.stdout));
    assert.equal(ready.event, "ready");
    assert.equal(ready.protocolVersion, 1);

    const request = (pathname, options = {}) => fetch(`${ready.origin}${pathname}`, {
      ...options,
      headers: {
        Origin: "http://tauri.localhost",
        "X-Hematuria-Desktop-Token": bearer,
        ...(options.headers || {})
      },
      signal: AbortSignal.timeout(5000)
    });
    const diagnosticsResponse = await request("/api/desktop/diagnostics");
    assert.equal(diagnosticsResponse.status, 200);
    const diagnostics = await diagnosticsResponse.json();
    assert.equal(diagnostics.schemaVersion, 2);
    assert.equal(diagnostics.productHead, "r5-authoritative-head");
    assert.equal(diagnostics.dataIsolation.currentProfile, "R5");
    assert.equal(diagnostics.dataIsolation.currentDirectory, "MentorLocalAI-R5");
    assert.equal(diagnostics.dataIsolation.migrationPerformed, false);
    assert.equal(diagnostics.localAi.status, "disabled");
    assert.match(diagnostics.paths.data, /<redacted>|%LOCALAPPDATA%/);
    for (const key of ["program", "applicationRoot", "database", "model"]) {
      assert.equal(typeof diagnostics.paths[key], "string", key);
    }
    assertSafeDiagnostic(JSON.stringify(diagnostics), bearer);

    const bootstrapResponse = await request("/api/desktop/state/bootstrap");
    assert.equal(bootstrapResponse.status, 200);
    assert.equal((await bootstrapResponse.json()).productHead, "r5-authoritative-head");

    const evidenceResponse = await request("/api/desktop/evidence");
    assert.equal(evidenceResponse.status, 200);
    assert.equal((await evidenceResponse.json()).productHead, "r5-authoritative-head");

    const firstExport = await request("/api/desktop/evidence/export", { method: "POST" });
    const secondExport = await request("/api/desktop/evidence/export", { method: "POST" });
    assert.equal(firstExport.status, 200);
    assert.equal(secondExport.status, 200);
    const firstExportPayload = await firstExport.json();
    const secondExportPayload = await secondExport.json();
    assert.notEqual(firstExportPayload.path, secondExportPayload.path);
    const exported = await fsp.readFile(firstExportPayload.path, "utf8");
    assertSafeDiagnostic(exported, bearer);
    assert.equal(JSON.parse(exported).schemaVersion, 2);

    for (const payload of [{ localAiEnabled: false }, { localAiEnabled: false }]) {
      const response = await request("/api/desktop/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).llamaStatus, "disabled");
    }
  } catch (error) {
    throw new Error(`${error.message}\n${stderr}`);
  } finally {
    if (sidecar.exitCode === null) sidecar.kill("SIGTERM");
    await waitForExit(sidecar);
    await fsp.rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function sidecarRejectsR4DataDirectory() {
  const temporaryRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "hematuria-r5-r4-reject-"));
  const localAppData = path.join(temporaryRoot, "LocalAppData");
  const legacyDataDirectory = compatibility.r4DataDirectory(localAppData);
  const sidecar = spawn(process.execPath, [path.join(repoRoot, "desktop", "sidecar", "index.cjs")], {
    cwd: repoRoot,
    env: {
      SystemRoot: process.env.SystemRoot,
      TEMP: process.env.TEMP,
      LOCALAPPDATA: localAppData,
      HEMATURIA_APP_ROOT: repoRoot,
      HEMATURIA_DESKTOP_DATA_DIR: legacyDataDirectory,
      HEMATURIA_DESKTOP_BEARER: crypto.randomBytes(32).toString("base64url"),
      HEMATURIA_DESKTOP_HANDSHAKE: crypto.randomBytes(32).toString("base64url")
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let stderr = "";
  sidecar.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  const exitCode = await waitForExit(sidecar);
  assert.equal(exitCode, 1);
  assert.match(stderr, /desktop_r4_data_directory_rejected/);
  assert.equal(stderr.includes(legacyDataDirectory), false);
  await fsp.rm(temporaryRoot, { recursive: true, force: true });
}

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hematuria-r5-compatibility-pure-"));
try {
  assert.deepEqual(compatibility.DESKTOP_ERROR_CATEGORIES, expectedCategories);
  for (const category of expectedCategories) {
    assert.equal(compatibility.classifyRuntimeError(category), category, category);
    assert.equal(compatibility.recoveriesFor(category, "zh").length > 0, true);
    assert.equal(compatibility.recoveriesFor(category, "en").length > 0, true);
  }
  assert.equal(compatibility.classifyRuntimeError("llama_server_exited_during_startup"), "llama_start_failed");
  assert.equal(compatibility.classifyRuntimeError("desktop_node_runtime_missing_run_desktop_prepare"), "runtime_resources_missing");
  assert.equal(compatibility.classifyRuntimeError(new Error("EACCES: access denied")), "security_software_suspected");
  assert.equal(compatibility.classifyRuntimeError(new Error("listen EADDRINUSE")), "loopback_unavailable");
  assert.equal(compatibility.normalizeRuntimeErrorCode("C:\\Users\\someone\\missing.exe"), "runtime_resource_missing");

  const localAppData = path.join(temporaryRoot, "LocalAppData");
  const r4 = compatibility.r4DataDirectory(localAppData);
  const r5 = compatibility.r5DataDirectory(localAppData);
  await fsp.mkdir(r5, { recursive: true });
  assert.notEqual(r4, r5);
  assert.equal(compatibility.isLegacyR4DataDirectory(r4, localAppData), true);
  assert.equal(compatibility.isLegacyR4DataDirectory(r5, localAppData), false);
  assert.equal(compatibility.directoryWritable(r5), true);
  assert.equal(compatibility.directoryWritable(path.join(temporaryRoot, "missing")), false);
  const resource = path.join(r5, "node.exe");
  await fsp.writeFile(resource, "resource");
  assert.deepEqual(compatibility.fileState(resource, 8), {
    present: true,
    size: 8,
    sizeMatches: true,
    sha256Status: "not_checked"
  });
  assert.equal(compatibility.fileState(resource, 7).sizeMatches, false);
  const redacted = compatibility.redactedPath(resource, { localAppData, userProfile: path.join(temporaryRoot, "User"), temp: os.tmpdir() });
  assert.match(redacted, /^%LOCALAPPDATA%/);
  assert.equal(redacted.includes("admin"), false);

  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "desktop", "runtime-manifest.json"), "utf8"));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.defaultModelMode, "lightweight");
  for (const descriptor of Object.values(manifest.models)) {
    assert.equal(path.basename(descriptor.fileName), descriptor.fileName);
    assert.match(descriptor.sha256, /^[a-f0-9]{64}$/);
    assert.equal(Number.isSafeInteger(descriptor.size), true);
    assert.equal(descriptor.thinkingMode, "disabled");
  }
  const portableScript = fs.readFileSync(path.join(repoRoot, "scripts", "desktop-package-portable.ps1"), "utf8");
  assert.match(portableScript, /portable\.marker/);
  assert.match(portableScript, /-Value\s+"portable"/);
  const tauriConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, "src-tauri", "tauri.conf.json"), "utf8"));
  assert.deepEqual(tauriConfig.bundle.resources, ["resources/**/*"]);
  for (const relativePath of [
    "scripts/desktop-install-model.mjs",
    "scripts/desktop-acceptance-test.mjs",
    "scripts/desktop-model-benchmark.mjs"
  ]) {
    const source = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
    assert.match(source, /r5DataDirectory/);
    assert.doesNotMatch(source, /cn\.hematuria\.training\.desktop/);
  }

  await sidecarDiagnosticRoundTrip();
  await sidecarRejectsR4DataDirectory();
  console.log("R5 desktop compatibility tests passed.");
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
