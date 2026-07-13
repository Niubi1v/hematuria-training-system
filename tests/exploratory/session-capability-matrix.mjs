import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.LLM_ENABLE_AI_AGENTS = "false";
process.env.LLM_ENABLE_AI_PATIENT = "false";
process.env.TRAINING_STATE_SECRET = randomBytes(48).toString("base64url");
process.env.TRAINING_DEPLOYMENT_TIER = "practice";
process.env.TRAINING_ATTEMPT_STORE_MODE = "memory";

const trainingHandler = require("../../api/training-action.js");
const sessionHandler = require("../../api/session/init.js");
const agentHandler = require("../../api/agent-chat.js");
const { resetMemoryAttemptStore } = require("../../server/trainingAttemptStore.js");
const { resetMemoryAgentRequestStore } = require("../../server/agentRequestStore.js");

const DEFAULT_REPORT = "artifacts/exploratory-qa/reports/session-capability-matrix.json";

function cliValue(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) || fallback;
}

async function invoke(handler, {
  id,
  body = {},
  headers = {},
  method = "POST",
  origin = "http://qa.local",
  includeIdempotency = true
}) {
  let statusCode = 200;
  let payload = {};
  const responseHeaders = {};
  const requestHeaders = {
    host: "qa.local",
    "x-forwarded-proto": "http",
    "x-request-id": `qa-${id}`,
    ...headers
  };
  if (origin) requestHeaders.origin = origin;
  if (includeIdempotency && !requestHeaders["x-idempotency-key"]) {
    requestHeaders["x-idempotency-key"] = `qa-${id}`;
  }
  const req = {
    method,
    body,
    headers: requestHeaders,
    socket: { remoteAddress: `qa-security-${id}` }
  };
  const res = {
    setHeader(name, value) { responseHeaders[String(name).toLowerCase()] = String(value); return this; },
    status(code) { statusCode = code; return this; },
    json(value) { payload = value || {}; return this; },
    end() { return this; }
  };
  await handler(req, res);
  return { statusCode, payload, headers: responseHeaders };
}

function safeError(result) {
  return String(result?.payload?.error || "").slice(0, 100);
}

function addCheck(checks, failures, {
  id,
  actual,
  expectedStatus,
  expectedError = "",
  predicate = () => true,
  failureKind = "contract_mismatch"
}) {
  const error = safeError(actual);
  const passed = actual.statusCode === expectedStatus
    && (!expectedError || error === expectedError)
    && predicate(actual);
  checks.push({ id, passed, statusCode: actual.statusCode, errorCode: error });
  if (!passed) {
    failures.push({
      id,
      kind: failureKind,
      expectedStatus,
      actualStatus: actual.statusCode,
      expectedError,
      actualError: error
    });
  }
}

async function createAuthorizedSession(label, { caseId = "P001", language = "zh", mode = "free" } = {}) {
  const attemptId = `qa-capability-${label}`;
  const attemptRequestId = `${attemptId}-attempt`;
  const training = await invoke(trainingHandler, {
    id: attemptRequestId,
    body: { action: "init-attempt", caseId, attemptId, mode, language, requestId: attemptRequestId }
  });
  const trainingState = String(training.headers["x-training-state"] || "");
  const sessionRequestId = `${attemptId}-session`;
  const session = await invoke(sessionHandler, {
    id: sessionRequestId,
    headers: { "x-training-state": trainingState },
    body: { caseId, attemptId, mode, language }
  });
  return {
    attemptId,
    caseId,
    language,
    mode,
    training,
    trainingState,
    session,
    sessionId: String(session.payload.sessionId || "")
  };
}

function agentBody(session, extra = {}) {
  return {
    sessionId: session.sessionId,
    attemptId: session.attemptId,
    caseId: session.caseId,
    language: session.language,
    mode: session.mode,
    sessionMode: session.mode,
    agentId: "standardized_patient",
    stage: "history",
    studentInput: "什么时候开始的？",
    conversationHistory: [],
    ...extra
  };
}

async function main() {
  const reportPath = path.resolve(cliValue("report", DEFAULT_REPORT));
  resetMemoryAttemptStore();
  resetMemoryAgentRequestStore();
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    throw new Error("QA capability matrix forbids provider calls");
  };

  const checks = [];
  const failures = [];
  try {
    const primary = await createAuthorizedSession("primary");
    addCheck(checks, failures, {
      id: "attempt_init_valid",
      actual: primary.training,
      expectedStatus: 200,
      predicate: () => Boolean(primary.trainingState)
    });
    addCheck(checks, failures, {
      id: "session_init_valid",
      actual: primary.session,
      expectedStatus: 200,
      predicate: ({ payload }) => Boolean(primary.sessionId)
        && !("completedPatientFacingProfile" in payload)
        && !("teacherOnlyData" in payload)
        && !("debug" in payload)
    });

    const repeatSession = await invoke(sessionHandler, {
      id: `${primary.attemptId}-session`,
      headers: { "x-training-state": primary.trainingState },
      body: {
        caseId: primary.caseId,
        attemptId: primary.attemptId,
        mode: primary.mode,
        language: primary.language
      }
    });
    addCheck(checks, failures, {
      id: "session_init_idempotent",
      actual: repeatSession,
      expectedStatus: 200,
      predicate: ({ payload }) => String(payload.sessionId || "") === primary.sessionId
    });

    const missingTrainingState = await invoke(sessionHandler, {
      id: "session-missing-training-state",
      body: { caseId: "P001", attemptId: "qa-missing-state", mode: "free", language: "zh" }
    });
    addCheck(checks, failures, {
      id: "session_missing_training_state",
      actual: missingTrainingState,
      expectedStatus: 401,
      expectedError: "invalid_attempt_token"
    });

    for (const [id, body, expectedStatus, expectedError] of [
      ["session_cross_language", { caseId: primary.caseId, attemptId: primary.attemptId, mode: primary.mode, language: "en" }, 409, "attempt_language_mismatch"],
      ["session_cross_mode", { caseId: primary.caseId, attemptId: primary.attemptId, mode: "osce", language: primary.language }, 409, "attempt_mode_mismatch"],
      ["session_cross_case", { caseId: "P002", attemptId: primary.attemptId, mode: primary.mode, language: primary.language }, 401, "attempt_case_mismatch"]
    ]) {
      const result = await invoke(sessionHandler, {
        id,
        headers: { "x-training-state": primary.trainingState },
        body
      });
      addCheck(checks, failures, { id, actual: result, expectedStatus, expectedError });
    }

    const missingCapability = await invoke(agentHandler, {
      id: "agent-missing-capability",
      body: { ...agentBody(primary), sessionId: "" }
    });
    addCheck(checks, failures, {
      id: "agent_missing_capability",
      actual: missingCapability,
      expectedStatus: 401,
      expectedError: "session_capability_required"
    });

    for (const [id, overrides, expectedError] of [
      ["agent_tampered_capability", { sessionId: `${primary.sessionId}tampered` }, "invalid_session_capability"],
      ["agent_cross_case", { caseId: "P002" }, "session_case_mismatch"],
      ["agent_cross_language", { language: "en" }, "session_language_mismatch"],
      ["agent_cross_mode", { mode: "osce", sessionMode: "osce" }, "session_mode_mismatch"],
      ["agent_cross_attempt", { attemptId: "qa-capability-other-attempt" }, "session_attempt_mismatch"]
    ]) {
      const result = await invoke(agentHandler, {
        id,
        body: agentBody(primary, overrides)
      });
      addCheck(checks, failures, {
        id,
        actual: result,
        expectedStatus: 401,
        expectedError
      });
    }

    const missingIdempotency = await invoke(agentHandler, {
      id: "agent-missing-idempotency",
      includeIdempotency: false,
      body: agentBody(primary)
    });
    addCheck(checks, failures, {
      id: "agent_missing_idempotency",
      actual: missingIdempotency,
      expectedStatus: 400,
      expectedError: "idempotency_key_required"
    });

    const stableBody = agentBody(primary, { studentInput: "哪里不舒服？" });
    const stableHeaders = { "x-idempotency-key": "qa-agent-stable" };
    const stableFirst = await invoke(agentHandler, {
      id: "agent-stable-first",
      headers: stableHeaders,
      body: stableBody
    });
    const stableRepeat = await invoke(agentHandler, {
      id: "agent-stable-repeat",
      headers: stableHeaders,
      body: stableBody
    });
    addCheck(checks, failures, {
      id: "agent_idempotent_repeat",
      actual: stableRepeat,
      expectedStatus: 200,
      predicate: () => stableFirst.statusCode === 200
        && JSON.stringify(stableFirst.payload) === JSON.stringify(stableRepeat.payload)
    });

    const conflictingReuse = await invoke(agentHandler, {
      id: "agent-stable-conflict",
      headers: stableHeaders,
      body: { ...stableBody, studentInput: "有没有血块？" }
    });
    addCheck(checks, failures, {
      id: "agent_idempotency_conflict",
      actual: conflictingReuse,
      expectedStatus: 409,
      expectedError: "idempotency_key_reused"
    });

    const concurrentBody = agentBody(primary, { studentInput: "有发热吗？" });
    const concurrentHeaders = { "x-idempotency-key": "qa-agent-concurrent" };
    const [concurrentFirst, concurrentSecond] = await Promise.all([
      invoke(agentHandler, { id: "agent-concurrent-first", headers: concurrentHeaders, body: concurrentBody }),
      invoke(agentHandler, { id: "agent-concurrent-second", headers: concurrentHeaders, body: concurrentBody })
    ]);
    addCheck(checks, failures, {
      id: "agent_concurrent_single_flight",
      actual: concurrentSecond,
      expectedStatus: 200,
      predicate: () => concurrentFirst.statusCode === 200
        && JSON.stringify(concurrentFirst.payload) === JSON.stringify(concurrentSecond.payload)
    });

    const expirySession = await createAuthorizedSession("expiry");
    const expiresAt = Date.parse(String(expirySession.session.payload.sessionExpiresAt || ""));
    const originalDateNow = Date.now;
    let expiredResult;
    try {
      Date.now = () => expiresAt + 1;
      expiredResult = await invoke(agentHandler, {
        id: "agent-expired-capability",
        body: agentBody(expirySession)
      });
    } finally {
      Date.now = originalDateNow;
    }
    addCheck(checks, failures, {
      id: "agent_expired_capability",
      actual: expiredResult,
      expectedStatus: 401,
      expectedError: "expired_session_capability"
    });

    const publicEnvelope = await invoke(agentHandler, {
      id: "agent-public-envelope",
      body: agentBody(primary, { studentInput: "以前吸烟吗？" })
    });
    addCheck(checks, failures, {
      id: "agent_public_envelope",
      actual: publicEnvelope,
      expectedStatus: 200,
      predicate: ({ payload }) => Array.isArray(payload.revealedDataKeys)
        && payload.revealedDataKeys.length === 0
        && !("completedPatientFacingProfile" in payload)
        && !("teacherOnlyData" in payload)
        && !("debug" in payload)
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  if (providerCalls !== 0) {
    failures.push({
      id: "provider_calls",
      kind: "unexpected_provider_call",
      expectedStatus: 0,
      actualStatus: providerCalls,
      expectedError: "",
      actualError: ""
    });
  }
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: "public-handler-local-security-no-provider",
    medicalTruthAdjudicated: false,
    sensitiveValuesRecorded: false,
    checks: checks.length,
    providerCalls,
    result: { passed: failures.length === 0, failures: failures.length },
    checksSummary: checks,
    failures
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    report: path.relative(process.cwd(), reportPath),
    checks: report.checks,
    providerCalls,
    ...report.result
  }));
  if (failures.length) process.exitCode = 1;
}

await main();
