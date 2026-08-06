import assert from "node:assert/strict";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "@playwright/test";
import {
  assertLoopbackClosed,
  desktopJson,
  expectSubmittedStageTwo,
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
const surfaceLabel = process.env.HEMATURIA_SURFACE_LABEL || surface;
if (!/^[a-z0-9-]{1,40}$/u.test(surfaceLabel)) throw new Error("desktop_tauri_surface_label_invalid");
const expectedInstallationMode = surface === "portable" ? "portable" : surface === "nsis" ? "installer" : "development";
const usesFakeLocalAi = expectedInstallationMode === "development";
const executable = path.resolve(process.env.HEMATURIA_DESKTOP_TAURI_EXECUTABLE
  || path.join(repoRoot, "src-tauri", "target", "release", "hematuria-training-r5.exe"));
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

async function assertWebViewDebugClosed(port) {
  await eventually(() => {
    const state = webViewDebugState(port);
    return state.processCount === 0 && state.listenerCount === 0;
  }, 20_000, "webview-debug-close");
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
  let runtimeFailure = null;
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
          runtimeFailure = await page.evaluate(async () => {
            try {
              const report = await globalThis.__TAURI_INTERNALS__?.invoke?.("desktop_diagnostic_snapshot");
              return report ? {
                productHead: report.productHead,
                stableFailureCodes: report.stableFailureCodes,
                lastFailure: report.lastFailure ? {
                  category: report.lastFailure.category,
                  code: report.lastFailure.code
                } : null
              } : null;
            } catch { return null; }
          }).catch(() => null);
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
  throw new Error(`desktop_tauri_runtime_injection_unavailable:${cdpConnected ? "runtime_missing" : "cdp_unreachable"}:origins=${origins}:debugProcesses=${debugState.processCount}:listeners=${debugState.listenerCount}:addresses=${debugState.addresses.join(",") || "none"}:http=${http.join(",")}:runtimeFailure=${JSON.stringify(runtimeFailure)}`);
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
  const modelPath = path.join(dataDirectory, "models", "Qwen3-1.7B-Q4_K_M.gguf");
  const llamaPidFile = path.join(dataDirectory, "fake-llama.pid");
  if (usesFakeLocalAi) {
    await fs.mkdir(path.dirname(modelPath), { recursive: true });
    await fs.writeFile(modelPath, "tauri-smoke-model-placeholder", "utf8");
  }
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
      HEMATURIA_DESKTOP_INSTALLATION_MODE: expectedInstallationMode,
      ...(usesFakeLocalAi ? {
        HEMATURIA_DESKTOP_TEST_MODE: "1",
        HEMATURIA_LLAMA_SERVER_PATH: process.execPath,
        HEMATURIA_LLAMA_SERVER_PREFIX_ARGS: JSON.stringify([path.join(repoRoot, "scripts", "desktop-fake-llama-server.mjs")]),
        HEMATURIA_DESKTOP_TEST_LLAMA_PID_FILE: llamaPidFile,
        HEMATURIA_DESKTOP_MODEL_PATH: modelPath
      } : { HEMATURIA_DESKTOP_DISABLE_LOCAL_AI: "1" }),
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
    return { browser, cdpPort, child, diagnostics: () => diagnostics, llamaPidFile, page };
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
      installationMode: report.installationMode,
      productIdentity: report.productIdentity,
      productHead: report.productHead,
      sidecarPid: Number(report.sidecar?.pid || 0),
      runtimeTarget: report.runtimeTarget
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
    }, 20_000, "local-ai-ready");
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

async function askSafetyFallback(page, expectedReason) {
  const before = (await desktopJson(page, "/api/desktop/evidence")).payload;
  const composer = page.locator('[data-testid="chat-composer"]');
  const send = composer.locator("button").last();
  await send.waitFor({ state: "visible" });
  await composer.locator("textarea").fill("排泄尿液时会产生灼热样感觉吗？");
  await eventually(() => send.isEnabled(), 20_000, "fallback-send-enabled");
  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST"
      && /^\/api\/agent-chat\/?$/.test(new URL(response.url()).pathname)
  , { timeout: 30_000 });
  await send.click();
  const response = await responsePromise;
  assert.equal(response.status(), 200);
  const payload = await response.json();
  assert.equal(payload.isFallback, true);
  if (expectedReason) assert.equal(payload.fallbackReason, expectedReason);
  else assert.ok(payload.fallbackReason, "packaged fallback must expose a stable reason to the renderer");
  const after = (await desktopJson(page, "/api/desktop/evidence")).payload;
  assert.equal(after.localAiAcceptedCount, before.localAiAcceptedCount);
  assert.equal(after.ruleFallbackCount, before.ruleFallbackCount + 1);
  assert.equal(after.cloudRequestCount, 0);
  const conversation = page.getByRole("log", { name: "模拟问诊对话" });
  await conversation.locator(".history-message").last().waitFor({ state: "visible" });
  assert.doesNotMatch(await conversation.innerText(), /answerSource|fallbackReason|rule_fallback|semantic_response_invalid|local_ai/i);
  return {
    acceptedDelta: after.localAiAcceptedCount - before.localAiAcceptedCount,
    fallbackDelta: after.ruleFallbackCount - before.ruleFallbackCount,
    cloudRequestCount: after.cloudRequestCount
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
  assert.doesNotMatch(accessible, /answerSource|fallbackReason|requestedSlot|factState|rule_fallback|local_ai|\b360\b|360分/i);
  const exported = await page.evaluate(async () => {
    const bridge = globalThis.__TAURI_INTERNALS__;
    if (!bridge?.invoke) throw new Error("tauri_bridge_unavailable");
    return bridge.invoke("desktop_diagnostic_export");
  });
  assert.equal(exported.exported, true);
  const serialized = await fs.readFile(exported.path, "utf8");
  assert.equal(Buffer.byteLength(serialized), exported.size);
  assert.equal(path.dirname(exported.path), path.join(redactions[0], "exports"));
  assert.doesNotMatch(serialized, /answerSource|fallbackReason|requestedSlot|factState|stateToken|authToken|\b360\b|360分/i);
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

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hematuria-tauri-smoke-"));
const dataDirectory = path.join(temporaryRoot, "data");
const webViewDirectory = path.join(temporaryRoot, "webview");
const r4Directory = path.join(process.env.LOCALAPPDATA || os.tmpdir(), "HematuriaTraining", "MentorLocalAI-FinalCandidate");
const r4Before = await directoryFingerprint(r4Directory);
const p001Marker = `P001 tauri smoke ${Date.now()}`;
const p002Marker = `P002 tauri fallback ${Date.now()}`;
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
  const firstLlama = usesFakeLocalAi ? await waitForLlama(running.page) : await waitForDisabledLocalAi(running.page);
  const initialAuthority = (await desktopJson(running.page, "/api/desktop/state/bootstrap")).payload;
  assert.equal(initialAuthority.schemaVersion, 3);
  assert.equal(initialAuthority.productHead, expectedProductHead);
  assert.notEqual(initialAuthority.productHead, "desktop-local");
  await saveHistoryDraft(running.page, {
    caseId: "P002",
    language: "zh",
    marker: p002Marker
  });
  const fallback = await askSafetyFallback(running.page, usesFakeLocalAi ? "semantic_response_invalid" : undefined);
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
  await assertWebViewDebugClosed(firstCdpPort);

  running = await launch(dataDirectory, webViewDirectory);
  const secondLlama = usesFakeLocalAi ? await waitForLlama(running.page) : await waitForDisabledLocalAi(running.page);
  if (usesFakeLocalAi) assert.notEqual(secondLlama.pid, firstLlama.pid);
  const restartedAuthority = (await desktopJson(running.page, "/api/desktop/state/bootstrap")).payload;
  assert.equal(restartedAuthority.stateStoreId, initialAuthority.stateStoreId);
  assert.equal(restartedAuthority.productHead, expectedProductHead);
  assert.equal(restartedAuthority.serverStateRevision, closingAuthority.serverStateRevision);
  await expectSubmittedStageTwo(running.page, {
    caseId: "P001",
    language: "zh",
    marker: p001Marker
  });
  await running.page.waitForLoadState("networkidle");
  const restoredAuthority = (await desktopJson(running.page, "/api/desktop/state/bootstrap")).payload;
  assert.ok(restoredAuthority.serverStateRevision >= restartedAuthority.serverStateRevision);
  const replayed = await desktopJson(running.page, "/api/training-action", stageReplay);
  assert.equal(replayed.status, 200);
  assert.equal(replayed.stateToken, stageReplay.responseStateToken);
  const postReplayAuthority = (await desktopJson(running.page, "/api/desktop/state/bootstrap")).payload;
  assert.equal(postReplayAuthority.serverStateRevision, restoredAuthority.serverStateRevision);
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
  await assertWebViewDebugClosed(finalCdpPort);
  const database = databaseSummary(
    path.join(dataDirectory, "hematuria.sqlite3"),
    expectedProductHead,
    stageReplay.idempotencyKey,
    stageReplay.body.attemptId
  );
  assert.equal(database.attemptCount, 4);
  assert.equal(database.eventCount, 1);
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
    publicBoundary,
    randomDurableMode: "free",
    cloudRequestCount: 0,
    lifecycleCycles: 2,
    processCleanup: true,
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
  try {
    await fs.rm(temporaryRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  } catch (error) {
    cleanupFailure = error;
  }
  if (result?.checkpoint) result.checkpoint.r4DataUnchanged = r4Before === await directoryFingerprint(r4Directory);
}

if (failure) {
  throw new Error(sanitize(failure instanceof Error ? failure.message : String(failure), [temporaryRoot]));
}
if (cleanupFailure) throw new Error("desktop_tauri_temp_cleanup_failed");
await writeSurfaceCheckpoint(result.checkpoint);
process.stdout.write(`${JSON.stringify(result)}\n`);
