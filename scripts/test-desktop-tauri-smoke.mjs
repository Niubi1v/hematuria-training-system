import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "@playwright/test";
import {
  assertLoopbackClosed,
  desktopJson,
  expectSubmittedStageThree,
  orderReportsAndEnterStageThree,
  repoRoot,
  runtimeProbe,
  runtimeEvidence,
  saveHistoryDraft,
  seedCompletedPercentageFixture,
  submitHistoryAndEnterStageTwo
} from "../tests/desktop/desktop-harness.mjs";
import {
  databaseCheckpoint,
  directoryFingerprint,
  fileSha256,
  writeSurfaceCheckpoint
} from "../tests/desktop/surface-checkpoint.mjs";

if (process.platform !== "win32") throw new Error("desktop_tauri_smoke_requires_windows");
const noProxy = [process.env.NO_PROXY, process.env.no_proxy, "127.0.0.1", "localhost", "::1"]
  .filter(Boolean)
  .join(",");
process.env.NO_PROXY = noProxy;
process.env.no_proxy = noProxy;
const surfaceIndex = process.argv.indexOf("--surface");
const surface = surfaceIndex >= 0 ? String(process.argv[surfaceIndex + 1] || "") : "no-bundle";
if (!new Set(["no-bundle", "portable", "nsis"]).has(surface)) throw new Error(`desktop_tauri_surface_not_implemented:${surface}`);
const mentorHumanEntrypoint = process.argv.includes("--mentor-human-entrypoint");
const mentorDirectExe = process.argv.includes("--direct-app-exe");
if (mentorDirectExe && !mentorHumanEntrypoint) throw new Error("direct_app_exe_requires_mentor_package");
const mentorPackageRoot = mentorHumanEntrypoint ? path.resolve(process.env.HEMATURIA_MENTOR_PACKAGE_ROOT || "") : "";
if (mentorHumanEntrypoint && !process.env.HEMATURIA_MENTOR_PACKAGE_ROOT) throw new Error("mentor_package_root_required");
const surfaceLabel = process.env.HEMATURIA_SURFACE_LABEL || surface;
const startupOnly = process.argv.includes("--startup-only");
const realLocalAi = mentorHumanEntrypoint || process.argv.includes("--real-local-ai");
if (!/^[a-z0-9-]{1,40}$/u.test(surfaceLabel)) throw new Error("desktop_tauri_surface_label_invalid");
const expectedInstallationMode = mentorHumanEntrypoint || surface === "portable" ? "portable" : surface === "nsis" ? "installer" : "development";
const usesFakeLocalAi = expectedInstallationMode === "development" && !realLocalAi;
const localAiEnabled = usesFakeLocalAi || realLocalAi;
const executable = mentorHumanEntrypoint
  ? path.join(mentorPackageRoot, "App", "HematuriaTraining-R5.exe")
  : path.resolve(process.env.HEMATURIA_DESKTOP_TAURI_EXECUTABLE
  || path.join(repoRoot, "src-tauri", "target", "release", "hematuria-training-r5.exe"));
const mentorLauncher = mentorHumanEntrypoint ? path.join(mentorPackageRoot, "启动血尿训练系统.cmd") : "";
try {
  await fs.access(executable);
  if (mentorHumanEntrypoint && !mentorDirectExe) await fs.access(mentorLauncher);
} catch {
  throw new Error(mentorHumanEntrypoint ? "mentor_human_entrypoint_missing" : "desktop_tauri_executable_missing");
}
if (expectedInstallationMode !== "development") {
  const resources = path.join(path.dirname(executable), "resources");
  for (const required of [
    path.join(resources, "runtime", "node", "node.exe"),
    path.join(resources, "app", "desktop", "sidecar", "index.cjs"),
    path.join(resources, "app", "desktop", "runtime-manifest.json")
  ]) await fs.access(required);
}
const expectedProductHead = String(process.env.HEMATURIA_EXPECTED_PRODUCT_HEAD || "").trim() || execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repoRoot,
  encoding: "utf8",
  windowsHide: true
}).trim();
if (!/^[0-9a-f]{40}$/u.test(expectedProductHead)) throw new Error("desktop_expected_product_head_invalid");
const configuredRealModelPath = String(process.env.HEMATURIA_DESKTOP_MODEL_PATH || "");
const realModelPath = mentorHumanEntrypoint
  ? path.join(mentorPackageRoot, "Model", "Qwen3-1.7B-Q4_K_M.gguf")
  : realLocalAi && configuredRealModelPath ? path.resolve(configuredRealModelPath) : "";
if (realLocalAi) {
  assert.ok(realModelPath, "desktop_real_model_path_required");
  const manifest = JSON.parse(await fs.readFile(path.join(repoRoot, "desktop", "runtime-manifest.json"), "utf8"));
  const model = manifest.models.lightweight;
  assert.equal((await fs.stat(realModelPath)).size, model.size, "desktop_real_model_size_mismatch");
  assert.equal(await fileSha256(realModelPath), model.sha256, "desktop_real_model_sha256_mismatch");
}
const evidenceRoot = path.resolve(process.env.HEMATURIA_NSIS_P0_EVIDENCE_ROOT
  || "D:\\HematuriaDesktopArtifacts\\R5-Handoffs");
const patientStudentKeys = ["isFallback", "matchedFacts", "matchedSlotIds", "publicReplyState", "replyText"];
const publicReplyStates = new Set(["answered", "governed", "safety", "connection_unavailable"]);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function step(label, promise) {
  try { return await promise; }
  catch (error) { throw new Error(`${label}:${error instanceof Error ? error.message : String(error)}`); }
}

async function eventually(predicate, timeoutMs = 20_000, label = "condition") {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await delay(50);
  }
  throw new Error(`desktop_tauri_eventually_timeout:${label}`);
}

function sanitize(value, paths = []) {
  let output = String(value || "");
  for (const item of [...paths, executable, repoRoot, process.env.USERPROFILE, process.env.LOCALAPPDATA, process.env.TEMP]
    .filter(Boolean)
    .sort((left, right) => String(right).length - String(left).length)) {
    const escaped = String(item).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    output = output.replace(new RegExp(escaped, "giu"), "<redacted>");
    output = output.replace(new RegExp(escaped.replaceAll("\\\\", "[/\\\\]"), "giu"), "<redacted>");
  }
  return output;
}

function powershellLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function safeTimestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

function processInventory() {
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "$products=@(Get-Process -Name 'HematuriaTraining-R5' -ErrorAction SilentlyContinue); @{available=$true;productPids=@($products | ForEach-Object Id);webViewPids=@()} | ConvertTo-Json -Compress"
  ], { encoding: "utf8", windowsHide: true });
  try {
    const value = JSON.parse(String(result.stdout || ""));
    return {
      available: Boolean(value.available),
      productPids: (Array.isArray(value.productPids) ? value.productPids : value.productPids ? [value.productPids] : []).map(Number),
      webViewPids: (Array.isArray(value.webViewPids) ? value.webViewPids : value.webViewPids ? [value.webViewPids] : []).map(Number)
    };
  } catch {
    return { available: false, productPids: [], webViewPids: [] };
  }
}

function peakWorkingSetBytes(pid) {
  if (!pid) return 0;
  const result = spawnSync("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-Command",
    `(Get-Process -Id ${Number(pid)} -ErrorAction Stop).PeakWorkingSet64`
  ], { encoding: "utf8", windowsHide: true });
  const value = Number(String(result.stdout || "").trim());
  return result.status === 0 && Number.isFinite(value) ? value : 0;
}

async function directoryBytes(directory) {
  let total = 0;
  let entries;
  try { entries = await fs.readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error?.code === "ENOENT") return 0; throw error; }
  for (const entry of entries) {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await directoryBytes(child);
    else total += (await fs.stat(child)).size;
  }
  return total;
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.equal(typeof address, "object");
  const port = address.port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function llamaNetworkState(pid) {
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `$process=Get-CimInstance Win32_Process -Filter "ProcessId = ${Number(pid)}" -ErrorAction SilentlyContinue; $listeners=@(Get-NetTCPConnection -State Listen -OwningProcess ${Number(pid)} -ErrorAction SilentlyContinue); $match=[regex]::Match([string]$process.CommandLine,'--port\\s+(\\d+)'); @{exists=[bool]$process;listenerCount=$listeners.Count;ports=@($listeners | ForEach-Object LocalPort | Sort-Object -Unique);argumentPort=if($match.Success){[int]$match.Groups[1].Value}else{0}} | ConvertTo-Json -Compress`
  ], { encoding: "utf8", windowsHide: true });
  try {
    const value = JSON.parse(String(result.stdout || ""));
    return {
      exists: Boolean(value.exists),
      listenerCount: Number(value.listenerCount || 0),
      ports: (Array.isArray(value.ports) ? value.ports : value.ports ? [value.ports] : []).map(Number),
      argumentPort: Number(value.argumentPort || 0)
    };
  } catch {
    return { exists: false, listenerCount: -1, ports: [], argumentPort: 0 };
  }
}

async function assertLlamaClosed(pid, port) {
  await eventually(() => !processExists(pid), 20_000, "llama-process-exit");
  await eventually(async () => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    return new Promise((resolve) => {
      socket.once("connect", () => { socket.destroy(); resolve(false); });
      socket.once("error", () => resolve(true));
      socket.setTimeout(250, () => { socket.destroy(); resolve(true); });
    });
  }, 20_000, "llama-port-close");
}

function waitForExit(child, timeoutMs = 20_000) {
  if (typeof child.once !== "function") return eventually(() => child.exitCode === null ? false : { code: child.exitCode }, timeoutMs, "process-exit").then(({ code }) => code);
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null) return resolve(child.exitCode);
    const timeout = setTimeout(() => reject(new Error("desktop_tauri_exit_timeout")), timeoutMs);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
}

function processHandle(pid) {
  return {
    pid,
    get exitCode() { return processExists(pid) ? null : 0; },
    kill() {
      spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Stop-Process -Id ${Number(pid)} -Force -ErrorAction SilentlyContinue`], { windowsHide: true });
    }
  };
}

function webViewDebugState(port, webViewDirectory = "") {
  const profile = powershellLiteral(webViewDirectory);
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `$profile=${profile}; $processes=@(Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*--remote-debugging-port=${port}*' }); $listeners=@(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue); @{processCount=$processes.Count;listenerCount=$listeners.Count;addresses=@($listeners | ForEach-Object LocalAddress | Sort-Object -Unique);processes=@($processes | ForEach-Object { @{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;profileMatch=[bool]([string]$_.CommandLine -like "*$profile*")} })} | ConvertTo-Json -Depth 4 -Compress`
  ], { encoding: "utf8", windowsHide: true });
  try {
    const value = JSON.parse(String(result.stdout || ""));
    return {
      processCount: Number(value.processCount || 0),
      listenerCount: Number(value.listenerCount || 0),
      addresses: Array.isArray(value.addresses) ? value.addresses : value.addresses ? [value.addresses] : [],
      processes: (Array.isArray(value.processes) ? value.processes : value.processes ? [value.processes] : []).map((item) => ({
        pid: Number(item.pid || 0),
        parentPid: Number(item.parentPid || 0),
        profileMatch: Boolean(item.profileMatch)
      }))
    };
  } catch {
    return { processCount: -1, listenerCount: -1, addresses: [], processes: [] };
  }
}

async function assertWebViewDebugClosed(port) {
  const startedAt = performance.now();
  await eventually(() => {
    const state = webViewDebugState(port);
    return state.processCount === 0 && state.listenerCount === 0;
  }, 60_000, "webview-debug-close");
  return Math.round(performance.now() - startedAt);
}

async function connectToWebView(port, child, webViewDirectory, preLaunchInventory) {
  const endpoints = [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`
  ];
  const deadline = Date.now() + (realLocalAi || expectedInstallationMode !== "development" ? 60_000 : 30_000);
  let browser;
  let cdpConnected = false;
  let runtimeFailure = null;
  let pageEvidence = [];
  const observedOrigins = new Set();
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`desktop_tauri_exited_before_runtime:${child.exitCode}`);
    try {
      if (!browser) {
        for (const endpoint of endpoints) {
          try {
            browser = await chromium.connectOverCDP(endpoint);
            break;
          } catch { /* Try the next loopback representation. */ }
        }
      }
      if (!browser) throw new Error("desktop_tauri_cdp_connect_failed");
      cdpConnected = true;
      pageEvidence = [];
      for (const context of browser.contexts()) {
        for (const page of context.pages()) {
          try { observedOrigins.add(new URL(page.url()).origin); } catch { observedOrigins.add("unparseable"); }
          const pageState = await page.evaluate(async () => {
            try {
              const report = await globalThis.__TAURI_INTERNALS__?.invoke?.("desktop_diagnostic_snapshot");
              const bootstrap = globalThis.__HEMATURIA_DESKTOP_BOOTSTRAP__ || null;
              return {
                bootstrap,
                diagnosticProductHead: globalThis.__HEMATURIA_DESKTOP_DIAGNOSTIC__?.productHead || null,
                runtimeDefined: globalThis.__HEMATURIA_DESKTOP_RUNTIME__?.runtimeTarget === "desktop",
                runtimeProductHead: report?.productHead || null,
                report: report ? {
                  productHead: report.productHead,
                  installationMode: report.installationMode,
                  stableFailureCodes: report.stableFailureCodes,
                  lastFailure: report.lastFailure ? {
                    category: report.lastFailure.category,
                    code: report.lastFailure.code,
                    phase: report.lastFailure.phase
                  } : null,
                  startup: report.startup || null
                } : null
              };
            } catch {
              return { bootstrap: globalThis.__HEMATURIA_DESKTOP_BOOTSTRAP__ || null, runtimeDefined: false, report: null };
            }
          }).catch(() => null);
          pageEvidence.push({ origin: (() => { try { return new URL(page.url()).origin; } catch { return "unparseable"; } })(), ...pageState });
          runtimeFailure = pageState?.report || runtimeFailure;
          const bootstrap = pageState?.bootstrap;
          if (pageState?.runtimeDefined
            && pageState.runtimeProductHead === expectedProductHead
            && bootstrap?.scriptExecuted === true
            && bootstrap.runtimeExpected === true
            && bootstrap.runtimeDefined === true
            && bootstrap.diagnosticDefined === true) {
            return { browser, page, bootstrap, startup: pageState.report.startup };
          }
        }
      }
    } catch {
      if (browser && !browser.isConnected()) browser = undefined;
    }
    await delay(100);
  }
  await browser?.close().catch(() => undefined);
  const origins = [...observedOrigins].sort().join(",") || "none";
  const debugState = webViewDebugState(port, webViewDirectory);
  const http = [];
  for (const [index, endpoint] of endpoints.entries()) {
    try {
      const response = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1_000) });
      http.push(`${index}:${response.status}`);
    } catch {
      http.push(`${index}:error`);
    }
  }
  const runtimeConfigAvailable = runtimeFailure?.startup?.runtimeConfigAvailable;
  const hasExpectedRuntimePage = pageEvidence.some((page) => page.runtimeDefined && page.runtimeProductHead === expectedProductHead);
  const profileMatches = debugState.processes.some((item) => item.profileMatch);
  const classification = runtimeConfigAvailable === false
    ? "RUNTIME_NOT_CREATED"
    : !profileMatches || pageEvidence.some((page) => page.runtimeDefined && page.runtimeProductHead !== expectedProductHead)
      ? "TEST_HARNESS_WRONG_WEBVIEW"
      : runtimeConfigAvailable === true && !hasExpectedRuntimePage
      ? "RUNTIME_CREATED_BUT_INJECTION_MISSING"
      : "TEST_HARNESS_WRONG_WEBVIEW";
  const evidence = {
    classification,
    cdpConnected,
    cdpPort: port,
    debugState,
    expectedProfileObserved: profileMatches,
    http,
    origins: [...observedOrigins].sort(),
    pageCount: pageEvidence.length,
    pages: pageEvidence,
    preLaunchInventory,
    runtimeFailure
  };
  throw Object.assign(new Error(`desktop_tauri_runtime_injection_unavailable:${cdpConnected ? "runtime_missing" : "cdp_unreachable"}:classification=${classification}:origins=${origins}`), { runtimeEvidence: evidence });
}

async function closeNormally(child) {
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `(Get-Process -Id ${child.pid} -ErrorAction Stop).CloseMainWindow()`
  ], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0 || !/^True\s*$/i.test(String(result.stdout || ""))) {
    throw new Error("desktop_tauri_close_main_window_failed");
  }
  assert.equal(await waitForExit(child), 0);
}

async function launch(dataDirectory, webViewDirectory) {
  const cdpPort = await reservePort();
  const preLaunchInventory = processInventory();
  assert.equal(preLaunchInventory.available, true, "desktop_tauri_process_inventory_unavailable");
  if (preLaunchInventory.productPids.length || preLaunchInventory.webViewPids.length) {
    throw Object.assign(new Error("desktop_tauri_preexisting_product_process"), { cdpPort, preLaunchInventory });
  }
  const modelPath = realLocalAi ? realModelPath : path.join(dataDirectory, "models", "Qwen3-1.7B-Q4_K_M.gguf");
  const llamaPidFile = path.join(dataDirectory, "fake-llama.pid");
  if (usesFakeLocalAi) {
    await fs.mkdir(path.dirname(modelPath), { recursive: true });
    await fs.writeFile(modelPath, "tauri-smoke-model-placeholder", "utf8");
  }
  const launchEnvironment = {
      ...process.env,
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      LOCALAPPDATA: mentorHumanEntrypoint ? isolatedLocalAppData : process.env.LOCALAPPDATA,
      APPDATA: mentorHumanEntrypoint ? path.join(isolatedLocalAppData, "Roaming") : process.env.APPDATA,
      USERPROFILE: process.env.USERPROFILE,
      PATH: process.env.PATH,
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
      ...(mentorHumanEntrypoint ? {} : {
        HEMATURIA_DESKTOP_DATA_DIR: dataDirectory,
        HEMATURIA_DESKTOP_INSTALLATION_MODE: expectedInstallationMode
      }),
      ...(mentorHumanEntrypoint ? {} : usesFakeLocalAi ? {
        HEMATURIA_DESKTOP_TEST_MODE: "1",
        HEMATURIA_LLAMA_SERVER_PATH: process.execPath,
        HEMATURIA_LLAMA_SERVER_PREFIX_ARGS: JSON.stringify([path.join(repoRoot, "scripts", "desktop-fake-llama-server.mjs")]),
        HEMATURIA_DESKTOP_TEST_LLAMA_PID_FILE: llamaPidFile,
        HEMATURIA_DESKTOP_MODEL_PATH: modelPath
      } : realLocalAi ? {
        HEMATURIA_DESKTOP_MODEL_PATH: modelPath
      } : { HEMATURIA_DESKTOP_DISABLE_LOCAL_AI: "1" }),
      WEBVIEW2_USER_DATA_FOLDER: webViewDirectory,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`
    };
  if (mentorHumanEntrypoint) {
    delete launchEnvironment.HEMATURIA_DESKTOP_MODEL_PATH;
    delete launchEnvironment.HEMATURIA_DESKTOP_MODEL_MODE;
    delete launchEnvironment.HEMATURIA_DESKTOP_TEST_MODE;
    delete launchEnvironment.HEMATURIA_DESKTOP_DISABLE_LOCAL_AI;
  }
  const launcherChild = mentorHumanEntrypoint && !mentorDirectExe ? spawn("cmd.exe", ["/d", "/c", mentorLauncher], {
    cwd: mentorPackageRoot,
    env: launchEnvironment,
    stdio: "ignore",
    windowsHide: false
  }) : null;
  const child = mentorHumanEntrypoint && !mentorDirectExe
    ? processHandle(await eventually(() => {
      const next = processInventory().productPids.find((pid) => !preLaunchInventory.productPids.includes(pid));
      return next || false;
    }, 180_000, "mentor-product-process"))
    : spawn(executable, [], {
    cwd: path.dirname(executable),
    env: launchEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: false
  });
  let diagnostics = "";
  for (const stream of mentorHumanEntrypoint ? [] : [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => {
      diagnostics = `${diagnostics}${chunk.toString("utf8")}`.slice(-32_000);
    });
  }
  try {
    const { browser, page, bootstrap, startup } = await connectToWebView(cdpPort, child, webViewDirectory, preLaunchInventory);
    page.on("dialog", (dialog) => void dialog.accept());
    return { bootstrap, browser, cdpPort, child, diagnostics: () => diagnostics, launcherChild, llamaPidFile, page, preLaunchInventory, startup };
  } catch (error) {
    if (child.exitCode === null) child.kill("SIGKILL");
    await waitForExit(child).catch(() => undefined);
    if (launcherChild?.exitCode === null) launcherChild.kill("SIGKILL");
    throw Object.assign(new Error(sanitize(
      `${error instanceof Error ? error.message : String(error)}\n${diagnostics}`.trim(),
      [dataDirectory, webViewDirectory]
    )), {
      cdpPort,
      preLaunchInventory,
      runtimeEvidence: error?.runtimeEvidence || null
    });
  }
}

async function diagnosticSnapshot(page) {
  return page.evaluate(async () => {
    const bridge = globalThis.__TAURI_INTERNALS__;
    if (!bridge?.invoke) throw new Error("tauri_bridge_unavailable");
    const report = await bridge.invoke("desktop_diagnostic_snapshot");
    return {
      bootstrap: globalThis.__HEMATURIA_DESKTOP_BOOTSTRAP__ || null,
      installationMode: report.installationMode,
      productIdentity: report.productIdentity,
      productHead: report.productHead,
      sidecarPid: Number(report.sidecar?.pid || 0),
      runtimeTarget: report.runtimeTarget,
      startup: report.startup || null
    };
  });
}

async function waitForLlama(page) {
  let lastState = { status: "unavailable", failureCode: null, failureCategory: null, processExists: false };
  try {
    return await eventually(async () => {
      const response = await desktopJson(page, "/api/desktop/diagnostics").catch(() => null);
      const pid = Number(response?.payload?.processes?.llamaServer?.pid || 0);
      lastState = {
        status: response?.payload?.localAi?.status || "unavailable",
        failureCode: response?.payload?.localAi?.failureCode || null,
        failureCategory: response?.payload?.localAi?.failureCategory || null,
        processExists: processExists(pid)
      };
      if (!response?.ok || lastState.status !== "ready" || !lastState.processExists) return false;
      const network = llamaNetworkState(pid);
      return network.exists
        && network.listenerCount === 1
        && network.argumentPort > 0
        && network.ports.includes(network.argumentPort)
        ? { diagnostics: response.payload, pid, port: network.argumentPort }
        : false;
    }, realLocalAi ? 180_000 : 20_000, "local-ai-ready");
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}:${JSON.stringify(lastState)}`);
  }
}

async function waitForDisabledLocalAi(page) {
  const diagnostics = await eventually(async () => {
    const response = await desktopJson(page, "/api/desktop/diagnostics").catch(() => null);
    return response?.ok
      && response.payload?.localAi?.status === "disabled"
      && !response.payload?.processes?.llamaServer?.pid
      ? response.payload
      : false;
  }, 20_000, "local-ai-disabled");
  return { diagnostics, pid: 0, port: 0 };
}

async function verifyMentorAssistanceAvailable(page) {
  const button = page.getByRole("button", { name: /问诊辅助设置|Interview assistance settings/u }).first();
  await button.click();
  const dialog = page.getByRole("dialog", { name: /问诊辅助设置|Interview assistance settings/u });
  await dialog.waitFor({ state: "visible" });
  await eventually(async () => /辅助功能\s*可用|Assistance\s*Available/iu.test(await dialog.innerText()), 20_000, "mentor-assistance-available");
  await dialog.getByRole("button", { name: /^(?:关闭|Close)$/u }).click();
  return true;
}

function assertPatientStudentReply(payload) {
  assert.ok(payload && typeof payload === "object" && !Array.isArray(payload));
  assert.deepEqual(Object.keys(payload).sort(), patientStudentKeys, "normal desktop Patient response must expose only the Student DTO");
  assert.equal(typeof payload.replyText, "string");
  assert.equal(typeof payload.isFallback, "boolean");
  assert.ok(Array.isArray(payload.matchedSlotIds) && payload.matchedSlotIds.every((value) => typeof value === "string"));
  assert.ok(Array.isArray(payload.matchedFacts) && payload.matchedFacts.every((value) => typeof value === "string"));
  assert.ok(publicReplyStates.has(payload.publicReplyState));
}

async function askGovernedQuestion(page, expectedPublicState, requireLocalClassifier = false, question = "") {
  const before = (await desktopJson(page, "/api/desktop/evidence")).payload;
  const composer = page.locator('[data-testid="chat-composer"]');
  const send = composer.locator("button").last();
  await send.waitFor({ state: "visible" });
  await composer.locator("textarea").fill(question || (requireLocalClassifier ? "小便红了有多久？" : "排泄尿液时会产生灼热样感觉吗？"));
  await eventually(() => send.isEnabled(), 20_000, "fallback-send-enabled");
  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST"
      && /^\/api\/agent-chat\/?$/.test(new URL(response.url()).pathname)
  , { timeout: 30_000 });
  await send.click();
  const response = await responsePromise;
  assert.equal(response.status(), 200);
  const payload = await response.json();
  assertPatientStudentReply(payload);
  const after = (await desktopJson(page, "/api/desktop/evidence")).payload;
  const acceptedDelta = after.localAiAcceptedCount - before.localAiAcceptedCount;
  const fallbackDelta = after.ruleFallbackCount - before.ruleFallbackCount;
  assert.equal(acceptedDelta + fallbackDelta, 1);
  assert.equal(after.cloudRequestCount, 0);
  assert.ok(String(after.model || ""), "desktop evidence endpoint must expose the configured model");
  const answerSource = acceptedDelta === 1 ? "local_ai" : "rule_fallback";
  if (answerSource === "local_ai") {
    assert.equal(requireLocalClassifier, true);
    assert.equal(payload.isFallback, false);
    assert.equal(payload.publicReplyState, "answered");
  } else {
    assert.equal(payload.isFallback, true);
    assert.ok(["governed", "safety", "connection_unavailable"].includes(payload.publicReplyState));
    if (expectedPublicState) assert.equal(payload.publicReplyState, expectedPublicState);
  }
  const conversation = page.getByRole("log", { name: "模拟问诊对话" });
  await conversation.locator(".history-message").last().waitFor({ state: "visible" });
  assert.doesNotMatch(await conversation.innerText(), /answerSource|fallbackReason|classificationSource|classifierStatus|publicReplyState|provider|rule_fallback|semantic_response_invalid|local_ai/i);
  return {
    acceptedDelta,
    fallbackDelta,
    localAiAcceptedCount: after.localAiAcceptedCount,
    ruleFallbackCount: after.ruleFallbackCount,
    cloudRequestCount: after.cloudRequestCount,
    answerSource,
    publicReplyState: payload.publicReplyState,
    isFallback: Boolean(payload.isFallback)
  };
}

async function verifyPublicBoundaryAndExport(page, redactions) {
  const score = page.getByTestId("final-percentage-score");
  try {
    await score.waitFor({ state: "visible" });
  } catch {
    const state = await desktopJson(page, "/api/desktop/attempt/state", {
      body: { action: "load", caseId: "P004", mode: "free", language: "zh" }
    });
    const view = await page.evaluate(() => ({
      applicationError: document.body.innerText.startsWith("Application error:"),
      language: localStorage.getItem("hematuria-language"),
      url: location.href
    }));
    throw new Error(`percentage_fixture_not_visible:${JSON.stringify({
      activeStageNo: state.payload?.snapshot?.activeStageNo,
      finalTotal: state.payload?.snapshot?.finalReport?.total,
      applicationError: view.applicationError,
      language: view.language,
      status: state.status,
      url: view.url
    })}`);
  }
  assert.match(await score.innerText(), /^75\s*\/\s*100$/);
  const accessible = await page.evaluate(() => {
    const values = [...document.querySelectorAll("[aria-label],[title],input,textarea,select,button,a,[role]")]
      .flatMap((element) => [
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
        "value" in element ? element.value : null,
        element.textContent
      ])
      .filter(Boolean);
    return `${document.body.innerText}\n${values.join("\n")}`;
  });
  assert.doesNotMatch(accessible, /answerSource|fallbackReason|publicReplyState|requestedSlot|factState|rule_fallback|local_ai|connection_unavailable|\b360\b|360分/i);
  const exported = await page.evaluate(async () => {
    const bridge = globalThis.__TAURI_INTERNALS__;
    if (!bridge?.invoke) throw new Error("tauri_bridge_unavailable");
    return bridge.invoke("desktop_diagnostic_export");
  });
  assert.equal(exported.exported, true);
  const serialized = await fs.readFile(exported.path, "utf8");
  assert.equal(Buffer.byteLength(serialized), exported.size);
  assert.equal(path.dirname(exported.path), path.join(redactions[0], "exports"));
  assert.doesNotMatch(serialized, /answerSource|fallbackReason|publicReplyState|requestedSlot|factState|stateToken|authToken|\b360\b|360分/i);
  for (const value of redactions.filter(Boolean)) assert.equal(serialized.includes(value), false);
  return { accessibleSurfaceScanned: true, exportBytes: exported.size, exported: true, percentageScore: 75 };
}

function databaseSummary(databasePath, expectedProductHead, stageRequestId, stageAttemptId) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const scalar = (sql, ...params) => Number(database.prepare(sql).get(...params)?.count || 0);
    const schemaVersion = Number(database.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").get()?.value);
    const serverStateRevision = Number(database.prepare("SELECT value FROM schema_meta WHERE key = 'server_state_revision'").get()?.value);
    const stateStoreId = String(database.prepare("SELECT value FROM schema_meta WHERE key = 'state_store_id'").get()?.value || "");
    const attemptCount = scalar("SELECT COUNT(*) AS count FROM attempts");
    const snapshotCount = scalar("SELECT COUNT(*) AS count FROM desktop_attempt_snapshots");
    const requestCount = scalar("SELECT COUNT(*) AS count FROM attempt_requests");
    const distinctRequestCount = scalar("SELECT COUNT(DISTINCT request_id) AS count FROM attempt_requests");
    const eventCount = scalar("SELECT COUNT(*) AS count FROM desktop_runtime_events");
    const stageReplayCount = scalar("SELECT COUNT(*) AS count FROM attempt_requests WHERE request_id = ?", stageRequestId);
    const trainingRecordCount = scalar("SELECT COUNT(*) AS count FROM training_records");
    const distinctTrainingAttemptCount = scalar("SELECT COUNT(DISTINCT attempt_id) AS count FROM training_records");
    const scoredRecordCount = scalar("SELECT COUNT(*) AS count FROM training_records WHERE score IS NOT NULL");
    const stageAttemptRecordCount = scalar("SELECT COUNT(*) AS count FROM training_records WHERE attempt_id = ?", stageAttemptId);
    const stageAttemptScoredCount = scalar("SELECT COUNT(*) AS count FROM training_records WHERE attempt_id = ? AND score IS NOT NULL", stageAttemptId);
    assert.equal(schemaVersion, 3);
    assert.match(stateStoreId, /^[0-9a-f-]{36}$/i);
    assert.equal(attemptCount, snapshotCount);
    assert.equal(requestCount, distinctRequestCount);
    assert.equal(stageReplayCount, 1);
    assert.equal(trainingRecordCount, distinctTrainingAttemptCount);
    assert.equal(stageAttemptRecordCount, 1);
    assert.equal(stageAttemptScoredCount, 0);
    assert.equal(expectedProductHead.length, 40);
    return {
      attemptCount,
      eventCount,
      idempotentStageReplay: true,
      noDuplicateRequests: true,
      noDuplicateTrainingRecords: true,
      requestCount,
      schemaVersion,
      scoredRecordCount,
      serverStateRevision,
      snapshotCount,
      stageAttemptNotScored: true,
      stateStoreIdValid: true,
      trainingRecordCount
    };
  } finally {
    database.close();
  }
}

function assertStartupEvidence(startup, bootstrap) {
  for (const key of [
    "setupEntered",
    "dataDirectoryResolved",
    "runtimeLayoutResolved",
    "sidecarSpawned",
    "sidecarReady",
    "runtimeConfigAvailable",
    "initializationScriptBuilt",
    "runtimeInjectionExpected",
    "windowBuildStarted",
    "windowBuilt"
  ]) assert.equal(startup?.[key], true, `desktop_startup_phase_missing:${key}`);
  assert.deepEqual(bootstrap, {
    scriptExecuted: true,
    runtimeExpected: true,
    runtimeDefined: true,
    diagnosticDefined: true,
    schemaVersion: 1
  });
}

async function fileSummary(file) {
  try {
    const stat = await fs.stat(file);
    return { present: stat.isFile(), bytes: stat.size, sha256: stat.isFile() ? await fileSha256(file) : null };
  } catch {
    return { present: false, bytes: 0, sha256: null };
  }
}

async function sidecarLogSummary(dataDirectory) {
  const file = path.join(dataDirectory, "logs", "sidecar-current.log");
  try {
    const bytes = await fs.readFile(file);
    const codes = [...new Set(bytes.toString("utf8").match(/(?:desktop|llama|model|sqlite)_[a-z0-9_]+|SQLITE_[A-Z_]+|EADDRINUSE/giu) || [])].sort();
    return { bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), stableCodes: codes };
  } catch {
    return { bytes: 0, sha256: null, stableCodes: [] };
  }
}

async function archiveRuntimeFailure(error, dataDirectory, webViewDirectory) {
  const installRoot = path.dirname(executable);
  const resourceRoot = path.join(installRoot, "resources");
  const label = surface === "nsis" ? "R5-NSIS-P0-Reproduction" : "R5-Runtime-P0-Reproduction";
  const archive = path.join(evidenceRoot, `${safeTimestamp()}-${label}-${expectedProductHead}`);
  const evidence = {
    schemaVersion: 1,
    status: "runtime_startup_failed",
    productHead: expectedProductHead,
    installationMode: expectedInstallationMode,
    classification: error?.runtimeEvidence?.classification || "UNCLASSIFIED",
    stableFailureCodes: error?.runtimeEvidence?.runtimeFailure?.stableFailureCodes || [],
    lastFailure: error?.runtimeEvidence?.runtimeFailure?.lastFailure || null,
    startup: error?.runtimeEvidence?.runtimeFailure?.startup || null,
    bootstrapPages: error?.runtimeEvidence?.pages || [],
    webViewOrigins: error?.runtimeEvidence?.origins || [],
    cdp: {
      port: Number(error?.runtimeEvidence?.cdpPort || error?.cdpPort || 0),
      connected: Boolean(error?.runtimeEvidence?.cdpConnected),
      pageCount: Number(error?.runtimeEvidence?.pageCount || 0),
      debugState: error?.runtimeEvidence?.debugState || null
    },
    processTree: {
      before: error?.preLaunchInventory || error?.runtimeEvidence?.preLaunchInventory || null,
      after: processInventory()
    },
    oldProductProcessPresent: Boolean((error?.preLaunchInventory?.productPids || []).length),
    oldWebViewProcessPresent: Boolean((error?.preLaunchInventory?.webViewPids || []).length),
    expectedWebViewProfileObserved: Boolean(error?.runtimeEvidence?.expectedProfileObserved),
    nsisSha256: process.env.HEMATURIA_NSIS_ARTIFACT_SHA256 || null,
    installedExecutable: await fileSummary(executable),
    installationStructureHash: await directoryFingerprint(installRoot),
    resources: {
      runtimeManifest: await fileSummary(path.join(resourceRoot, "app", "desktop", "runtime-manifest.json")),
      node: await fileSummary(path.join(resourceRoot, "runtime", "node", "node.exe")),
      sidecar: await fileSummary(path.join(resourceRoot, "app", "desktop", "sidecar", "index.cjs")),
      staticApp: { embeddedInExecutable: true, executableSha256: (await fileSummary(executable)).sha256 }
    },
    sidecarLog: await sidecarLogSummary(dataDirectory),
    sanitizedError: sanitize(error instanceof Error ? error.message : String(error), [dataDirectory, webViewDirectory, installRoot]),
    rawScratchRetained: true,
    evidencePolicy: "sanitized_copy_completed_before_raw_scratch_cleanup"
  };
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  assert.doesNotMatch(serialized, /authToken|bearer|handshake|stateToken|prompt|reasoning|patientQuestions/iu);
  assert.doesNotMatch(serialized, /[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\\/"]+/iu);
  await fs.mkdir(archive, { recursive: false });
  await fs.writeFile(path.join(archive, "diagnostic-evidence.json"), serialized, "utf8");
  await fs.writeFile(path.join(archive, "manifest.sha256"), `${crypto.createHash("sha256").update(serialized).digest("hex")} *diagnostic-evidence.json\n`, "utf8");
  return archive;
}

const configuredRoot = process.env.HEMATURIA_TAURI_SMOKE_ROOT?.trim();
const temporaryRoot = configuredRoot
  ? path.resolve(configuredRoot)
  : await fs.mkdtemp(path.join(os.tmpdir(), "hematuria-tauri-smoke-"));
if (configuredRoot) await fs.mkdir(temporaryRoot, { recursive: true });
const keepSuccessfulRoot = process.env.HEMATURIA_TAURI_SMOKE_KEEP_ROOT === "1";
const freshSettings = process.argv.includes("--fresh-settings");
const isolatedLocalAppData = path.join(temporaryRoot, "localappdata");
const dataDirectory = mentorHumanEntrypoint
  ? path.join(isolatedLocalAppData, "HematuriaTraining", "MentorLocalAI-R5")
  : path.join(temporaryRoot, "data");
const webViewDirectory = path.join(temporaryRoot, "webview");
const r4Directory = path.join(process.env.LOCALAPPDATA || os.tmpdir(), "HematuriaTraining", "MentorLocalAI-FinalCandidate");
const r4Before = await directoryFingerprint(r4Directory);
const p001Marker = `P001 tauri smoke ${Date.now()}`;
const p002Marker = `P002 tauri fallback ${Date.now()}`;
const p003Marker = `P003 tauri random ${Date.now()}`;
let running;
let failure;
let cleanupFailure;
let failureArchive;
let result;

function seedStaleStandardMode() {
  const databasePath = path.join(dataDirectory, "hematuria.sqlite3");
  const previousDataDirectory = process.env.HEMATURIA_DESKTOP_DATA_DIR;
  const previousDatabasePath = process.env.HEMATURIA_DESKTOP_DATABASE_PATH;
  process.env.HEMATURIA_DESKTOP_DATA_DIR = dataDirectory;
  process.env.HEMATURIA_DESKTOP_DATABASE_PATH = databasePath;
  const store = createRequire(import.meta.url)("../server/desktopSqliteStore.js");
  try {
    store.setDesktopSetting("localAi.modelMode", "standard");
    store.setDesktopSetting("localAi.modelPath", path.join(temporaryRoot, "stale-legacy", "Qwen3-4B-Q4_K_M.gguf"));
    store.setDesktopSetting("localAi.modelDirectory", path.join(temporaryRoot, "stale-model-directory"));
  } finally {
    store.closeDesktopSqliteStore();
    if (previousDataDirectory === undefined) delete process.env.HEMATURIA_DESKTOP_DATA_DIR;
    else process.env.HEMATURIA_DESKTOP_DATA_DIR = previousDataDirectory;
    if (previousDatabasePath === undefined) delete process.env.HEMATURIA_DESKTOP_DATABASE_PATH;
    else process.env.HEMATURIA_DESKTOP_DATABASE_PATH = previousDatabasePath;
  }
}

if (startupOnly) {
  try {
    await fs.mkdir(dataDirectory, { recursive: true });
    running = await launch(dataDirectory, webViewDirectory);
    const diagnostic = await diagnosticSnapshot(running.page);
    assertStartupEvidence(diagnostic.startup, diagnostic.bootstrap);
    assert.equal(diagnostic.productHead, expectedProductHead);
    assert.equal(diagnostic.installationMode, expectedInstallationMode);
    const origin = (await runtimeProbe(running.page)).apiBaseUrl;
    const cdpPort = running.cdpPort;
    const sidecarPid = diagnostic.sidecarPid;
    const preLaunchInventory = running.preLaunchInventory;
    await closeNormally(running.child);
    await running.browser.close().catch(() => undefined);
    running = undefined;
    assert.equal(processExists(sidecarPid), false);
    await assertLoopbackClosed(origin);
    await assertWebViewDebugClosed(cdpPort);
    result = {
      status: "passed",
      surface: surfaceLabel,
      startupOnly: true,
      productHead: expectedProductHead,
      artifactSha: await fileSha256(executable),
      startup: diagnostic.startup,
      bootstrap: diagnostic.bootstrap,
      preLaunchInventory,
      cloudRequestCount: 0,
      processCleanup: true
    };
  } catch (error) {
    failure = error;
  } finally {
    if (running) {
      if (running.child.exitCode === null) running.child.kill("SIGKILL");
      await waitForExit(running.child).catch(() => undefined);
      await running.browser.close().catch(() => undefined);
    }
    if (failure && (surface === "nsis" || realLocalAi)) {
      try { failureArchive = await archiveRuntimeFailure(failure, dataDirectory, webViewDirectory); }
      catch (error) { cleanupFailure = error; }
    }
    if (!failure && !keepSuccessfulRoot) {
      try { await fs.rm(temporaryRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); }
      catch (error) { cleanupFailure = error; }
    }
  }
  if (failure) {
    const archive = failureArchive ? `:evidence=${failureArchive}` : "";
    throw new Error(`${sanitize(failure instanceof Error ? failure.message : String(failure), [temporaryRoot])}${archive}`);
  }
  if (cleanupFailure) throw cleanupFailure;
  process.stdout.write(`${JSON.stringify(result)}\n`);
} else {
try {
  await fs.mkdir(dataDirectory, { recursive: true });
  if (mentorHumanEntrypoint && !freshSettings) seedStaleStandardMode();
  const firstCycleStarted = performance.now();
  running = await launch(dataDirectory, webViewDirectory);
  const firstRuntimeReadyMs = Math.round(performance.now() - firstCycleStarted);
  const firstProbe = await runtimeProbe(running.page);
  assert.equal(firstProbe.runtimeTarget, "desktop");
  assert.match(firstProbe.apiBaseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(firstProbe.tokenValid, true);
  const firstLlama = localAiEnabled ? await waitForLlama(running.page) : await waitForDisabledLocalAi(running.page);
  const firstSettings = mentorHumanEntrypoint ? (await desktopJson(running.page, "/api/desktop/settings")).payload : null;
  const assistanceAvailable = mentorHumanEntrypoint ? await verifyMentorAssistanceAvailable(running.page) : null;
  if (mentorHumanEntrypoint) {
    assert.equal(firstSettings.modelPresent, true);
    assert.equal(firstSettings.modelValidation, "verified");
    assert.equal(firstSettings.llamaStatus, "ready");
    assert.equal(firstSettings.effectiveModel, "Qwen3-1.7B");
    assert.equal(firstLlama.diagnostics.localAi.configuredMode, freshSettings ? null : "standard");
    assert.equal(firstLlama.diagnostics.localAi.effectiveMode, "lightweight");
    assert.equal(firstLlama.diagnostics.localAi.effectiveModel, "Qwen3-1.7B");
    assert.equal(firstLlama.diagnostics.localAi.overrideSource, mentorDirectExe
      ? freshSettings ? "runtime_default" : "packaged_model_fallback"
      : "mentor_package");
  }
  const firstModelReadyMs = Math.round(performance.now() - firstCycleStarted);
  const initialAuthority = (await desktopJson(running.page, "/api/desktop/state/bootstrap")).payload;
  assert.equal(initialAuthority.schemaVersion, 3);
  assert.equal(initialAuthority.productHead, expectedProductHead);
  assert.notEqual(initialAuthority.productHead, "desktop-local");
  await saveHistoryDraft(running.page, {
    caseId: "P002",
    language: "zh",
    marker: p002Marker
  });
  const answerStarted = performance.now();
  const mentorQuestions = mentorHumanEntrypoint ? [
    "您这次主要为什么来看病？",
    "尿是肉眼能看到红，还是体检尿检发现？",
    "什么时候开始出现血尿或排尿症状？",
    "血尿是持续还是间断？",
    "刚开始红、快尿完红，还是从头到尾都红？",
    "尿是什么颜色？",
    "有没有血块？是什么形状？",
    "小便时痛不痛？",
    "有没有尿频尿急？",
    "有没有发热或寒战？"
  ] : [];
  const mentorAnswers = [];
  for (const [index, question] of mentorQuestions.entries()) {
    mentorAnswers.push(await step(`mentor-question-${index + 1}`, askGovernedQuestion(running.page, undefined, true, question)));
  }
  const fallback = mentorHumanEntrypoint
    ? mentorAnswers[0]
    : await askGovernedQuestion(running.page, usesFakeLocalAi ? "governed" : undefined, realLocalAi);
  const mentorLocalAcceptedCount = mentorAnswers.reduce((total, answer) => total + answer.acceptedDelta, 0);
  if (mentorHumanEntrypoint) {
    assert.equal(mentorAnswers.length, 10, "mentor_ten_patient_turns_required");
    assert.ok(mentorLocalAcceptedCount > mentorAnswers.length - mentorLocalAcceptedCount, `mentor_local_ai_must_be_the_majority:${JSON.stringify(mentorAnswers.map(({ answerSource, publicReplyState, acceptedDelta, fallbackDelta }) => ({ answerSource, publicReplyState, acceptedDelta, fallbackDelta })))}`);
    assert.ok(mentorAnswers.every((answer) => answer.acceptedDelta + answer.fallbackDelta === 1), "mentor_each_turn_must_have_one_runtime_outcome");
    assert.ok(mentorAnswers.every((answer, index) => index === 0 || answer.localAiAcceptedCount >= mentorAnswers[index - 1].localAiAcceptedCount), "mentor_local_ai_count_regressed");
  }
  const mentorRuntimeEvidence = mentorHumanEntrypoint ? (await desktopJson(running.page, "/api/desktop/evidence")).payload : null;
  if (mentorHumanEntrypoint) {
    assert.equal(mentorRuntimeEvidence.llamaServerReady, true);
    assert.equal(mentorRuntimeEvidence.localModelReady, true);
    assert.equal(mentorRuntimeEvidence.effectiveModel, "Qwen3-1.7B");
    assert.equal(mentorRuntimeEvidence.localAiAcceptedCount, mentorLocalAcceptedCount);
    assert.equal(mentorRuntimeEvidence.ruleFallbackCount, mentorAnswers.length - mentorLocalAcceptedCount);
    assert.equal(mentorRuntimeEvidence.cloudRequestCount, 0);
  }
  const firstAnswerMs = Math.round(performance.now() - answerStarted);
  await saveHistoryDraft(running.page, {
    caseId: "P001",
    language: "zh",
    marker: p001Marker
  });
  const stageResponsePromise = running.page.waitForResponse((response) => {
    if (response.request().method() !== "POST" || !/^\/api\/training-action\/?$/.test(new URL(response.url()).pathname)) return false;
    try {
      const body = response.request().postDataJSON();
      return body?.action === "stage-feedback" && body?.stageKey === "history";
    } catch {
      return false;
    }
  }, { timeout: 30_000 });
  await submitHistoryAndEnterStageTwo(running.page, { caseId: "P001", language: "zh", marker: p001Marker });
  const stageResponse = await stageResponsePromise;
  const stageReplay = {
    body: stageResponse.request().postDataJSON(),
    idempotencyKey: stageResponse.request().headers()["x-idempotency-key"],
    stateToken: stageResponse.request().headers()["x-training-state"],
    responseStateToken: stageResponse.headers()["x-training-state"]
  };
  assert.equal(stageReplay.idempotencyKey, stageReplay.body.requestId);
  assert.ok(stageReplay.stateToken && stageReplay.responseStateToken);
  const firstAuthority = (await desktopJson(running.page, "/api/desktop/state/bootstrap")).payload;
  assert.ok(firstAuthority.serverStateRevision > initialAuthority.serverStateRevision);
  const firstDiagnostic = await diagnosticSnapshot(running.page);
  const firstMemory = {
    tauri: peakWorkingSetBytes(running.child.pid),
    sidecar: peakWorkingSetBytes(firstDiagnostic.sidecarPid),
    llama: peakWorkingSetBytes(firstLlama.pid)
  };
  assertStartupEvidence(firstDiagnostic.startup, firstDiagnostic.bootstrap);
  assert.equal(firstDiagnostic.productIdentity, "hematuria-training-r5");
  assert.equal(firstDiagnostic.installationMode, expectedInstallationMode);
  assert.equal(firstDiagnostic.productHead, expectedProductHead);
  assert.equal(firstDiagnostic.runtimeTarget, "desktop");
  assert.equal(firstLlama.diagnostics.productHead, expectedProductHead);
  assert.deepEqual(await runtimeEvidence(running.page), {
    cloudRequestCount: 0,
    productHead: expectedProductHead,
    runtimeTarget: "desktop"
  });
  assert.equal(processExists(firstDiagnostic.sidecarPid), true);
  const stageTwo = await orderReportsAndEnterStageThree(running.page, { mentorFinal: mentorHumanEntrypoint });
  await running.page.waitForLoadState("networkidle");
  const closingAuthority = (await desktopJson(running.page, "/api/desktop/state/bootstrap")).payload;
  assert.ok(closingAuthority.serverStateRevision >= firstAuthority.serverStateRevision);
  const firstOrigin = firstProbe.apiBaseUrl;
  const firstCdpPort = running.cdpPort;
  await closeNormally(running.child);
  await running.browser.close().catch(() => undefined);
  running = undefined;
  assert.equal(processExists(firstDiagnostic.sidecarPid), false);
  await assertLoopbackClosed(firstOrigin);
  if (firstLlama.pid) await assertLlamaClosed(firstLlama.pid, firstLlama.port);
  const firstWebViewCleanupMs = await assertWebViewDebugClosed(firstCdpPort);

  const secondCycleStarted = performance.now();
  running = await launch(dataDirectory, webViewDirectory);
  const secondRuntimeReadyMs = Math.round(performance.now() - secondCycleStarted);
  const secondLlama = localAiEnabled ? await waitForLlama(running.page) : await waitForDisabledLocalAi(running.page);
  const secondModelReadyMs = Math.round(performance.now() - secondCycleStarted);
  if (localAiEnabled) assert.notEqual(secondLlama.pid, firstLlama.pid);
  const restartedAuthority = (await desktopJson(running.page, "/api/desktop/state/bootstrap")).payload;
  assert.equal(restartedAuthority.stateStoreId, initialAuthority.stateStoreId);
  assert.equal(restartedAuthority.productHead, expectedProductHead);
  assert.equal(restartedAuthority.serverStateRevision, closingAuthority.serverStateRevision);
  await expectSubmittedStageThree(running.page, { marker: p001Marker, expectedReports: stageTwo.reports });
  await running.page.waitForLoadState("networkidle");
  const restoredAuthority = (await desktopJson(running.page, "/api/desktop/state/bootstrap")).payload;
  assert.ok(restoredAuthority.serverStateRevision >= restartedAuthority.serverStateRevision);
  const replayed = await desktopJson(running.page, "/api/training-action", stageReplay);
  assert.equal(replayed.status, 200);
  assert.equal(replayed.stateToken, stageReplay.responseStateToken);
  const postReplayAuthority = (await desktopJson(running.page, "/api/desktop/state/bootstrap")).payload;
  assert.equal(postReplayAuthority.serverStateRevision, restoredAuthority.serverStateRevision);
  const random = await step("p003-random-save", saveHistoryDraft(running.page, {
    caseId: "P003",
    language: "en",
    marker: p003Marker,
    requestedMode: "random"
  }));
  assert.equal(random.durableMode, "free");
  await expectSubmittedStageThree(running.page, { marker: p001Marker, expectedReports: stageTwo.reports });
  const canonicalState = (await desktopJson(running.page, "/api/desktop/attempt/state", {
    body: { action: "load", caseId: "P001", mode: "free", language: "zh" }
  })).payload.snapshot;
  await seedCompletedPercentageFixture(running.page);
  await running.page.goto(new URL("/cases/P004/", running.page.url()).toString());
  const publicBoundary = await verifyPublicBoundaryAndExport(running.page, [
    dataDirectory,
    temporaryRoot,
    p001Marker,
    p002Marker,
    p003Marker,
    process.env.USERPROFILE
  ]);
  const finalAuthority = (await desktopJson(running.page, "/api/desktop/state/bootstrap")).payload;
  assert.equal(finalAuthority.stateStoreId, initialAuthority.stateStoreId);
  assert.equal(finalAuthority.schemaVersion, 3);
  assert.equal(finalAuthority.productHead, expectedProductHead);
  assert.ok(finalAuthority.serverStateRevision > postReplayAuthority.serverStateRevision);
  const finalDiagnostic = await diagnosticSnapshot(running.page);
  const secondMemory = {
    tauri: peakWorkingSetBytes(running.child.pid),
    sidecar: peakWorkingSetBytes(finalDiagnostic.sidecarPid),
    llama: peakWorkingSetBytes(secondLlama.pid)
  };
  assertStartupEvidence(finalDiagnostic.startup, finalDiagnostic.bootstrap);
  assert.equal(finalDiagnostic.productIdentity, "hematuria-training-r5");
  assert.equal(finalDiagnostic.installationMode, expectedInstallationMode);
  assert.equal(finalDiagnostic.productHead, expectedProductHead);
  assert.equal(secondLlama.diagnostics.productHead, expectedProductHead);
  assert.deepEqual(await runtimeEvidence(running.page), {
    cloudRequestCount: 0,
    productHead: expectedProductHead,
    runtimeTarget: "desktop"
  });
  const finalOrigin = (await runtimeProbe(running.page)).apiBaseUrl;
  const finalCdpPort = running.cdpPort;
  await closeNormally(running.child);
  await running.browser.close().catch(() => undefined);
  running = undefined;
  assert.equal(processExists(finalDiagnostic.sidecarPid), false);
  await assertLoopbackClosed(finalOrigin);
  if (secondLlama.pid) await assertLlamaClosed(secondLlama.pid, secondLlama.port);
  const secondWebViewCleanupMs = await assertWebViewDebugClosed(finalCdpPort);
  const database = databaseSummary(
    path.join(dataDirectory, "hematuria.sqlite3"),
    expectedProductHead,
    stageReplay.idempotencyKey,
    stageReplay.body.attemptId
  );
  assert.equal(database.attemptCount, 4);
  assert.equal(database.eventCount, mentorHumanEntrypoint ? mentorAnswers.length : 1);
  assert.equal(database.serverStateRevision, finalAuthority.serverStateRevision);
  const checkpoint = {
    surface: surfaceLabel,
    productHead: expectedProductHead,
    artifactSha: await fileSha256(executable),
    installationMode: firstDiagnostic.installationMode,
    case: "P001",
    language: "zh",
    trainingMode: "random",
    durableMode: "free",
    activeStage: canonicalState.activeStageNo,
    submittedStageCount: Object.keys(canonicalState.submitted || {}).length,
    ...databaseCheckpoint(path.join(dataDirectory, "hematuria.sqlite3")),
    idempotentReplay: database.idempotentStageReplay,
    cloudRequestCount: 0,
    localAcceptedCount: fallback.acceptedDelta,
    fallbackCount: fallback.fallbackDelta,
    percentageOnlyBoundary: publicBoundary.percentageScore === 75,
    diagnosticExport: publicBoundary.exported,
    processCleanup: true,
    startup: finalDiagnostic.startup,
    bootstrap: finalDiagnostic.bootstrap,
    preLaunchClean: true,
    r4DataUnchanged: false
  };
  result = {
    surface: surfaceLabel,
    status: "passed",
    productHead: expectedProductHead,
    authorityAgreement: true,
    revisionSequence: [
      initialAuthority.serverStateRevision,
      firstAuthority.serverStateRevision,
      closingAuthority.serverStateRevision,
      restartedAuthority.serverStateRevision,
      restoredAuthority.serverStateRevision,
      postReplayAuthority.serverStateRevision,
      finalAuthority.serverStateRevision
    ],
    database,
    fallback,
    stageTwo,
    publicBoundary,
    randomDurableMode: "free",
    cloudRequestCount: 0,
    lifecycleCycles: 2,
    processCleanup: true,
    realLocalAi,
    mentorHumanEntrypoint,
    mentorEntryMode: mentorDirectExe ? "direct_app_exe" : "root_launcher",
    mentorLocalAcceptedCount,
    mentorRuleFallbackCount: mentorRuntimeEvidence?.ruleFallbackCount ?? null,
    mentorAcceptedSequence: mentorAnswers.map((answer) => answer.localAiAcceptedCount),
    assistanceAvailable,
    localAiRuntime: mentorHumanEntrypoint ? {
      modelPresent: firstSettings.modelPresent,
      modelValidation: firstSettings.modelValidation,
      llamaServerReady: mentorRuntimeEvidence.llamaServerReady,
      localModelReady: mentorRuntimeEvidence.localModelReady,
      effectiveModel: mentorRuntimeEvidence.effectiveModel,
      cloudRequestCount: mentorRuntimeEvidence.cloudRequestCount,
      settingsProfile: freshSettings ? "fresh" : "stale"
    } : null,
    performance: {
      firstRuntimeReadyMs,
      firstModelReadyMs,
      firstAnswerMs,
      secondRuntimeReadyMs,
      secondModelReadyMs,
      webViewCleanupMs: Math.max(firstWebViewCleanupMs, secondWebViewCleanupMs),
      peakWorkingSetBytes: {
        tauri: Math.max(firstMemory.tauri, secondMemory.tauri),
        sidecar: Math.max(firstMemory.sidecar, secondMemory.sidecar),
        llama: Math.max(firstMemory.llama, secondMemory.llama)
      },
      sqliteBytes: (await fs.stat(path.join(dataDirectory, "hematuria.sqlite3"))).size,
      logBytes: await directoryBytes(path.join(dataDirectory, "logs"))
    },
    checkpoint
  };
} catch (error) {
  failure = error;
} finally {
  if (running) {
    if (running.child.exitCode === null) running.child.kill("SIGKILL");
    await waitForExit(running.child).catch(() => undefined);
    await running.browser.close().catch(() => undefined);
  }
  if (failure && (surface === "nsis" || realLocalAi)) {
    try {
      failureArchive = await archiveRuntimeFailure(failure, dataDirectory, webViewDirectory);
    } catch (error) {
      cleanupFailure = error;
    }
  }
  try {
    if (!failure && !keepSuccessfulRoot) await fs.rm(temporaryRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  } catch (error) {
    cleanupFailure = error;
  }
  if (result?.checkpoint) result.checkpoint.r4DataUnchanged = r4Before === await directoryFingerprint(r4Directory);
}

if (failure) {
  const archive = failureArchive ? `:evidence=${failureArchive}` : "";
  throw new Error(`${sanitize(failure instanceof Error ? failure.message : String(failure), [temporaryRoot])}${archive}`);
}
if (cleanupFailure) throw new Error("desktop_tauri_temp_cleanup_failed");
await writeSurfaceCheckpoint(result.checkpoint);
process.stdout.write(`${JSON.stringify(result)}\n`);
}
