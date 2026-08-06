import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function sanitize(value, paths = [], secrets = []) {
  let output = String(value || "");
  for (const item of [...secrets, ...paths, repoRoot, process.env.USERPROFILE, process.env.LOCALAPPDATA, process.env.TEMP]
    .filter(Boolean)
    .sort((left, right) => String(right).length - String(left).length)) {
    const escaped = String(item).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    output = output.replace(new RegExp(escaped, "giu"), "<redacted>");
    output = output.replace(new RegExp(escaped.replaceAll("\\\\", "[/\\\\]"), "giu"), "<redacted>");
  }
  return output;
}

function secret() {
  return crypto.randomBytes(32).toString("base64url");
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
    const timeout = setTimeout(() => reject(new Error("sidecar_exit_timeout")), timeoutMs);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
}

function currentProductHead() {
  const configured = String(process.env.HEMATURIA_PRODUCT_HEAD || "");
  if (/^[0-9a-f]{40}$/.test(configured)) return configured;
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true
  }).trim();
}

export async function startDesktopSidecar({
  allowedOrigin,
  appRoot = process.env.HEMATURIA_DESKTOP_CONTRACT_APP_ROOT || repoRoot,
  dataDirectory,
  installationMode = process.env.HEMATURIA_DESKTOP_INSTALLATION_MODE || "development"
}) {
  assert.match(String(allowedOrigin), /^http:\/\/127\.0\.0\.1:\d+$/);
  const resolvedAppRoot = path.resolve(appRoot);
  const sidecarEntry = path.join(resolvedAppRoot, "desktop", "sidecar", "index.cjs");
  try {
    await fs.access(sidecarEntry);
  } catch {
    throw new Error("desktop_contract_sidecar_missing");
  }
  const ownsDataDirectory = !dataDirectory;
  const resolvedDataDirectory = dataDirectory
    ? path.resolve(dataDirectory)
    : await fs.mkdtemp(path.join(os.tmpdir(), "hematuria-renderer-contract-"));
  await fs.mkdir(resolvedDataDirectory, { recursive: true });

  const bearer = secret();
  const handshake = secret();
  const productHead = currentProductHead();
  const child = spawn(process.execPath, [sidecarEntry], {
    cwd: resolvedAppRoot,
    env: {
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      LOCALAPPDATA: process.env.LOCALAPPDATA,
      USERPROFILE: process.env.USERPROFILE,
      PATH: process.env.PATH,
      NODE_NO_WARNINGS: "1",
      HEMATURIA_APP_ROOT: resolvedAppRoot,
      HEMATURIA_DESKTOP_DATA_DIR: resolvedDataDirectory,
      HEMATURIA_DESKTOP_DATABASE_PATH: path.join(resolvedDataDirectory, "hematuria.sqlite3"),
      HEMATURIA_DESKTOP_ALLOWED_ORIGINS: allowedOrigin,
      HEMATURIA_DESKTOP_BEARER: bearer,
      HEMATURIA_DESKTOP_HANDSHAKE: handshake,
      HEMATURIA_DESKTOP_INSTALLATION_MODE: installationMode,
      HEMATURIA_DESKTOP_DISABLE_LOCAL_AI: "1",
      HEMATURIA_DESKTOP_DEBUG_RUNTIME: "1",
      HEMATURIA_PRODUCT_HEAD: productHead,
      NEXT_PUBLIC_GIT_SHA: productHead
    },
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"]
  });
  let diagnostics = "";
  child.stderr.on("data", (chunk) => {
    diagnostics = `${diagnostics}${chunk.toString("utf8")}`.slice(-32_000);
  });

  try {
    const line = readFirstLine(child.stdout);
    child.stdin.write("START\n");
    const ready = JSON.parse(await line);
    assert.equal(ready.event, "ready");
    assert.equal(ready.protocolVersion, 1);
    assert.ok(ready.handshake === handshake, "sidecar handshake mismatch");
    assert.equal(ready.pid, child.pid);
    assert.equal(ready.databaseSchemaVersion, 3);
    assert.match(ready.origin, /^http:\/\/127\.0\.0\.1:\d+$/);

    return {
      dataDirectory: resolvedDataDirectory,
      origin: ready.origin,
      pid: child.pid,
      productHead,
      runtime: Object.freeze({
        runtimeTarget: "desktop",
        apiBaseUrl: ready.origin,
        authToken: bearer,
        debugRuntime: true
      }),
      async stop({ removeData = ownsDataDirectory } = {}) {
        if (child.exitCode === null) child.stdin.end();
        let exitCode;
        try {
          exitCode = await waitForExit(child);
        } catch (error) {
          child.kill("SIGKILL");
          await waitForExit(child).catch(() => undefined);
          throw error;
        } finally {
          if (removeData) await fs.rm(resolvedDataDirectory, { recursive: true, force: true });
        }
        assert.equal(exitCode, 0, sanitize(diagnostics, [resolvedAppRoot, resolvedDataDirectory], [bearer, handshake]));
        await assertLoopbackClosed(ready.origin);
      }
    };
  } catch (error) {
    if (child.exitCode === null) child.kill("SIGKILL");
    await waitForExit(child).catch(() => undefined);
    if (ownsDataDirectory) await fs.rm(resolvedDataDirectory, { recursive: true, force: true });
    throw new Error(sanitize(
      `${error instanceof Error ? error.message : String(error)}\n${diagnostics}`.trim(),
      [resolvedAppRoot, resolvedDataDirectory],
      [bearer, handshake]
    ));
  }
}

export async function installDesktopRuntime(target, runtime, language = "zh") {
  await target.addInitScript(({ injectedRuntime, selectedLanguage }) => {
    Object.defineProperty(globalThis, "__HEMATURIA_DESKTOP_RUNTIME__", {
      value: Object.freeze(injectedRuntime),
      writable: true,
      configurable: false,
      enumerable: false
    });
    if (!localStorage.getItem("hematuria-language")) localStorage.setItem("hematuria-language", selectedLanguage);
  }, { injectedRuntime: runtime, selectedLanguage: language });
}

export async function runtimeProbe(page) {
  return page.evaluate(() => {
    const runtime = globalThis.__HEMATURIA_DESKTOP_RUNTIME__;
    const diagnostic = globalThis.__HEMATURIA_DESKTOP_DIAGNOSTIC__;
    return {
      runtimeTarget: runtime?.runtimeTarget || "",
      apiBaseUrl: runtime?.apiBaseUrl || "",
      tokenValid: /^[A-Za-z0-9_-]{43,}$/.test(runtime?.authToken || ""),
      productHead: diagnostic?.productHead || ""
    };
  });
}

export async function runtimeEvidence(page) {
  return page.evaluate(async () => {
    const runtime = globalThis.__HEMATURIA_DESKTOP_RUNTIME__;
    if (!runtime) throw new Error("desktop_runtime_missing");
    const response = await fetch(`${runtime.apiBaseUrl}/api/desktop/evidence`, {
      headers: { "X-Hematuria-Desktop-Token": runtime.authToken },
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`desktop_runtime_evidence_failed:${response.status}`);
    const payload = await response.json();
    return {
      cloudRequestCount: Number(payload.cloudRequestCount),
      productHead: String(payload.productHead || ""),
      runtimeTarget: String(payload.runtimeTarget || "")
    };
  });
}

export async function desktopJson(page, pathname, { body, idempotencyKey, stateToken } = {}) {
  return page.evaluate(async ({ pathname, body, idempotencyKey, stateToken }) => {
    const runtime = globalThis.__HEMATURIA_DESKTOP_RUNTIME__;
    if (!runtime) throw new Error("desktop_runtime_missing");
    const response = await fetch(`${runtime.apiBaseUrl}${pathname}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "X-Hematuria-Desktop-Token": runtime.authToken,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
        ...(stateToken ? { "X-Training-State": stateToken } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store"
    });
    return {
      ok: response.ok,
      status: response.status,
      payload: await response.json(),
      stateToken: response.headers.get("x-training-state") || ""
    };
  }, { pathname, body, idempotencyKey, stateToken });
}

export async function seedCompletedPercentageFixture(page) {
  const attempt = {
    attemptId: "surface-percentage-fixture",
    caseId: "P004",
    mode: "free",
    language: "zh",
    participantId: "practice-user",
    schemaVersion: "attempt-v3",
    createdAt: new Date().toISOString()
  };
  const requestId = "surface-percentage-fixture-init";
  const initialized = await desktopJson(page, "/api/training-action", {
    body: { action: "init-attempt", caseId: "P004", attemptId: attempt.attemptId, mode: "free", language: "zh", requestId },
    idempotencyKey: requestId
  });
  assert.equal(initialized.status, 200);
  assert.ok(initialized.stateToken);
  const evaluation = {
    score: 1, max: 1, hits: [], misses: [], warnings: [], standardAnswer: "",
    comment: "Completed fixture.", practiceOnly: true
  };
  const snapshot = {
    attempt,
    activeStageNo: 7,
    submitted: Object.fromEntries(Array.from({ length: 7 }, (_, index) => [index + 1, { ...evaluation, stageKey: `stage-${index + 1}` }])),
    finalReport: {
      total: 270, max: 360, items: [], redFlags: [], ragGuardrails: [],
      scoringVersion: "fixture", caseVersion: "fixture", generatedAt: new Date().toISOString(), reportVersion: 3
    }
  };
  const saved = await desktopJson(page, "/api/desktop/attempt/state", {
    body: { action: "save", attemptId: attempt.attemptId, caseId: "P004", mode: "free", language: "zh", snapshot }
  });
  assert.equal(saved.status, 200);
}

function caseUrl(page, caseId, mode, baseURL) {
  const base = baseURL || page.url();
  const url = new URL(`/cases/${caseId}/`, base);
  if (mode && mode !== "free") url.searchParams.set("mode", mode);
  return url.toString();
}

let languageSelection = 0;

async function selectLanguage(page, language) {
  const selection = ++languageSelection;
  const apply = ({ language, selection }) => {
    const key = "hematuria-test-language-selection";
    if (selection < Number(localStorage.getItem(key) || 0)) return;
    localStorage.setItem(key, String(selection));
    localStorage.setItem("hematuria-language", language);
  };
  await page.addInitScript(apply, { language, selection });
  if (page.url() !== "about:blank") await page.evaluate(apply, { language, selection });
}

export async function saveHistoryDraft(page, {
  baseURL,
  caseId,
  language,
  marker,
  requestedMode = "free"
}) {
  await selectLanguage(page, language);
  const saved = page.waitForResponse((response) => {
    const request = response.request();
    if (request.method() !== "POST" || new URL(response.url()).pathname !== "/api/desktop/attempt/state") return false;
    let body;
    try {
      body = request.postDataJSON();
    } catch {
      return false;
    }
    return response.status() === 200
      && body?.action === "save"
      && body?.caseId === caseId
      && body?.language === language
      && body?.snapshot?.answers?.historySummary === marker;
  }, { timeout: 30_000 });
  await page.goto(caseUrl(page, caseId, requestedMode, baseURL));
  const summary = page.getByTestId("history-summary");
  await summary.waitFor({ state: "visible" });
  await summary.fill(marker);
  await summary.blur();
  const response = await saved;
  const body = response.request().postDataJSON();
  assert.equal(body.mode, requestedMode === "random" || requestedMode === "demo" ? "free" : requestedMode);
  assert.equal(response.request().headers()["x-hematuria-desktop-token"]?.length >= 43, true);
  return { caseId, language, durableMode: body.mode, status: response.status() };
}

export async function submitHistoryAndEnterStageTwo(page, { caseId, language, marker }) {
  const feedback = page.waitForResponse((response) => {
    const request = response.request();
    if (request.method() !== "POST" || new URL(response.url()).pathname !== "/api/training-action/") return false;
    try {
      const body = request.postDataJSON();
      return response.status() === 200 && body?.action === "stage-feedback" && body?.stageKey === "history";
    } catch {
      return false;
    }
  }, { timeout: 30_000 });
  const submit = page.getByTestId("submit-stage");
  await submit.waitFor({ state: "visible" });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && await submit.isDisabled()) await delay(50);
  assert.equal(await submit.isEnabled(), true, "history submit did not become ready");
  await submit.click();
  await feedback;

  const next = page.getByTestId("next-stage");
  const nextDeadline = Date.now() + 30_000;
  while (Date.now() < nextDeadline && await next.isDisabled()) await delay(50);
  assert.equal(await next.isEnabled(), true, "next stage did not become ready");
  const stageTwoSaved = page.waitForResponse((response) => {
    const request = response.request();
    if (request.method() !== "POST" || new URL(response.url()).pathname !== "/api/desktop/attempt/state") return false;
    try {
      const body = request.postDataJSON();
      return response.status() === 200
        && body?.action === "save"
        && body?.caseId === caseId
        && body?.language === language
        && body?.snapshot?.activeStageNo === 2
        && Boolean(body?.snapshot?.submitted?.[1])
        && body?.snapshot?.answers?.historySummary === marker;
    } catch {
      return false;
    }
  }, { timeout: 30_000 });
  await next.click();
  await stageTwoSaved;
  await page.getByTestId("investigation-selection-summary").waitFor({ state: "visible" });
}

export async function expectSubmittedStageTwo(page, {
  baseURL,
  caseId,
  language,
  marker,
  requestedMode = "free"
}) {
  await selectLanguage(page, language);
  const loaded = page.waitForResponse((response) => {
    const request = response.request();
    if (request.method() !== "POST" || new URL(response.url()).pathname !== "/api/desktop/attempt/state") return false;
    try {
      const body = request.postDataJSON();
      return response.status() === 200
        && body?.action === "load"
        && body?.caseId === caseId
        && body?.language === language;
    } catch {
      return false;
    }
  }, { timeout: 30_000 });
  await page.goto(caseUrl(page, caseId, requestedMode, baseURL));
  const response = await loaded;
  const payload = await response.json();
  assert.equal(payload?.snapshot?.activeStageNo, 2);
  assert.equal(Boolean(payload?.snapshot?.submitted?.[1]), true);
  assert.equal(payload?.snapshot?.answers?.historySummary, marker);
  await page.getByTestId("investigation-selection-summary").waitFor({ state: "visible" });
}

export async function assertLoopbackClosed(origin, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(`${origin}/api/health/`, { signal: AbortSignal.timeout(250) });
    } catch {
      return;
    }
    await delay(50);
  }
  throw new Error("desktop_loopback_port_still_open");
}
