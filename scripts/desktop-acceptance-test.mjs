import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptsDirectory, "..");
const require = createRequire(import.meta.url);
const realLocalAi = process.argv.includes("--real-local-ai");
const appRootArgument = process.argv.indexOf("--app-root");
const appRoot = appRootArgument >= 0
  ? path.resolve(repoRoot, String(process.argv[appRootArgument + 1] || ""))
  : path.join(repoRoot, "src-tauri", "resources", "app");
const sidecarEntry = path.join(appRoot, "desktop", "sidecar", "index.cjs");
const allowedOrigin = "http://tauri.localhost";
const temporaryRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "hematuria-desktop-acceptance-"));
const databasePath = path.join(temporaryRoot, "hematuria.sqlite3");
const children = new Set();
const sourceCounts = new Map();
const answerSourceCounts = new Map();
const turnDiagnostics = [];
let contextAppliedCount = 0;
let finalRuntimeEvidence = null;
const manifest = JSON.parse(await fsp.readFile(path.join(repoRoot, "desktop", "runtime-manifest.json"), "utf8"));
const modelMode = String(process.env.HEMATURIA_DESKTOP_MODEL_MODE || manifest.defaultModelMode || "lightweight");
const selectedModel = manifest.models?.[modelMode];
assert.ok(selectedModel, `Unknown desktop model mode: ${modelMode}`);
const llamaPath = path.join(repoRoot, "desktop-runtime", "llama", manifest.llamaCpp.entryPoint);
const defaultModelPath = path.join(
  process.env.LOCALAPPDATA || "",
  "cn.hematuria.training.desktop",
  "models",
  selectedModel.fileName
);
const modelPath = process.env.HEMATURIA_DESKTOP_MODEL_PATH || defaultModelPath;

assert.ok(fs.existsSync(sidecarEntry), `Staged desktop sidecar is missing: ${sidecarEntry}. Run desktop:stage first.`);
assert.ok(Number(process.versions.node.split(".")[0]) >= 22, "Desktop acceptance requires Node.js 22 or newer.");
if (realLocalAi) {
  assert.ok(fs.existsSync(llamaPath), `llama-server is missing: ${llamaPath}`);
  assert.ok(fs.existsSync(modelPath), `Qwen model is missing: ${modelPath}`);
  assert.equal(fs.statSync(modelPath).size, selectedModel.size, "Qwen model size mismatch");
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

const modelSha256 = realLocalAi ? await sha256File(modelPath) : "";
if (realLocalAi) {
  assert.equal(modelSha256, selectedModel.sha256, "Qwen model SHA256 mismatch");
}

function seedDesktopModelSelection() {
  const previousDatabasePath = process.env.HEMATURIA_DESKTOP_DATABASE_PATH;
  process.env.HEMATURIA_DESKTOP_DATABASE_PATH = databasePath;
  try {
    const store = require(path.join(appRoot, "server", "desktopSqliteStore.js"));
    store.setDesktopSetting("localAi.modelMode", modelMode);
    store.setDesktopSetting("localAi.modelDirectory", path.dirname(modelPath));
    store.setDesktopSetting("localAi.enabled", realLocalAi);
    store.closeDesktopSqliteStore();
  } finally {
    if (previousDatabasePath === undefined) delete process.env.HEMATURIA_DESKTOP_DATABASE_PATH;
    else process.env.HEMATURIA_DESKTOP_DATABASE_PATH = previousDatabasePath;
  }
}

seedDesktopModelSelection();

function randomSecret() {
  return crypto.randomBytes(32).toString("base64url");
}

function requestId(label) {
  return `${label}-${crypto.randomBytes(8).toString("hex")}`;
}

function readFirstLine(stream, timeoutMs = realLocalAi ? 180_000 : 20_000) {
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

async function launchSidecar() {
  const bearer = randomSecret();
  const handshake = randomSecret();
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
      HEMATURIA_DESKTOP_DATA_DIR: temporaryRoot,
      HEMATURIA_DESKTOP_DATABASE_PATH: databasePath,
      HEMATURIA_DESKTOP_ALLOWED_ORIGINS: allowedOrigin,
      HEMATURIA_DESKTOP_BEARER: bearer,
      HEMATURIA_DESKTOP_HANDSHAKE: handshake,
      HEMATURIA_DESKTOP_DEBUG_RUNTIME: "1",
      HEMATURIA_DESKTOP_MODEL_MODE: modelMode,
      ...(realLocalAi
        ? {
            HEMATURIA_LLAMA_SERVER_PATH: llamaPath,
            HEMATURIA_DESKTOP_MODEL_PATH: modelPath
          }
        : { HEMATURIA_DESKTOP_DISABLE_LOCAL_AI: "1" })
    },
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"]
  });
  children.add(child);
  let diagnostics = "";
  child.stderr.on("data", (chunk) => {
    diagnostics = `${diagnostics}${chunk.toString("utf8")}`.slice(-32_000);
  });

  const handshakeLine = readFirstLine(child.stdout);
  child.stdin.write("START\n");
  let ready;
  try {
    ready = JSON.parse(await handshakeLine);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : "sidecar_handshake_invalid"}\n${diagnostics}`);
  }
  assert.equal(ready.event, "ready");
  assert.equal(ready.protocolVersion, 1);
  assert.equal(ready.handshake, handshake);
  assert.equal(ready.pid, child.pid);
  assert.equal(ready.databaseSchemaVersion, 1);
  assert.equal(ready.localAi?.status, realLocalAi ? "starting" : "disabled");
  assert.match(ready.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  const runtime = { bearer, child, diagnostics: () => diagnostics, origin: ready.origin, ready };
  if (realLocalAi) {
    const deadline = Date.now() + 180_000;
    let status = "starting";
    while (Date.now() < deadline) {
      const settings = await requestJson(runtime, "/api/desktop/settings/", { method: "GET" });
      assert.equal(settings.payload.modelMode, modelMode, "sidecar must honor the selected model mode");
      assert.equal(settings.payload.modelAlias, selectedModel.alias, "sidecar must expose the selected model alias");
      status = String(settings.payload.llamaStatus || "");
      if (status === "ready") break;
      if (["model_invalid", "model_missing", "runtime_missing", "startup_failed"].includes(status)) {
        throw new Error(`desktop_local_ai_start_failed:${status}:${settings.payload.modelValidation || "unknown"}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.equal(status, "ready", "desktop local model did not become ready");
  }
  return runtime;
}

async function stopSidecar(runtime) {
  runtime.child.stdin.end();
  const exitCode = await waitForExit(runtime.child);
  assert.equal(exitCode, 0, runtime.diagnostics());
  children.delete(runtime.child);
}

async function requestJson(runtime, pathname, {
  method = "POST",
  body,
  stateToken = "",
  idempotencyKey = ""
} = {}) {
  const response = await fetch(`${runtime.origin}${pathname}`, {
    method,
    headers: {
      Origin: allowedOrigin,
      "X-Hematuria-Desktop-Token": runtime.bearer,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(stateToken ? { "X-Training-State": stateToken } : {}),
      ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(realLocalAi ? 120_000 : 15_000)
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    // The status assertion below is authoritative.
  }
  if (!response.ok) {
    const code = typeof payload?.error === "string" ? payload.error : "non_json_error";
    throw new Error(`${pathname} returned HTTP ${response.status} (${code})`);
  }
  return {
    payload,
    stateToken: String(response.headers.get("x-training-state") || "")
  };
}

async function initAttempt(runtime, caseId, language, attemptId) {
  const id = requestId(`${caseId}-${language}-init`);
  const result = await requestJson(runtime, "/api/training-action/", {
    body: {
      action: "init-attempt",
      caseId,
      attemptId,
      mode: "free",
      language,
      requestId: id
    },
    idempotencyKey: id
  });
  assert.ok(result.stateToken, `${caseId}/${language} init must return a training state token`);
  assert.equal(result.payload.caseId, caseId);
  assert.equal(result.payload.attemptId, attemptId);
  assert.equal(result.payload.practiceOnly, true);
  return result.stateToken;
}

async function initPatientSession(runtime, caseId, language, attemptId, stateToken) {
  const id = requestId(`${caseId}-${language}-session`);
  const result = await requestJson(runtime, "/api/session/init/", {
    body: {
      caseId,
      attemptId,
      mode: "free",
      language,
      forceRefresh: false
    },
    stateToken,
    idempotencyKey: id
  });
  assert.equal(result.payload.caseId, caseId);
  assert.equal(result.payload.attemptId, attemptId);
  assert.equal(result.payload.language, language);
  assert.equal(result.payload.aiStatus, realLocalAi ? "available" : "degraded");
  assert.ok(String(result.payload.sessionId || ""), `${caseId}/${language} session capability is required`);
  return String(result.payload.sessionId);
}

function recordSourceContract(reply, expectation, label, language, turnNumber) {
  const {
    expectedIntent,
    expectedSlot,
    matchedFact = expectedIntent,
    allowsUnknown = false,
    requiresContext = false
  } = expectation;
  assert.ok(String(reply.replyText || "").trim(), `${label} must return a non-empty governed answer`);
  assert.ok(Array.isArray(reply.matchedFacts), `${label} must expose matchedFacts`);
  if (matchedFact) {
    assert.ok(reply.matchedFacts.includes(matchedFact), `${label} must resolve ${matchedFact}`);
  }
  assert.equal(
    reply.usedModel,
    realLocalAi ? selectedModel.alias : "local-rule",
    realLocalAi
      ? `${label} must report the selected validator model even when rejected`
      : `${label} must not claim that a disabled model was used`
  );
  assert.equal(reply.thinkingMode, "disabled", `${label} must keep thinking disabled`);
  assert.equal(reply.thinkingExecuted, false, `${label} must not execute model thinking`);
  assert.ok(
    ["governed_planner", "safety_boundary"].includes(reply.generationSource),
    `${label} generation must remain under the governed planner or an explicit safety boundary`
  );
  assert.notEqual(reply.factSource, "local_ai", `${label} must keep model output outside the fact authority path`);
  assert.ok(reply.desktopEvidence, `${label} must include authenticated desktop runtime evidence`);
  assert.deepEqual(Object.keys(reply.desktopEvidence).sort(), [
    "answerSource", "cloudRequestCount", "factState", "fallbackReason", "intent", "latency",
    "llamaServerReady", "localModelReady", "model", "requestedSlot", "unknown"
  ].sort(), `${label} diagnostics must remain on the safe whitelist`);
  assert.equal(reply.desktopEvidence.cloudRequestCount, 0, `${label} must make no cloud request`);
  assert.equal(reply.desktopEvidence.model, selectedModel.alias, `${label} must report the selected model`);
  assert.ok(Number.isSafeInteger(reply.desktopEvidence.latency), `${label} must report bounded latency`);
  const actualIntent = String(reply.desktopEvidence.intent || "");
  const actualSlot = String(reply.desktopEvidence.requestedSlot || "");
  const intentMatch = actualIntent === expectedIntent;
  const slotMatch = actualSlot === expectedSlot;
  assert.ok(String(reply.desktopEvidence.factState || ""), `${label} must report the nine-state classification`);
  const unknown = String(reply.desktopEvidence.unknown || "") || null;
  const erroneousUnknown = !allowsUnknown
    && ["fact_missing", "intent_ambiguous", "classifier_unavailable"].includes(String(unknown || ""));
  assert.equal(erroneousUnknown, false, `${label} must not turn an available governed fact into unknown`);
  const contextLost = Boolean(requiresContext && (
    !intentMatch
    || !slotMatch
    || reply.desktopEvidence.fallbackReason === "local_context_reference_mismatch"
  ));
  if (requiresContext && !contextLost) contextAppliedCount += 1;
  if (realLocalAi) {
    assert.equal(reply.classificationSource, "local_ai", `${label} must invoke the local classifier`);
    assert.ok(["accepted", "rejected", "timeout"].includes(reply.classifierStatus), `${label} classifier status must be truthful`);
    assert.equal(reply.providerConfigured, true, `${label} must report the configured loopback provider`);
    assert.equal(reply.desktopEvidence.llamaServerReady, true, `${label} llama-server must be ready`);
    assert.equal(reply.desktopEvidence.localModelReady, true, `${label} Qwen model must be loaded`);
    if (reply.classifierStatus === "accepted") {
      assert.equal(intentMatch, true, `${label} accepted local metadata must report intent ${expectedIntent}`);
      assert.equal(slotMatch, true, `${label} accepted local metadata must report slot ${expectedSlot}`);
      assert.equal(reply.providerHttpSuccess, true, `${label} accepted metadata must complete a real llama-server request`);
      assert.equal(reply.desktopEvidence.answerSource, "local_ai", `${label} accepted metadata must report local_ai`);
      assert.equal(reply.isFallback, false, `${label} accepted metadata must use the local route`);
      assert.equal(reply.provider, "local", `${label} accepted metadata must name the local provider`);
    } else {
      assert.equal(reply.desktopEvidence.answerSource, "rule_fallback", `${label} rejected metadata must fall back safely`);
      assert.equal(reply.isFallback, true, `${label} rejected metadata must identify fallback`);
      assert.equal(reply.provider, "rule", `${label} rejected metadata must use the governed rule answer`);
      assert.ok(String(reply.desktopEvidence.fallbackReason || ""), `${label} rejected metadata must expose its safe rejection reason`);
    }
  } else {
    assert.equal(intentMatch, true, `${label} deterministic fallback must preserve governed intent ${expectedIntent}`);
    assert.equal(slotMatch, true, `${label} deterministic fallback must preserve governed slot ${expectedSlot}`);
    assert.equal(reply.classificationSource, "deterministic", `${label} must not claim local_ai while the model is disabled`);
    assert.equal(reply.classifierStatus, "not_invoked", `${label} classifier status must be truthful`);
    assert.equal(reply.providerConfigured, false, `${label} must not report a configured model provider`);
    assert.equal(reply.providerHttpSuccess, false, `${label} must not report a provider HTTP call`);
    assert.equal(reply.isFallback, true, `${label} must identify the safe rule path`);
    assert.equal(reply.provider, "rule", `${label} must use the existing Patient rule path`);
    assert.equal(reply.desktopEvidence.llamaServerReady, false, `${label} must report llama unavailable`);
    assert.equal(reply.desktopEvidence.localModelReady, false, `${label} must report model unavailable`);
    assert.equal(reply.desktopEvidence.answerSource, "rule_fallback", `${label} must report rule_fallback`);
  }
  if (reply.generationSource === "safety_boundary") {
    assert.ok(
      [
        "compound_question_preserves_all_facts",
        "medical_bilingual_conflict_pending_review",
        "safety_filter"
      ].includes(String(reply.fallbackReason || "")),
      `${label} safety_boundary must carry an approved reason`
    );
  }
  const sourceKey = `${reply.generationSource}/${reply.classificationSource}/${reply.classifierStatus}`;
  sourceCounts.set(sourceKey, (sourceCounts.get(sourceKey) || 0) + 1);
  const answerSource = String(reply.desktopEvidence.answerSource || "unknown");
  answerSourceCounts.set(answerSource, (answerSourceCounts.get(answerSource) || 0) + 1);
  turnDiagnostics.push({
    language,
    turn: turnNumber,
    answerSource,
    classifierStatus: String(reply.classifierStatus || ""),
    intent: actualIntent,
    requestedSlot: actualSlot,
    factState: String(reply.desktopEvidence.factState || ""),
    unknown,
    fallbackReason: reply.desktopEvidence.fallbackReason || null,
    llamaServerReady: reply.desktopEvidence.llamaServerReady,
    localModelReady: reply.desktopEvidence.localModelReady,
    model: reply.desktopEvidence.model,
    cloudRequestCount: reply.desktopEvidence.cloudRequestCount,
    latency: reply.desktopEvidence.latency,
    intentMatch,
    slotMatch,
    erroneousUnknown,
    contextLost
  });
}

async function askPatient(runtime, {
  caseId,
  language,
  attemptId,
  sessionId,
  question,
  expectation,
  conversationHistory,
  askedSlotIds,
  askedQuestions,
  label,
  turnNumber
}) {
  const id = requestId(`${caseId}-${language}-patient`);
  const result = await requestJson(runtime, "/api/agent-chat/", {
    body: {
      caseId,
      agentId: "standardized_patient",
      sessionId,
      attemptId,
      sessionMode: "free",
      stage: "history",
      mode: "training",
      language,
      studentInput: question,
      conversationHistory: conversationHistory.slice(-6),
      askedSlotIds,
      askedQuestions,
      debug: true
    },
    idempotencyKey: id
  });
  recordSourceContract(result.payload, expectation, label, language, turnNumber);
  return result.payload;
}

async function recordHistory(runtime, {
  caseId,
  language,
  attemptId,
  question,
  stateToken,
  turn
}) {
  const id = requestId(`${caseId}-${language}-history-${turn}`);
  const result = await requestJson(runtime, "/api/training-action/", {
    body: {
      action: "history-log",
      caseId,
      attemptId,
      mode: "free",
      language,
      question,
      requestId: id
    },
    stateToken,
    idempotencyKey: id
  });
  assert.equal(result.payload.recorded, true);
  assert.ok(result.stateToken, `${caseId}/${language} history turn ${turn} must rotate the state token`);
  return result.stateToken;
}

async function runInterview(runtime, { caseId, language, attemptId, turns }) {
  let stateToken = await initAttempt(runtime, caseId, language, attemptId);
  const sessionId = await initPatientSession(runtime, caseId, language, attemptId, stateToken);
  const conversationHistory = [];
  const askedSlotIds = [];
  const askedQuestions = [];

  for (const [index, turn] of turns.entries()) {
    const reply = await askPatient(runtime, {
      caseId,
      language,
      attemptId,
      sessionId,
      question: turn.question,
      expectation: turn,
      conversationHistory,
      askedSlotIds,
      askedQuestions,
      label: `${caseId}/${language}/turn-${index + 1}`,
      turnNumber: index + 1
    });
    conversationHistory.push(
      { role: "student", text: turn.question },
      { role: "patient", text: reply.replyText }
    );
    askedQuestions.push(turn.question);
    for (const slotId of reply.matchedSlotIds || []) {
      if (!askedSlotIds.includes(slotId)) askedSlotIds.push(slotId);
    }
    stateToken = await recordHistory(runtime, {
      caseId,
      language,
      attemptId,
      question: turn.question,
      stateToken,
      turn: index + 1
    });
  }
  return { askedQuestions, askedSlotIds, conversationHistory, sessionId, stateToken };
}

function stageSubmissionBody({ caseId, language, attemptId, requestId: id, askedQuestions }) {
  return {
    action: "stage-feedback",
    caseId,
    attemptId,
    mode: "free",
    language,
    stageKey: "history",
    submission: { askedQuestions },
    requestId: id
  };
}

async function submitHistoryStage(runtime, {
  caseId,
  language,
  attemptId,
  stateToken,
  askedQuestions,
  doubleSubmit = false,
  fixedRequestId = requestId(`${caseId}-${language}-stage-history`)
}) {
  const body = stageSubmissionBody({
    caseId,
    language,
    attemptId,
    requestId: fixedRequestId,
    askedQuestions
  });
  const send = () => requestJson(runtime, "/api/training-action/", {
    body,
    stateToken,
    idempotencyKey: fixedRequestId
  });
  const results = doubleSubmit ? await Promise.all([send(), send()]) : [await send()];
  for (const result of results) {
    assert.equal(result.payload.stageKey, "history");
    assert.ok(result.stateToken, `${caseId}/${language} stage submission must rotate the state token`);
  }
  if (doubleSubmit) {
    assert.equal(results[0].stateToken, results[1].stateToken, "rapid duplicate submissions must replay one committed token");
    assert.equal(results[0].payload.score, results[1].payload.score, "rapid duplicate submissions must replay one result");
  }
  return {
    body,
    originalToken: stateToken,
    requestId: fixedRequestId,
    stateToken: results[0].stateToken
  };
}

async function validateStageTwo(runtime, { caseId, language, attemptId, stateToken, label }) {
  const id = requestId(`${caseId}-${language}-validate`);
  const result = await requestJson(runtime, "/api/training-action/", {
    body: {
      action: "validate-attempt",
      caseId,
      attemptId,
      mode: "free",
      language,
      requestId: id
    },
    stateToken,
    idempotencyKey: id
  });
  assert.equal(result.payload.currentStage, 2, `${label} must restore stage two`);
  assert.equal(result.payload.status, "active");
  assert.equal(result.stateToken, stateToken, `${label} validation must not rotate the token`);
}

async function submitStageFeedback(runtime, {
  caseId,
  language,
  attemptId,
  stateToken,
  stageKey,
  submission,
  doubleSubmit = false,
  fixedRequestId = requestId(`${caseId}-${language}-stage-${stageKey}`)
}) {
  const body = {
    action: "stage-feedback",
    caseId,
    attemptId,
    mode: "free",
    language,
    stageKey,
    submission,
    requestId: fixedRequestId
  };
  const send = () => requestJson(runtime, "/api/training-action/", {
    body,
    stateToken,
    idempotencyKey: fixedRequestId
  });
  const results = doubleSubmit ? await Promise.all([send(), send()]) : [await send()];
  for (const result of results) {
    assert.equal(result.payload.stageKey, stageKey, `${stageKey} feedback must identify the submitted stage`);
    assert.ok(result.stateToken, `${stageKey} feedback must rotate the state token`);
    assert.doesNotMatch(JSON.stringify(result.payload), /undefined/, `${stageKey} feedback must not expose undefined`);
    assert.ok(Array.isArray(result.payload.hits), `${stageKey} feedback must return hit items`);
    assert.ok(Array.isArray(result.payload.misses), `${stageKey} feedback must return missing items`);
    assert.ok(Array.isArray(result.payload.warnings), `${stageKey} feedback must return warning items`);
  }
  if (doubleSubmit) {
    assert.equal(results[0].stateToken, results[1].stateToken, `${stageKey} rapid duplicate must replay one committed token`);
    assert.deepEqual(results[0].payload, results[1].payload, `${stageKey} rapid duplicate must replay one result`);
  }
  return {
    body,
    originalToken: stateToken,
    requestId: fixedRequestId,
    payload: results[0].payload,
    stateToken: results[0].stateToken
  };
}

async function placeIndependentOrder(runtime, { caseId, language, attemptId, stateToken }) {
  const id = requestId(`${caseId}-${language}-single-order`);
  const result = await requestJson(runtime, "/api/training-action/", {
    body: {
      action: "order",
      caseId,
      attemptId,
      mode: "free",
      language,
      input: "尿常规",
      requestId: id
    },
    stateToken,
    idempotencyKey: id
  });
  const outcomes = result.payload.orderOutcomes;
  assert.ok(Array.isArray(outcomes), "stage 2 must return independent per-order outcomes");
  assert.equal(outcomes.length, 1, "one requested order must produce exactly one outcome");
  assert.equal(outcomes[0].orderId, "LAB-UR-001", "urinalysis must resolve to its canonical order");
  assert.equal(outcomes[0].status, "reported", "P001 urinalysis must return its configured case-source report");
  assert.equal(outcomes[0].provenance, "configured_case_result", "the critical urinalysis report must retain source provenance");
  assert.equal(result.payload.returnedReportCount, 1, "the independent order must return one report");
  assert.doesNotMatch(JSON.stringify(result.payload), /undefined/, "stage 2 order result must not expose undefined");
  return { payload: result.payload, stateToken: result.stateToken };
}

async function requestStructuredConsultation(runtime, { caseId, language, attemptId, stateToken }) {
  const id = requestId(`${caseId}-${language}-mdt`);
  const consultRequests = [{
    department: "影像科",
    purpose: "复核本次训练已释放的影像与检查证据",
    question: "现有已释放证据能否支持下一步检查决策？",
    evidence: ["已采集病史", "已释放尿常规报告"]
  }];
  const result = await requestJson(runtime, "/api/training-action/", {
    body: {
      action: "mdt",
      caseId,
      attemptId,
      mode: "free",
      language,
      departments: ["影像科"],
      purpose: "基于已释放证据明确下一步检查问题",
      consultRequests,
      requestId: id
    },
    stateToken,
    idempotencyKey: id
  });
  assert.equal(Array.isArray(result.payload), true, "stage 4 must return department-specific consultation feedback");
  assert.equal(result.payload.length, 1, "one external department request must return one opinion");
  assert.equal(result.payload.some((item) => /泌尿外科|urology/i.test(String(item.department || ""))), false, "stage 4 must not self-consult urology");
  for (const opinion of result.payload) {
    assert.ok(opinion.opinion && opinion.neededInfo && opinion.necessity && opinion.mdtIntegration, "stage 4 feedback must be actionable and integrated");
  }
  assert.doesNotMatch(JSON.stringify(result.payload), /undefined|请提供当前阶段已获得的证据/, "stage 4 must not expose internal or generic placeholder text");
  return { consultRequests, payload: result.payload, stateToken: result.stateToken };
}

async function scoreCompletedAttempt(runtime, { caseId, language, attemptId, stateToken }) {
  const fixedRequestId = requestId(`${caseId}-${language}-score`);
  const body = {
    action: "score",
    caseId,
    attemptId,
    mode: "free",
    language,
    requestId: fixedRequestId
  };
  const send = () => requestJson(runtime, "/api/training-action/", {
    body,
    stateToken,
    idempotencyKey: fixedRequestId
  });
  const results = await Promise.all([send(), send()]);
  assert.equal(results[0].stateToken, results[1].stateToken, "rapid score double-click must replay one committed token");
  assert.deepEqual(results[0].payload, results[1].payload, "rapid score double-click must replay one final report");
  assert.equal(results[0].payload.max, 360, "final report must retain the governed 360-point denominator");
  assert.ok(Number.isFinite(results[0].payload.total), "final report must contain a numeric score");
  assert.ok(results[0].payload.total >= 0 && results[0].payload.total <= 360, "final score must remain within the governed range");
  assert.doesNotMatch(JSON.stringify(results[0].payload), /undefined/, "final report must not expose undefined");
  return {
    body,
    originalToken: stateToken,
    requestId: fixedRequestId,
    payload: results[0].payload,
    stateToken: results[0].stateToken,
    percentage: Math.round((results[0].payload.total / results[0].payload.max) * 1000) / 10
  };
}

async function completeFallbackSevenStages(runtime, { caseId, language, attemptId, stateToken }) {
  assert.equal(realLocalAi, false, "the full fallback flow must run with the local model disabled");
  const order = await placeIndependentOrder(runtime, { caseId, language, attemptId, stateToken });
  let stage = await submitStageFeedback(runtime, {
    caseId,
    language,
    attemptId,
    stateToken: order.stateToken,
    stageKey: "orders",
    submission: { selectedOrders: ["尿常规"], releasedReportCount: 1 }
  });

  stage = await submitStageFeedback(runtime, {
    caseId,
    language,
    attemptId,
    stateToken: stage.stateToken,
    stageKey: "diagnosis",
    submission: {
      diagnosis: "待依据已采集证据形成工作诊断",
      diagnosticEvidence: "【证据】已采集病史\n【证据】已释放尿常规报告\n【补充说明】仅使用本次训练已采集证据",
      differentials: "泌尿系感染\n泌尿系结石\n肾小球性疾病",
      differentialAnalysis: [
        "【鉴别1】泌尿系感染\n【支持证据】已采集病史\n【不支持证据】尚无充分证据",
        "【鉴别2】泌尿系结石\n【支持证据】已释放检查报告\n【不支持证据】尚无充分证据",
        "【鉴别3】肾小球性疾病\n【支持证据】已释放尿常规报告\n【不支持证据】尚无充分证据"
      ].join("\n---\n"),
      confirmatoryTests: "【检查】尿常规【目的】复核已释放结果\n【检查】泌尿系影像【目的】依据临床需要进一步定位"
    }
  });
  assert.ok(String(stage.payload.standardAnswer || ""), "stage 3 must return reference points after submission");

  const consultation = await requestStructuredConsultation(runtime, {
    caseId,
    language,
    attemptId,
    stateToken: stage.stateToken
  });
  stage = await submitStageFeedback(runtime, {
    caseId,
    language,
    attemptId,
    stateToken: consultation.stateToken,
    stageKey: "consult",
    submission: {
      consultNeeded: "需要会诊",
      consultDepartments: ["影像科"],
      consultPurpose: "【影像科】复核本次训练已释放的影像与检查证据",
      consultQuestions: "【影像科】现有已释放证据能否支持下一步检查决策？",
      consultSummary: "【影像科】已采集病史 || 已释放尿常规报告"
    }
  });
  assert.doesNotMatch(String(stage.payload.standardAnswer || ""), /泌尿外科|urology/i, "stage 4 reference must not recommend urology self-consultation");

  stage = await submitStageFeedback(runtime, {
    caseId,
    language,
    attemptId,
    stateToken: stage.stateToken,
    stageKey: "treatment",
    submission: {
      immediateTreatment: "评估生命体征与急症风险\n根据病情决定门诊观察或入院",
      admissionTreatment: "【药物医嘱】由学习者依据适应证核对后开立\n【检验医嘱】复核必要检验\n【影像/操作医嘱】仅依据已释放证据安排",
      definitiveTreatment: "根据已采集证据、风险评估和会诊意见制定手术或介入计划",
      patientEducation: "记录出入量并监测症状变化，出现危险信号及时复评",
      mdtRevisedPlan: "【停药/禁忌】任何停药或抗栓调整前先核对适应证与风险",
      followUp: "安排复诊并复核症状、检查报告和后续计划"
    }
  });
  assert.ok(String(stage.payload.standardAnswer || ""), "stage 5 must return the case reference pathway after submission");

  const perioperativeChecklist = [
    "手术适应证确认", "麻醉评估", "心肺风险", "肾功能与液体管理", "抗菌药物与感染控制",
    "备血", "凝血与抗凝/抗血小板", "VTE预防", "导管、引流和支架", "术后监测",
    "并发症预防", "ERAS", "随访与患者教育"
  ].map((item) => `【清单】${item}`).join("\n");
  stage = await submitStageFeedback(runtime, {
    caseId,
    language,
    attemptId,
    stateToken: stage.stateToken,
    stageKey: "perioperative",
    submission: { perioperativePreparation: perioperativeChecklist }
  });
  assert.ok(String(stage.payload.standardAnswer || ""), "stage 6 must return case reference points after submission");

  stage = await submitStageFeedback(runtime, {
    caseId,
    language,
    attemptId,
    stateToken: stage.stateToken,
    stageKey: "debrief",
    submission: {
      debriefReflection: "本次训练仅依据已采集和已释放证据完成结构化决策；后续需复核遗漏证据、风险项目和随访安排。"
    }
  });
  const score = await scoreCompletedAttempt(runtime, {
    caseId,
    language,
    attemptId,
    stateToken: stage.stateToken
  });
  assert.ok(score.percentage >= 0 && score.percentage <= 100, "student-facing percentage must remain within 0-100");
  return { order: order.payload, score, stateToken: score.stateToken };
}

async function resumeDesktopAttempt(runtime, { caseId, language, attemptId }) {
  const result = await requestJson(runtime, "/api/desktop/attempt/resume/", {
    body: { attemptId, caseId, language, mode: "free" }
  });
  assert.ok(result.stateToken, "desktop resume must return the durable current token");
  return result;
}

const zhTurns = [
  { question: "哪里不舒服？", expectedIntent: "chief_complaint", expectedSlot: "chief_complaint" },
  { question: "多久了？", expectedIntent: "hematuria_onset", expectedSlot: "hematuria_onset", requiresContext: true },
  // Review-governed history may be a truthful unknown and need not be
  // student-collectable, but the intent and nine-state result remain observable.
  { question: "有没有其他疾病？", expectedIntent: "past_medical_history_summary", expectedSlot: "PAST_ALL", matchedFact: null, allowsUnknown: true },
  { question: "高血压吃什么药？", expectedIntent: "medication_name", expectedSlot: "MED_ALL" },
  { question: "这个药怎么吃？", expectedIntent: "medication_frequency", expectedSlot: "MED_ALL", requiresContext: true },
  { question: "还有其他药吗？", expectedIntent: "other_medications", expectedSlot: "MED_ALL", matchedFact: null, allowsUnknown: true, requiresContext: true },
  { question: "抽烟吗？", expectedIntent: "smoking_history", expectedSlot: "LIFE_SMOKING", matchedFact: null, allowsUnknown: true },
  { question: "喝酒吗？", expectedIntent: "alcohol_history", expectedSlot: "LIFE_ALCOHOL", matchedFact: null, allowsUnknown: true }
];

const enTurns = [
  { question: "What brings you in?", expectedIntent: "chief_complaint", expectedSlot: "chief_complaint" },
  { question: "How long has it been going on?", expectedIntent: "hematuria_onset", expectedSlot: "hematuria_onset", requiresContext: true },
  { question: "Do you have any other diseases?", expectedIntent: "past_medical_history_summary", expectedSlot: "PAST_ALL", matchedFact: null, allowsUnknown: true },
  { question: "What medicine do you take for high blood pressure?", expectedIntent: "medication_name", expectedSlot: "MED_ALL" },
  { question: "How do you take it?", expectedIntent: "medication_frequency", expectedSlot: "MED_ALL", requiresContext: true },
  { question: "Do you take any other medications?", expectedIntent: "other_medications", expectedSlot: "MED_ALL", matchedFact: null, allowsUnknown: true, requiresContext: true },
  { question: "Do you smoke?", expectedIntent: "smoking_history", expectedSlot: "LIFE_SMOKING", matchedFact: null, allowsUnknown: true },
  { question: "Do you drink alcohol?", expectedIntent: "alcohol_history", expectedSlot: "LIFE_ALCOHOL", matchedFact: null, allowsUnknown: true }
];

const suffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const p001ZhAttemptId = `desktop-p001-zh-${suffix}`;
const p001EnAttemptId = `desktop-p001-en-${suffix}`;
const p003AttemptId = `desktop-p003-zh-${suffix}`;
let fallbackSevenStage = null;
let completedRestartVerified = false;

try {
  let runtime = await launchSidecar();
  const health = await requestJson(runtime, "/api/health/", { method: "GET" });
  assert.equal(health.payload.status, "ok");
  assert.equal(health.payload.deploymentTier, "practice");
  assert.equal(health.payload.trainingStateConfigured, true);
  assert.equal(health.payload.durableAttemptStoreConfigured, true);
  assert.equal(health.payload.durableAttemptStoreCredentialSource, "desktop_sqlite");
  assert.equal(
    health.payload.patientServiceConfigured,
    realLocalAi,
    realLocalAi
      ? "the real offline run must configure the local patient classifier"
      : "the fallback acceptance run intentionally disables the local model"
  );

  const zhInterview = await runInterview(runtime, {
    caseId: "P001",
    language: "zh",
    attemptId: p001ZhAttemptId,
    turns: zhTurns
  });
  const zhSubmission = await submitHistoryStage(runtime, {
    caseId: "P001",
    language: "zh",
    attemptId: p001ZhAttemptId,
    stateToken: zhInterview.stateToken,
    askedQuestions: zhInterview.askedQuestions,
    doubleSubmit: true
  });
  await validateStageTwo(runtime, {
    caseId: "P001",
    language: "zh",
    attemptId: p001ZhAttemptId,
    stateToken: zhSubmission.stateToken,
    label: "P001 Chinese"
  });
  await stopSidecar(runtime);

  runtime = await launchSidecar();
  const persistedReplay = await requestJson(runtime, "/api/training-action/", {
    body: zhSubmission.body,
    stateToken: zhSubmission.originalToken,
    idempotencyKey: zhSubmission.requestId
  });
  assert.equal(persistedReplay.stateToken, zhSubmission.stateToken, "stage idempotency must survive a sidecar restart");
  assert.equal(persistedReplay.payload.stageKey, "history");
  await validateStageTwo(runtime, {
    caseId: "P001",
    language: "zh",
    attemptId: p001ZhAttemptId,
    stateToken: persistedReplay.stateToken,
    label: "P001 Chinese after restart"
  });

  if (!realLocalAi) {
    fallbackSevenStage = await completeFallbackSevenStages(runtime, {
      caseId: "P001",
      language: "zh",
      attemptId: p001ZhAttemptId,
      stateToken: persistedReplay.stateToken
    });
  }

  const enInterview = await runInterview(runtime, {
    caseId: "P001",
    language: "en",
    attemptId: p001EnAttemptId,
    turns: enTurns
  });
  const enSubmission = await submitHistoryStage(runtime, {
    caseId: "P001",
    language: "en",
    attemptId: p001EnAttemptId,
    stateToken: enInterview.stateToken,
    askedQuestions: enInterview.askedQuestions
  });
  await validateStageTwo(runtime, {
    caseId: "P001",
    language: "en",
    attemptId: p001EnAttemptId,
    stateToken: enSubmission.stateToken,
    label: "P001 English"
  });

  const p003InitialToken = await initAttempt(runtime, "P003", "zh", p003AttemptId);
  const p003Submission = await submitHistoryStage(runtime, {
    caseId: "P003",
    language: "zh",
    attemptId: p003AttemptId,
    stateToken: p003InitialToken,
    askedQuestions: []
  });
  await validateStageTwo(runtime, {
    caseId: "P003",
    language: "zh",
    attemptId: p003AttemptId,
    stateToken: p003Submission.stateToken,
    label: "P003 zero-round"
  });
  finalRuntimeEvidence = (await requestJson(runtime, "/api/desktop/evidence/", { method: "GET" })).payload;
  assert.equal(finalRuntimeEvidence.llamaServerReady, realLocalAi);
  assert.equal(finalRuntimeEvidence.localModelReady, realLocalAi);
  assert.equal(finalRuntimeEvidence.cloudRequestCount, 0);
  await stopSidecar(runtime);

  if (!realLocalAi) {
    runtime = await launchSidecar();
    const completedResume = await resumeDesktopAttempt(runtime, {
      caseId: "P001",
      language: "zh",
      attemptId: p001ZhAttemptId
    });
    assert.equal(completedResume.payload.currentStage, 8, "completed P001 must restore at the report stage");
    assert.equal(completedResume.payload.status, "completed", "completed P001 must restore as completed");
    assert.equal(completedResume.stateToken, fallbackSevenStage.stateToken, "completed resume must return the current durable token");

    const scoreReplay = await requestJson(runtime, "/api/training-action/", {
      body: fallbackSevenStage.score.body,
      stateToken: fallbackSevenStage.score.originalToken,
      idempotencyKey: fallbackSevenStage.score.requestId
    });
    assert.equal(scoreReplay.stateToken, fallbackSevenStage.score.stateToken, "final score idempotency must survive a sidecar restart");
    assert.deepEqual(scoreReplay.payload, fallbackSevenStage.score.payload, "restarted score replay must return the same final report");
    completedRestartVerified = true;
    await stopSidecar(runtime);
  }

  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const schema = database.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").get();
    assert.equal(Number(schema?.value), 1);
    const attemptRows = database.prepare(`
      SELECT attempt_id, state_json
      FROM attempts
      WHERE attempt_id IN (?, ?, ?)
      ORDER BY attempt_id
    `).all(p001ZhAttemptId, p001EnAttemptId, p003AttemptId);
    assert.equal(attemptRows.length, 3, "all three acceptance attempts must be durable");
    for (const row of attemptRows) {
      const state = JSON.parse(row.state_json);
      const completedFallbackAttempt = !realLocalAi && row.attempt_id === p001ZhAttemptId;
      assert.equal(Number(state.currentStage), completedFallbackAttempt ? 8 : 2, `${row.attempt_id} must persist its current stage`);
      assert.equal(state.status, completedFallbackAttempt ? "completed" : "active", `${row.attempt_id} must persist its status`);
      const expectedStages = completedFallbackAttempt ? [1, 2, 3, 4, 5, 6, 7] : [1];
      assert.deepEqual(state.completedStages, expectedStages, `${row.attempt_id} must persist each completed stage exactly once`);
      assert.ok(state.submissions?.history, `${row.attempt_id} must persist its history submission`);
      if (completedFallbackAttempt) {
        assert.ok(state.submissions?.orders && state.submissions?.diagnosis && state.submissions?.consult, "completed fallback flow must persist stages 2-4");
        assert.ok(state.submissions?.treatment && state.submissions?.perioperative && state.submissions?.debrief, "completed fallback flow must persist stages 5-7");
        assert.equal(Number(state.finalScore), fallbackSevenStage.score.payload.total, "completed fallback flow must persist its final score");
      }
    }
    const stageRequest = database.prepare(`
      SELECT COUNT(*) AS count
      FROM attempt_requests
      WHERE request_id = ?
    `).get(zhSubmission.requestId);
    assert.equal(Number(stageRequest?.count), 1, "rapid and restarted replays must occupy one idempotency record");
    if (!realLocalAi) {
      const scoreRequest = database.prepare(`
        SELECT COUNT(*) AS count
        FROM attempt_requests
        WHERE request_id = ?
      `).get(fallbackSevenStage.score.requestId);
      assert.equal(Number(scoreRequest?.count), 1, "rapid and restarted score replays must occupy one idempotency record");
    }
    const restoredSession = database.prepare(`
      SELECT status
      FROM desktop_sessions
      WHERE session_id = ?
    `).get(zhInterview.sessionId);
    assert.equal(restoredSession?.status, "active", "the P001 session capability must persist across restart");
  } finally {
    database.close();
  }

  const sourceSummary = Object.fromEntries([...sourceCounts.entries()].sort(([left], [right]) => left.localeCompare(right)));
  const answerSourceSummary = Object.fromEntries([...answerSourceCounts.entries()].sort(([left], [right]) => left.localeCompare(right)));
  assert.equal(turnDiagnostics.length, 16, "acceptance must record exactly eight safe diagnostic rows per language");
  assert.ok(contextAppliedCount > 0, "follow-up intent and slot context must be retained");
  if (realLocalAi) {
    assert.ok((answerSourceCounts.get("local_ai") || 0) > 0, "the real model run must accept at least one local classification");
  } else {
    assert.ok((answerSourceCounts.get("rule_fallback") || 0) > 0, "the disabled model run must use rule_fallback");
  }
  const offlineEvidence = {
    llamaServerReady: finalRuntimeEvidence.llamaServerReady,
    localModelReady: finalRuntimeEvidence.localModelReady,
    answerSource: finalRuntimeEvidence.answerSource,
    cloudRequestCount: finalRuntimeEvidence.cloudRequestCount
  };
  if (!realLocalAi) assert.equal(offlineEvidence.answerSource, "rule_fallback", "disabled local AI must never be presented as local_ai");
  process.stdout.write(`${JSON.stringify({
    status: "PASS",
    mode: realLocalAi ? "real_local_ai_offline" : "rule_fallback",
    stagedAppRoot: path.relative(repoRoot, appRoot).replaceAll("\\", "/"),
    modelMode,
    model: selectedModel.fileName,
    ...(realLocalAi ? { modelSha256Verified: modelSha256 === selectedModel.sha256 } : {}),
    attempts: { p001Zh: realLocalAi ? "stage2" : "completed", p001En: "stage2", p003ZeroRound: "stage2" },
    questions: zhTurns.length + enTurns.length,
    restoredSession: true,
    completedRestartVerified,
    persistentIdempotency: true,
    contextAppliedCount,
    ...(fallbackSevenStage ? {
      fallbackSevenStage: {
        status: "completed",
        stage2OrderStatus: fallbackSevenStage.order.orderOutcomes[0].status,
        finalReportGenerated: true,
        percentage: fallbackSevenStage.score.percentage
      }
    } : {}),
    sources: sourceSummary,
    answerSources: answerSourceSummary,
    turnDiagnostics,
    offlineEvidence
  }, null, 2)}\n`);
  process.stdout.write(`llamaServerReady=${offlineEvidence.llamaServerReady}\n`);
  process.stdout.write(`localModelReady=${offlineEvidence.localModelReady}\n`);
  process.stdout.write(`answerSource=${offlineEvidence.answerSource}\n`);
  process.stdout.write(`cloudRequestCount=${offlineEvidence.cloudRequestCount}\n`);
} finally {
  for (const child of children) {
    try {
      child.stdin.end();
      child.kill("SIGKILL");
    } catch {
      // Cleanup remains scoped to child processes created by this test.
    }
  }
  await fsp.rm(temporaryRoot, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 100
  });
}
