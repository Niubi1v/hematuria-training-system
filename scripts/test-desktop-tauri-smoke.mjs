import assert from "node:assert/strict";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";
import {
  assertLoopbackClosed,
  expectSubmittedStageTwo,
  repoRoot,
  runtimeProbe,
  runtimeEvidence,
  saveHistoryDraft,
  submitHistoryAndEnterStageTwo
} from "../tests/desktop/desktop-harness.mjs";

if (process.platform !== "win32") throw new Error("desktop_tauri_smoke_requires_windows");
const noProxy = [process.env.NO_PROXY, process.env.no_proxy, "127.0.0.1", "localhost", "::1"]
  .filter(Boolean)
  .join(",");
process.env.NO_PROXY = noProxy;
process.env.no_proxy = noProxy;
const surfaceIndex = process.argv.indexOf("--surface");
const surface = surfaceIndex >= 0 ? String(process.argv[surfaceIndex + 1] || "") : "no-bundle";
if (surface !== "no-bundle") throw new Error(`desktop_tauri_surface_not_implemented:${surface}`);
const executable = path.resolve(process.env.HEMATURIA_DESKTOP_TAURI_EXECUTABLE
  || path.join(repoRoot, "src-tauri", "target", "release", "hematuria-desktop.exe"));
try {
  await fs.access(executable);
} catch {
  throw new Error("desktop_tauri_executable_missing");
}
const expectedProductHead = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repoRoot,
  encoding: "utf8",
  windowsHide: true
}).trim();

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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

function waitForExit(child, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null) return resolve(child.exitCode);
    const timeout = setTimeout(() => reject(new Error("desktop_tauri_exit_timeout")), timeoutMs);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
}

function webViewDebugState(port) {
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `$processCount=@(Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | Where-Object { $_.CommandLine -like '*--remote-debugging-port=${port}*' }).Count; $listeners=@(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue); @{processCount=$processCount;listenerCount=$listeners.Count;addresses=@($listeners | ForEach-Object LocalAddress | Sort-Object -Unique)} | ConvertTo-Json -Compress`
  ], { encoding: "utf8", windowsHide: true });
  try {
    const value = JSON.parse(String(result.stdout || ""));
    return {
      processCount: Number(value.processCount || 0),
      listenerCount: Number(value.listenerCount || 0),
      addresses: Array.isArray(value.addresses) ? value.addresses : value.addresses ? [value.addresses] : []
    };
  } catch {
    return { processCount: -1, listenerCount: -1, addresses: [] };
  }
}

async function connectToWebView(port, child) {
  const endpoints = [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`
  ];
  const deadline = Date.now() + 30_000;
  let browser;
  let cdpConnected = false;
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
      for (const context of browser.contexts()) {
        for (const page of context.pages()) {
          try { observedOrigins.add(new URL(page.url()).origin); } catch { observedOrigins.add("unparseable"); }
          const injected = await page.evaluate(() =>
            globalThis.__HEMATURIA_DESKTOP_RUNTIME__?.runtimeTarget === "desktop"
          ).catch(() => false);
          if (injected) return { browser, page };
        }
      }
    } catch {
      if (browser && !browser.isConnected()) browser = undefined;
    }
    await delay(100);
  }
  await browser?.close().catch(() => undefined);
  const origins = [...observedOrigins].sort().join(",") || "none";
  const debugState = webViewDebugState(port);
  const http = [];
  for (const [index, endpoint] of endpoints.entries()) {
    try {
      const response = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1_000) });
      http.push(`${index}:${response.status}`);
    } catch {
      http.push(`${index}:error`);
    }
  }
  throw new Error(`desktop_tauri_runtime_injection_unavailable:${cdpConnected ? "runtime_missing" : "cdp_unreachable"}:origins=${origins}:debugProcesses=${debugState.processCount}:listeners=${debugState.listenerCount}:addresses=${debugState.addresses.join(",") || "none"}:http=${http.join(",")}`);
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
  const child = spawn(executable, [], {
    cwd: path.dirname(executable),
    env: {
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      LOCALAPPDATA: process.env.LOCALAPPDATA,
      APPDATA: process.env.APPDATA,
      USERPROFILE: process.env.USERPROFILE,
      PATH: process.env.PATH,
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
      HEMATURIA_DESKTOP_DATA_DIR: dataDirectory,
      HEMATURIA_DESKTOP_DISABLE_LOCAL_AI: "1",
      HEMATURIA_DESKTOP_INSTALLATION_MODE: "development",
      WEBVIEW2_USER_DATA_FOLDER: webViewDirectory,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let diagnostics = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => {
      diagnostics = `${diagnostics}${chunk.toString("utf8")}`.slice(-32_000);
    });
  }
  try {
    const { browser, page } = await connectToWebView(cdpPort, child);
    page.on("dialog", (dialog) => void dialog.accept());
    return { browser, child, diagnostics: () => diagnostics, page };
  } catch (error) {
    if (child.exitCode === null) child.kill("SIGKILL");
    await waitForExit(child).catch(() => undefined);
    throw new Error(sanitize(
      `${error instanceof Error ? error.message : String(error)}\n${diagnostics}`.trim(),
      [dataDirectory, webViewDirectory]
    ));
  }
}

async function diagnosticSnapshot(page) {
  return page.evaluate(async () => {
    const bridge = globalThis.__TAURI_INTERNALS__;
    if (!bridge?.invoke) throw new Error("tauri_bridge_unavailable");
    const report = await bridge.invoke("desktop_diagnostic_snapshot");
    return {
      productHead: report.productHead,
      sidecarPid: Number(report.sidecar?.pid || 0),
      runtimeTarget: report.runtimeTarget
    };
  });
}

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hematuria-tauri-smoke-"));
const dataDirectory = path.join(temporaryRoot, "data");
const webViewDirectory = path.join(temporaryRoot, "webview");
const p001Marker = `P001 tauri smoke ${Date.now()}`;
const p003Marker = `P003 tauri random ${Date.now()}`;
let running;
let failure;
let cleanupFailure;
let result;

try {
  await fs.mkdir(dataDirectory, { recursive: true });
  running = await launch(dataDirectory, webViewDirectory);
  const firstProbe = await runtimeProbe(running.page);
  assert.equal(firstProbe.runtimeTarget, "desktop");
  assert.match(firstProbe.apiBaseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(firstProbe.tokenValid, true);
  await saveHistoryDraft(running.page, {
    caseId: "P001",
    language: "zh",
    marker: p001Marker
  });
  await submitHistoryAndEnterStageTwo(running.page, { caseId: "P001", language: "zh", marker: p001Marker });
  const firstDiagnostic = await diagnosticSnapshot(running.page);
  assert.equal(firstDiagnostic.productHead, expectedProductHead);
  assert.equal(firstDiagnostic.runtimeTarget, "desktop");
  assert.deepEqual(await runtimeEvidence(running.page), {
    cloudRequestCount: 0,
    productHead: expectedProductHead,
    runtimeTarget: "desktop"
  });
  assert.equal(processExists(firstDiagnostic.sidecarPid), true);
  const firstOrigin = firstProbe.apiBaseUrl;
  await closeNormally(running.child);
  await running.browser.close().catch(() => undefined);
  running = undefined;
  assert.equal(processExists(firstDiagnostic.sidecarPid), false);
  await assertLoopbackClosed(firstOrigin);

  running = await launch(dataDirectory, webViewDirectory);
  await expectSubmittedStageTwo(running.page, {
    caseId: "P001",
    language: "zh",
    marker: p001Marker
  });
  const random = await saveHistoryDraft(running.page, {
    caseId: "P003",
    language: "en",
    marker: p003Marker,
    requestedMode: "random"
  });
  assert.equal(random.durableMode, "free");
  await expectSubmittedStageTwo(running.page, {
    caseId: "P001",
    language: "zh",
    marker: p001Marker
  });
  const finalDiagnostic = await diagnosticSnapshot(running.page);
  assert.equal(finalDiagnostic.productHead, expectedProductHead);
  assert.deepEqual(await runtimeEvidence(running.page), {
    cloudRequestCount: 0,
    productHead: expectedProductHead,
    runtimeTarget: "desktop"
  });
  const finalOrigin = (await runtimeProbe(running.page)).apiBaseUrl;
  await closeNormally(running.child);
  await running.browser.close().catch(() => undefined);
  running = undefined;
  assert.equal(processExists(finalDiagnostic.sidecarPid), false);
  await assertLoopbackClosed(finalOrigin);
  result = { surface, status: "passed", randomDurableMode: "free", cloudRequestCount: 0, processCleanup: true };
} catch (error) {
  failure = error;
} finally {
  if (running) {
    if (running.child.exitCode === null) running.child.kill("SIGKILL");
    await waitForExit(running.child).catch(() => undefined);
    await running.browser.close().catch(() => undefined);
  }
  try {
    await fs.rm(temporaryRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  } catch (error) {
    cleanupFailure = error;
  }
}

if (failure) {
  throw new Error(sanitize(failure instanceof Error ? failure.message : String(failure), [temporaryRoot]));
}
if (cleanupFailure) throw new Error("desktop_tauri_temp_cleanup_failed");
process.stdout.write(`${JSON.stringify(result)}\n`);
