import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { directoryFingerprint } from "../tests/desktop/surface-checkpoint.mjs";

if (process.platform !== "win32") throw new Error("desktop_phase4_requires_windows");
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modeIndex = process.argv.indexOf("--mode");
const mode = modeIndex >= 0 ? String(process.argv[modeIndex + 1] || "") : "lifecycle";
assert.ok(["lifecycle", "soak"].includes(mode), "desktop_phase4_mode_invalid");
const productHead = String(process.env.HEMATURIA_PRODUCT_HEAD || "");
assert.match(productHead, /^[0-9a-f]{40}$/u);
const configuredModelPath = String(process.env.HEMATURIA_DESKTOP_MODEL_PATH || "");
assert.ok(configuredModelPath, "desktop_phase4_model_path_required");
const modelPath = path.resolve(configuredModelPath);
const executable = path.resolve(process.env.HEMATURIA_DESKTOP_TAURI_EXECUTABLE
  || path.join(repoRoot, "src-tauri", "target", "release", "hematuria-training-r5.exe"));
const outputPath = path.resolve(process.env.HEMATURIA_PHASE4_OUTPUT
  || path.join(os.tmpdir(), `hematuria-phase4-${mode}-${Date.now()}.json`));
const lifecycleRuns = Number(process.env.HEMATURIA_PHASE4_LIFECYCLE_RUNS || 10);
const soakMinutes = Number(process.env.HEMATURIA_PHASE4_SOAK_MINUTES || 60);
assert.ok(Number.isInteger(lifecycleRuns) && lifecycleRuns >= 1 && lifecycleRuns <= 10);
assert.ok(Number.isFinite(soakMinutes) && soakMinutes > 0 && soakMinutes <= 60);

async function sha256(file) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

const expectedModelSha = "d2387ca2dbfee2ffabce7120d3770dadca0b293052bc2f0e138fdc940d9bc7b5";
assert.equal(await sha256(modelPath), expectedModelSha, "desktop_phase4_model_sha256_mismatch");
await fs.access(executable);

function percentile(values, quantile) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * quantile) - 1))];
}

function lastJson(output) {
  const line = String(output || "").split(/\r?\n/u).reverse().find((item) => item.trim().startsWith("{"));
  if (!line) throw new Error("desktop_phase4_result_missing");
  return JSON.parse(line);
}

function productProcesses() {
  const result = spawnSync("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-Command",
    "$items=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'hematuria-training-r5.exe' -or ($_.Name -eq 'msedgewebview2.exe' -and [string]$_.CommandLine -match 'hematuria') }); @($items | ForEach-Object ProcessId) | ConvertTo-Json -Compress"
  ], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error("desktop_phase4_process_inventory_unavailable");
  try {
    const value = JSON.parse(String(result.stdout || "[]"));
    return Array.isArray(value) ? value : value ? [value] : [];
  } catch { return []; }
}

const r4Directory = path.join(process.env.LOCALAPPDATA || os.tmpdir(), "HematuriaTraining", "MentorLocalAI-FinalCandidate");
const r4Before = await directoryFingerprint(r4Directory);
const scratchRoot = await fs.mkdtemp(path.join(os.tmpdir(), `hematuria-phase4-${mode}-`));
const startedAt = new Date().toISOString();
const deadline = Date.now() + soakMinutes * 60_000;
const summary = {
  schemaVersion: 1,
  status: "running",
  mode,
  productHead,
  modelSha256: expectedModelSha,
  replaySeed: productHead,
  planned: mode === "lifecycle" ? { cycles: lifecycleRuns } : { minutes: soakMinutes },
  completedCycles: 0,
  startedAt,
  cycles: [],
  firstFailure: null
};

async function persist() {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

const variants = ["normal", "中文路径", "space path"];
let failure;
await persist();
try {
  while (mode === "lifecycle" ? summary.completedCycles < lifecycleRuns : Date.now() < deadline) {
    const cycle = summary.completedCycles + 1;
    const variant = variants[(cycle - 1) % variants.length];
    const stateRoot = path.join(scratchRoot, variant, `cycle-${cycle}`);
    const result = spawnSync(process.execPath, [
      path.join(repoRoot, "scripts", "test-desktop-tauri-smoke.mjs"),
      "--surface", "no-bundle", "--real-local-ai"
    ], {
      cwd: repoRoot,
      env: {
        ...process.env,
        HEMATURIA_PRODUCT_HEAD: productHead,
        HEMATURIA_DESKTOP_MODEL_PATH: modelPath,
        HEMATURIA_DESKTOP_TAURI_EXECUTABLE: executable,
        HEMATURIA_SURFACE_LABEL: "phase4-real-local",
        HEMATURIA_TAURI_SMOKE_ROOT: stateRoot
      },
      encoding: "utf8",
      windowsHide: true
    });
    if (result.status !== 0) {
      const detail = `${result.stdout || ""}\n${result.stderr || ""}`.split(/\r?\n/u).slice(-8).join("\n");
      throw new Error(`desktop_phase4_cycle_failed:${cycle}:${detail}`);
    }
    const value = lastJson(result.stdout);
    assert.equal(value.status, "passed");
    assert.equal(value.productHead, productHead);
    assert.equal(value.realLocalAi, true);
    assert.equal(value.cloudRequestCount, 0);
    assert.equal(value.processCleanup, true);
    summary.cycles.push({
      cycle,
      pathVariant: variant,
      lifecycleCycles: value.lifecycleCycles,
      cloudRequestCount: value.cloudRequestCount,
      processCleanup: value.processCleanup,
      randomDurableMode: value.randomDurableMode,
      performance: value.performance
    });
    summary.completedCycles = cycle;
    await persist();
  }
  assert.equal(productProcesses().length, 0, "desktop_phase4_process_leak");
  assert.equal(await directoryFingerprint(r4Directory), r4Before, "desktop_phase4_r4_changed");
  const metrics = summary.cycles.map((cycle) => cycle.performance);
  const values = (key) => metrics.map((metric) => Number(metric[key] || 0));
  summary.performance = {
    classification: "same_head_reference",
    firstRuntimeReadyMs: { p50: percentile(values("firstRuntimeReadyMs"), 0.5), p95: percentile(values("firstRuntimeReadyMs"), 0.95) },
    firstModelReadyMs: { p50: percentile(values("firstModelReadyMs"), 0.5), p95: percentile(values("firstModelReadyMs"), 0.95) },
    firstAnswerMs: { p50: percentile(values("firstAnswerMs"), 0.5), p95: percentile(values("firstAnswerMs"), 0.95) },
    webViewCleanupMs: { p50: percentile(values("webViewCleanupMs"), 0.5), p95: percentile(values("webViewCleanupMs"), 0.95) },
    peakWorkingSetBytes: Object.fromEntries(["tauri", "sidecar", "llama"].map((name) => [name, Math.max(...metrics.map((metric) => Number(metric.peakWorkingSetBytes?.[name] || 0)))])),
    sqliteBytes: { min: Math.min(...values("sqliteBytes")), max: Math.max(...values("sqliteBytes")) },
    logBytes: { min: Math.min(...values("logBytes")), max: Math.max(...values("logBytes")) }
  };
  summary.status = mode === "lifecycle"
    ? lifecycleRuns === 10 ? "PASS_10X_REAL_MODEL_LIFECYCLE" : "PASS_TARGETED_REAL_MODEL_LIFECYCLE"
    : soakMinutes === 60 ? "PASS_60_MINUTE_SOAK" : "PASS_TARGETED_SOAK";
} catch (error) {
  failure = error;
  const message = String(error instanceof Error ? error.message : error).slice(-4000);
  summary.status = message.includes("TEST_HARNESS_WRONG_WEBVIEW") || message.includes("webview-debug-close")
    ? "PHASE4_TEST_HARNESS_FAILURE"
    : message.includes("runtime_missing")
      ? "PHASE4_BLOCKED_BY_CONFIRMED_P0"
      : "PHASE4_FAILED_UNCLASSIFIED";
  summary.firstFailure = { message };
} finally {
  summary.finishedAt = new Date().toISOString();
  summary.elapsedMs = Date.parse(summary.finishedAt) - Date.parse(startedAt);
  await persist();
  if (!failure) await fs.rm(scratchRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}

process.stdout.write(`${JSON.stringify({ status: summary.status, completedCycles: summary.completedCycles, outputPath })}\n`);
if (failure) process.exitCode = 1;
