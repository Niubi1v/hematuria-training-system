import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") throw new Error("desktop_nsis_reproduction_requires_windows");
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const productHead = String(process.env.HEMATURIA_PRODUCT_HEAD || "");
assert.match(productHead, /^[0-9a-f]{40}$/u);
const version = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8")).version;
const artifactRoot = path.resolve(process.env.HEMATURIA_DESKTOP_ARTIFACTS
  || path.join(repoRoot, ".desktop-cache", "phase3-artifacts"));
const installer = path.join(artifactRoot, `hematuria-desktop-r5-setup-${version}-windows-x64.exe`);
const installerSha256 = crypto.createHash("sha256").update(await fs.readFile(installer)).digest("hex");
const evidenceRoot = path.resolve(process.env.HEMATURIA_NSIS_P0_EVIDENCE_ROOT
  || "D:\\HematuriaDesktopArtifacts\\R5-Handoffs");
const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const evidenceDirectory = path.join(evidenceRoot, `${timestamp}-R5-NSIS-P0-Reproduction-${productHead}`);
const scratchRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hematuria-nsis-reproduction-"));
const originalRuns = Number(process.env.HEMATURIA_NSIS_ORIGINAL_RUNS || 10);
const isolatedRuns = Number(process.env.HEMATURIA_NSIS_ISOLATED_RUNS || 20);
const reuseRuns = Number(process.env.HEMATURIA_NSIS_REUSE_RUNS || 10);
for (const [label, count] of [["original", originalRuns], ["isolated", isolatedRuns], ["reuse", reuseRuns]]) {
  assert.ok(Number.isInteger(count) && count >= 0 && count <= 100, `${label}_run_count_invalid`);
}

const summary = {
  schemaVersion: 1,
  status: "running",
  productHead,
  installerSha256,
  planned: { original: originalRuns, isolated: isolatedRuns, reuse: reuseRuns },
  completed: { original: 0, isolated: 0, reuse: 0 },
  rounds: [],
  startupPhasesPassed: true,
  oldProductProcessesObserved: 0,
  oldWebViewProcessesObserved: 0,
  firstFailure: null,
  startedAt: new Date().toISOString()
};

function run(bin, args, env = {}) {
  const result = spawnSync(bin, args, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: "utf8",
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
    throw new Error(`${path.basename(bin)} ${args.join(" ")} failed:${output.slice(-12_000)}`);
  }
  return String(result.stdout || "").trim();
}

function sanitize(value) {
  let output = String(value || "");
  for (const item of [process.env.USERPROFILE, repoRoot, scratchRoot, artifactRoot].filter(Boolean).sort((left, right) => right.length - left.length)) {
    output = output.replaceAll(item, "<redacted>").replaceAll(item.replaceAll("\\", "/"), "<redacted>");
  }
  return output.replace(/\b(?:authToken|bearer|handshake|stateToken)\b[^\r\n]*/giu, "<redacted-sensitive-field>");
}

function lastJson(output) {
  const line = output.split(/\r?\n/u).reverse().find((item) => item.trim().startsWith("{"));
  if (!line) throw new Error("nsis_reproduction_result_missing");
  return JSON.parse(line);
}

async function persistSummary() {
  await fs.mkdir(evidenceDirectory, { recursive: true });
  await fs.writeFile(path.join(evidenceDirectory, "matrix-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

function commonEnv(extra = {}) {
  return {
    HEMATURIA_PRODUCT_HEAD: productHead,
    HEMATURIA_DESKTOP_ARTIFACTS: artifactRoot,
    HEMATURIA_NSIS_ARTIFACT_SHA256: installerSha256,
    HEMATURIA_NSIS_P0_EVIDENCE_ROOT: evidenceRoot,
    ...extra
  };
}

async function record(matrix, round, result, variant = null) {
  const startup = result.startup || null;
  const surfaces = Array.isArray(result.surfaces) ? result.surfaces : [];
  if (startup) {
    assert.ok(Object.values(startup).every((value) => value === true), "startup_phase_not_complete");
    assert.equal(result.preLaunchInventory?.productPids?.length || 0, 0);
    assert.equal(result.preLaunchInventory?.webViewPids?.length || 0, 0);
  }
  for (const surface of surfaces.filter((item) => item.startup)) {
    assert.ok(Object.values(surface.startup).every((value) => value === true), `${surface.surface}_startup_phase_not_complete`);
    assert.equal(surface.preLaunchClean, true);
  }
  summary.completed[matrix] += 1;
  summary.rounds.push({
    matrix,
    round,
    variant,
    status: "passed",
    productHead: result.productHead,
    artifactShas: surfaces.length
      ? surfaces.map(({ surface, artifactSha }) => ({ surface, artifactSha }))
      : [{ surface: result.surface || "nsis", artifactSha: result.artifactSha || null }],
    surfaceCount: surfaces.length || 1,
    startupOnly: Boolean(result.startupOnly),
    processCleanup: result.processCleanup !== false,
    cloudRequestCount: Number(result.cloudRequestCount || result.comparableOutcome?.cloudRequestCount || 0)
  });
  await persistSummary();
}

async function safeRemove(target) {
  const relative = path.relative(scratchRoot, target);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "scratch_delete_outside_root");
  await fs.rm(target, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}

function install(destination) {
  run(installer, ["/S", `/D=${destination}`]);
  return {
    executable: path.join(destination, "hematuria-training-r5.exe"),
    uninstaller: path.join(destination, "uninstall.exe")
  };
}

async function startup(executable, stateRoot, keepRoot) {
  await fs.access(executable);
  const output = run(process.execPath, [path.join(repoRoot, "scripts", "test-desktop-tauri-smoke.mjs"), "--surface", "nsis", "--startup-only"], commonEnv({
    HEMATURIA_DESKTOP_TAURI_EXECUTABLE: executable,
    HEMATURIA_SURFACE_LABEL: "nsis-startup",
    HEMATURIA_TAURI_SMOKE_ROOT: stateRoot,
    HEMATURIA_TAURI_SMOKE_KEEP_ROOT: keepRoot ? "1" : "0"
  }));
  const result = lastJson(output);
  assert.equal(result.productHead, productHead);
  assert.equal(result.artifactSha, crypto.createHash("sha256").update(await fs.readFile(executable)).digest("hex"));
  return result;
}

function uninstall(uninstaller) {
  run(uninstaller, ["/S"]);
}

async function isolatedRound(label, round) {
  const output = run(process.execPath, [path.join(repoRoot, "scripts", "test-desktop-package-differential.mjs"), "--require-packages", "--nsis-only"], commonEnv());
  await record(label, round, lastJson(output));
}

async function variantRound(round) {
  const variant = ["old-webview-fresh-data", "reinstall-fresh-profile", "reinstall-existing-sqlite", "continuous-install-uninstall", "immediate-restart"][round % 5];
  const root = path.join(scratchRoot, `variant-${round}`);
  const installation = path.join(root, "installed");
  await fs.mkdir(root, { recursive: true });
  let installed;
  let primaryFailure;
  try {
    installed = install(installation);
    let result;
    if (variant === "old-webview-fresh-data") {
      const state = path.join(root, "state");
      await startup(installed.executable, state, true);
      await safeRemove(path.join(state, "data"));
      result = await startup(installed.executable, state, true);
    } else if (variant === "reinstall-fresh-profile") {
      await startup(installed.executable, path.join(root, "state-first"), false);
      uninstall(installed.uninstaller);
      installed = install(installation);
      result = await startup(installed.executable, path.join(root, "state-second"), false);
    } else if (variant === "reinstall-existing-sqlite") {
      const state = path.join(root, "state");
      await startup(installed.executable, state, true);
      uninstall(installed.uninstaller);
      installed = install(installation);
      result = await startup(installed.executable, state, true);
    } else if (variant === "continuous-install-uninstall") {
      await startup(installed.executable, path.join(root, "state-first"), false);
      uninstall(installed.uninstaller);
      installed = install(installation);
      result = await startup(installed.executable, path.join(root, "state-second"), false);
    } else {
      const state = path.join(root, "state");
      await startup(installed.executable, state, true);
      result = await startup(installed.executable, state, true);
    }
    await record("reuse", round + 1, result, variant);
  } catch (error) {
    primaryFailure = error;
    throw error;
  } finally {
    if (installed) {
      try { uninstall(installed.uninstaller); } catch { /* Preserve the primary failure. */ }
    }
    if (!primaryFailure) await safeRemove(root);
  }
}

async function relevantEventCounts() {
  const command = `$start=[datetime]${JSON.stringify(summary.startedAt)}; $logs=@('Microsoft-Windows-Windows Defender/Operational','Application'); $result=@{}; foreach($log in $logs){ try { $events=@(Get-WinEvent -FilterHashtable @{LogName=$log;StartTime=$start} -ErrorAction Stop | Where-Object { [string]$_.Message -match 'hematuria|training-r5|sidecar' }); $result[$log]=$events.Count } catch { $result[$log]=$null } }; $result | ConvertTo-Json -Compress`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8", windowsHide: true });
  try { return JSON.parse(String(result.stdout || "")); } catch { return null; }
}

await persistSummary();
try {
  run(process.execPath, [path.join(repoRoot, "scripts", "test-desktop-install-identity.mjs")], commonEnv());
  for (let round = 1; round <= originalRuns; round += 1) {
    const output = run(process.execPath, [path.join(repoRoot, "scripts", "test-desktop-package-differential.mjs"), "--require-packages"], commonEnv());
    await record("original", round, lastJson(output));
  }
  for (let round = 1; round <= isolatedRuns; round += 1) await isolatedRound("isolated", round);
  for (let round = 0; round < reuseRuns; round += 1) await variantRound(round);
  summary.status = "P0_NOT_REPRODUCED_WITH_ENHANCED_DIAGNOSTICS";
} catch (error) {
  summary.status = "runtime_missing_reproduced";
  summary.firstFailure = { message: sanitize(error?.message || error).slice(-12_000) };
} finally {
  summary.eventCounts = await relevantEventCounts();
  summary.finishedAt = new Date().toISOString();
  await persistSummary();
  const bytes = await fs.readFile(path.join(evidenceDirectory, "matrix-summary.json"));
  await fs.writeFile(path.join(evidenceDirectory, "manifest.sha256"), `${crypto.createHash("sha256").update(bytes).digest("hex")} *matrix-summary.json\n`, "utf8");
  assert.ok(path.basename(scratchRoot).startsWith("hematuria-nsis-reproduction-"));
  if (summary.status !== "runtime_missing_reproduced") {
    await fs.rm(scratchRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  }
}

process.stdout.write(`${JSON.stringify({
  status: summary.status,
  productHead,
  installerSha256,
  completed: summary.completed,
  evidenceDirectory
})}\n`);
if (summary.status === "runtime_missing_reproduced") process.exitCode = 1;
