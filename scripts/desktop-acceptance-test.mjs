import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptsDirectory, "..");
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
let contextAppliedCount = 0;
let finalRuntimeEvidence = null;
const manifest = JSON.parse(await fsp.readFile(path.join(repoRoot, "desktop", "runtime-manifest.json"), "utf8"));
const llamaPath = path.join(repoRoot, "desktop-runtime", "llama", manifest.llamaCpp.entryPoint);
const defaultModelPath = path.join(
  process.env.LOCALAPPDATA || "",
  "cn.hematuria.training.desktop",
  "models",
  manifest.model.fileName
);
const modelPath = process.env.HEMATURIA_DESKTOP_MODEL_PATH || defaultModelPath;

assert.ok(fs.existsSync(sidecarEntry), `Staged desktop sidecar is missing: ${sidecarEntry}. Run desktop:stage first.`);
assert.ok(Number(process.versions.node.split(".")[0]) >= 22, "Desktop acceptance requires Node.js 22 or newer.");
if (realLocalAi) {
  assert.ok(fs.existsSync(llamaPath), `llama-server is missing: ${llamaPath}`);
  assert.ok(fs.existsSync(modelPath), `Qwen model is missing: ${modelPath}`);
  assert.equal(fs.statSync(modelPath).size, manifest.model.size, "Qwen model size mismatch");
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

const modelSha256 = realLocalAi ? await sha256File(modelPath) : "";
if (realLocalAi) {
  assert.equal(modelSha256, manifest.model.sha256, "Qwen model SHA256 mismatch");
}

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
  assert.equal(ready.localAi?.status, realLocalAi ? "ready" : "disabled");
  assert.match(ready.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  return { bearer, child, diagnostics: () => diagnostics, origin: ready.origin, ready };
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

function recordSourceContract(reply, expectedFact, label) {
  assert.ok(String(reply.replyText || "").trim(), `${label} must return a non-empty governed answer`);
  assert.ok(Array.isArray(reply.matchedFacts), `${label} must expose matchedFacts`);
  if (expectedFact) {
    assert.ok(reply.matchedFacts.includes(expectedFact), `${label} must resolve ${expectedFact}`);
  }
  assert.equal(reply.thinkingMode, "disabled", `${label} must keep thinking disabled`);
  assert.equal(reply.thinkingExecuted, false, `${label} must not execute model thinking`);
  assert.ok(
    ["governed_planner", "safety_boundary"].includes(reply.generationSource),
    `${label} generation must remain under the governed planner or an explicit safety boundary`
  );
  assert.notEqual(reply.factSource, "local_ai", `${label} must keep model output outside the fact authority path`);
  assert.ok(reply.desktopEvidence, `${label} must include authenticated desktop runtime evidence`);
  assert.equal(reply.desktopEvidence.cloudRequestCount, 0, `${label} must make no cloud request`);
  assert.equal(reply.desktopEvidence.modelFactAuthority, false, `${label} must deny model fact authority`);
  if (expectedFact) {
    assert.equal(reply.desktopEvidence.ontologyApplied, true, `${label} must use the governed ontology`);
    assert.equal(reply.desktopEvidence.nineStateApplied, true, `${label} must use the nine-state fact model`);
    assert.equal(reply.desktopEvidence.answerPlannerApplied, true, `${label} must use the answer planner`);
  }
  if (realLocalAi) {
    assert.equal(reply.classificationSource, "local_ai", `${label} must invoke the local classifier`);
    assert.ok(["accepted", "rejected"].includes(reply.classifierStatus), `${label} classifier status must be truthful`);
    assert.equal(reply.providerConfigured, true, `${label} must report the configured loopback provider`);
    assert.equal(reply.providerHttpSuccess, true, `${label} must complete a real llama-server request`);
    assert.equal(reply.desktopEvidence.llamaServerReady, true, `${label} llama-server must be ready`);
    assert.equal(reply.desktopEvidence.localModelReady, true, `${label} Qwen model must be loaded`);
    if (reply.classifierStatus === "accepted") {
      assert.equal(reply.desktopEvidence.answerSource, "local_ai", `${label} accepted metadata must report local_ai`);
      assert.equal(reply.isFallback, false, `${label} accepted metadata must use the local route`);
      assert.equal(reply.provider, "local", `${label} accepted metadata must name the local provider`);
    } else {
      assert.equal(reply.desktopEvidence.answerSource, "rule_fallback", `${label} rejected metadata must fall back safely`);
      assert.equal(reply.isFallback, true, `${label} rejected metadata must identify fallback`);
      assert.equal(reply.provider, "rule", `${label} rejected metadata must use the governed rule answer`);
    }
  } else {
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
  if (reply.desktopEvidence.contextApplied) contextAppliedCount += 1;
}

async function askPatient(runtime, {
  caseId,
  language,
  attemptId,
  sessionId,
  question,
  expectedFact,
  conversationHistory,
  askedSlotIds,
  askedQuestions,
  label
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
      askedQuestions
    },
    idempotencyKey: id
  });
  recordSourceContract(result.payload, expectedFact, label);
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
      expectedFact: turn.expectedFact,
      conversationHistory,
      askedSlotIds,
      askedQuestions,
      label: `${caseId}/${language}/turn-${index + 1}`
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

const zhTurns = [
  { question: "哪里不舒服？", expectedFact: "chief_complaint" },
  { question: "多久了？", expectedFact: "hematuria_onset" },
  // P001's reconciled summary contains review-governed history, so its
  // student-collectable matchedFacts may intentionally remain empty.
  { question: "有没有其他疾病？", expectedFact: null },
  { question: "高血压吃什么药？", expectedFact: "medication_name" },
  { question: "怎么吃？", expectedFact: "medication_frequency" }
];

const enTurns = [
  { question: "What brings you in?", expectedFact: "chief_complaint" },
  { question: "How long has it been going on?", expectedFact: "hematuria_onset" },
  { question: "Do you have any other diseases?", expectedFact: null },
  { question: "What medicine do you take for high blood pressure?", expectedFact: "medication_name" },
  { question: "How do you take it?", expectedFact: "medication_frequency" }
];

const suffix = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const p001ZhAttemptId = `desktop-p001-zh-${suffix}`;
const p001EnAttemptId = `desktop-p001-en-${suffix}`;
const p003AttemptId = `desktop-p003-zh-${suffix}`;

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

  await askPatient(runtime, {
    caseId: "P001",
    language: "zh",
    attemptId: p001ZhAttemptId,
    sessionId: zhInterview.sessionId,
    question: "还有没有其他药？",
    expectedFact: "other_medications",
    conversationHistory: zhInterview.conversationHistory,
    askedSlotIds: zhInterview.askedSlotIds,
    askedQuestions: zhInterview.askedQuestions,
    label: "P001/zh/restored-session"
  });

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
      assert.equal(Number(state.currentStage), 2, `${row.attempt_id} must persist stage two`);
      assert.equal(
        (state.completedStages || []).filter((stage) => Number(stage) === 1).length,
        1,
        `${row.attempt_id} must persist one stage-one completion`
      );
      assert.ok(state.submissions?.history, `${row.attempt_id} must persist its history submission`);
    }
    const stageRequest = database.prepare(`
      SELECT COUNT(*) AS count
      FROM attempt_requests
      WHERE request_id = ?
    `).get(zhSubmission.requestId);
    assert.equal(Number(stageRequest?.count), 1, "rapid and restarted replays must occupy one idempotency record");
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
  if (realLocalAi) {
    assert.ok((answerSourceCounts.get("local_ai") || 0) > 0, "the real model run must accept at least one local classification");
    assert.ok(contextAppliedCount > 0, "the real model run must apply conversation context to a follow-up");
  } else {
    assert.ok((answerSourceCounts.get("rule_fallback") || 0) > 0, "the disabled model run must use rule_fallback");
  }
  const offlineEvidence = {
    llamaServerReady: finalRuntimeEvidence.llamaServerReady,
    localModelReady: finalRuntimeEvidence.localModelReady,
    answerSource: realLocalAi ? "local_ai" : "rule_fallback",
    cloudRequestCount: finalRuntimeEvidence.cloudRequestCount
  };
  process.stdout.write(`${JSON.stringify({
    status: "PASS",
    mode: realLocalAi ? "real_local_ai_offline" : "rule_fallback",
    stagedAppRoot: path.relative(repoRoot, appRoot).replaceAll("\\", "/"),
    ...(realLocalAi ? { model: manifest.model.fileName, modelSha256Verified: modelSha256 === manifest.model.sha256 } : {}),
    attempts: { p001Zh: "stage2", p001En: "stage2", p003ZeroRound: "stage2" },
    questions: zhTurns.length + enTurns.length,
    restoredSession: true,
    persistentIdempotency: true,
    contextAppliedCount,
    sources: sourceSummary,
    answerSources: answerSourceSummary,
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
