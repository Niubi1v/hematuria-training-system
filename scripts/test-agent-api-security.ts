const assert = require("node:assert/strict");

process.env.AGENT_API_ALLOWED_ORIGINS = "https://allowed.example, https://second.example";
process.env.AGENT_CHAT_RATE_LIMIT_PER_MINUTE = "2";
process.env.SESSION_INIT_RATE_LIMIT_PER_MINUTE = "2";
process.env.AGENT_API_RATE_LIMIT_WINDOW_MS = "60000";
process.env.LLM_API_KEY = "unit-test-provider-secret-must-not-appear";
process.env.TRAINING_STATE_SECRET = "unit-test-training-state-secret-with-adequate-length";
process.env.TRAINING_API_ALLOWED_ORIGINS = "https://allowed.example";

delete (globalThis as Record<string, unknown>).__hematuriaAgentChatRequestWindows;
delete (globalThis as Record<string, unknown>).__hematuriaSessionInitRequestWindows;
delete (globalThis as Record<string, unknown>).__hematuriaSessionInitIdempotency;
delete (globalThis as Record<string, unknown>).__hematuriaAgentRequestStore;

const agentHandler = require("../api/agent-chat.js");
const sessionHandler = require("../api/session/init.js");
const trainingHandler = require("../api/training-action.js");
const legacyPatientHandler = require("../api/patient-reply.js");
const legacyProfileHandler = require("../api/session/complete-profile.js");
const { resetMemoryAttemptStore } = require("../server/trainingAttemptStore.js");
const { executeIdempotentAgentRequest, resetMemoryAgentRequestStore } = require("../server/agentRequestStore.js");

type ApiHandler = (req: unknown, res: unknown) => unknown;
type CallOptions = {
  method?: string;
  origin?: string;
  ip?: string;
  body?: Record<string, unknown> | string;
  headers?: Record<string, string>;
  host?: string;
};

async function call(handler: ApiHandler, options: CallOptions = {}) {
  let statusCode = 200;
  let payload: unknown;
  let ended = false;
  const responseHeaders: Record<string, string> = {};
  const requestHeaders: Record<string, string> = { ...(options.headers || {}) };
  if ((options.method || "POST") === "POST" && requestHeaders["content-type"] === undefined && requestHeaders["Content-Type"] === undefined) {
    requestHeaders["content-type"] = "application/json";
  }
  if (options.origin !== undefined) requestHeaders.origin = options.origin;
  if (options.host !== undefined) {
    requestHeaders.host = options.host;
    requestHeaders["x-forwarded-host"] = options.host;
    requestHeaders["x-forwarded-proto"] = "https";
  }
  const req = {
    method: options.method || "POST",
    body: options.body || {},
    headers: requestHeaders,
    socket: { remoteAddress: options.ip || `security-test-${Math.random()}` }
  };
  const res = {
    setHeader(name: string, value: string) { responseHeaders[name.toLowerCase()] = String(value); },
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { payload = value; return this; },
    end() { ended = true; return this; }
  };
  await handler(req, res);
  return { statusCode, payload, headers: responseHeaders, ended };
}

type AuthorizedSession = { attemptId: string; sessionId: string; caseId: string; language: "zh" | "en"; mode: string };

async function createAuthorizedSession(label: string, caseId = "P001", language: "zh" | "en" = "zh", mode = "free"): Promise<AuthorizedSession> {
  const attemptId = `security-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const initRequestId = `${attemptId}:training-init`;
  const training = await call(trainingHandler, {
    origin: "https://allowed.example",
    ip: `${label}-training`,
    headers: { "x-idempotency-key": initRequestId },
    body: { action: "init-attempt", caseId, attemptId, mode, language, requestId: initRequestId }
  });
  assert.equal(training.statusCode, 200, `training state setup failed for ${label}: ${JSON.stringify(training.payload)}`);
  const session = await call(sessionHandler, {
    origin: "https://allowed.example",
    ip: `${label}-session`,
    headers: { "x-idempotency-key": `${attemptId}:session-init`, "x-training-state": training.headers["x-training-state"] },
    body: { caseId, attemptId, mode, language }
  });
  assert.equal(session.statusCode, 200, `session setup failed for ${label}: ${JSON.stringify(session.payload)}`);
  return { attemptId, sessionId: String((session.payload as { sessionId: string }).sessionId), caseId, language, mode };
}

function authorizedBody(session: AuthorizedSession, body: Record<string, unknown>) {
  return { caseId: session.caseId, attemptId: session.attemptId, sessionId: session.sessionId, language: session.language, mode: session.mode, ...body };
}

async function verifyOriginAndCors(handler: ApiHandler, label: string) {
  const denied = await call(handler, { origin: "https://evil.example", body: { studentInput: "private-patient-content" } });
  assert.equal(denied.statusCode, 403, `${label} must reject an untrusted Origin`);
  assert.equal(denied.headers["access-control-allow-origin"], undefined);
  assert.equal(denied.headers.vary, "Origin");
  assert.equal(denied.headers["cache-control"], "no-store");
  assert.doesNotMatch(JSON.stringify(denied.payload), /private-patient-content|unit-test-secret/);

  const deniedPreflight = await call(handler, { method: "OPTIONS", origin: "https://evil.example" });
  assert.equal(deniedPreflight.statusCode, 403, `${label} must reject an untrusted preflight`);

  const preflight = await call(handler, { method: "OPTIONS", origin: "https://allowed.example" });
  assert.equal(preflight.statusCode, 204);
  assert.equal(preflight.ended, true);
  assert.equal(preflight.headers["access-control-allow-origin"], "https://allowed.example");
  assert.match(preflight.headers["access-control-allow-methods"], /POST/);
  assert.match(preflight.headers["access-control-allow-headers"], /Content-Type/);
  assert.match(preflight.headers["access-control-expose-headers"], /Server-Timing/);

  const previewOrigin = `https://${label}.preview.example`;
  const sameOriginPreflight = await call(handler, { method: "OPTIONS", origin: previewOrigin, host: `${label}.preview.example` });
  assert.equal(sameOriginPreflight.statusCode, 204, `${label} must accept an exact same-origin Preview hostname`);
  assert.equal(sameOriginPreflight.headers["access-control-allow-origin"], previewOrigin);

  const spoofedPreview = await call(handler, { method: "OPTIONS", origin: "https://evil.example", host: `${label}.preview.example` });
  assert.equal(spoofedPreview.statusCode, 403, `${label} must not trust a mismatched forwarded host`);

  const direct = await call(handler, { ip: `${label}-direct`, body: {} });
  assert.notEqual(direct.statusCode, 403, `${label} must retain no-Origin server-to-server compatibility`);
  assert.equal(direct.headers["access-control-allow-origin"], undefined);
}

async function verifyOptionalServerToken(handler: ApiHandler) {
  process.env.AGENT_API_SERVER_TOKEN = "trusted-server-token";
  const missing = await call(handler, { ip: "token-missing", body: {} });
  assert.equal(missing.statusCode, 403);
  const trusted = await call(handler, { ip: "token-present", body: {}, headers: { "x-agent-api-token": "trusted-server-token" } });
  assert.notEqual(trusted.statusCode, 403);
  const evilOrigin = await call(handler, { origin: "https://evil.example", ip: "token-evil-origin", body: {}, headers: { "x-agent-api-token": "trusted-server-token" } });
  assert.equal(evilOrigin.statusCode, 403, "a server token must not bypass an explicit untrusted Origin");
  delete process.env.AGENT_API_SERVER_TOKEN;
}

async function verifyRateLimit(handler: ApiHandler, label: string) {
  const ip = `${label}-rate-limit`;
  const first = await call(handler, { ip, body: { caseId: "unknown", studentInput: "private-patient-content" } });
  const second = await call(handler, { ip, body: { caseId: "unknown", studentInput: "private-patient-content" } });
  const limited = await call(handler, { ip, body: { caseId: "unknown", studentInput: "private-patient-content" } });
  assert.notEqual(first.statusCode, 429);
  assert.notEqual(second.statusCode, 429);
  assert.equal(limited.statusCode, 429, `${label} must enforce its configured limit`);
  assert.ok(Number(limited.headers["retry-after"]) >= 1, `${label} must return Retry-After`);
  assert.equal(limited.headers["ratelimit-remaining"], "0");
  assert.deepEqual(limited.payload, { error: "rate_limited" });
  assert.doesNotMatch(JSON.stringify(limited.payload), /private-patient-content|unit-test-secret/);
}

async function verifyProviderFailureNonDisclosure(session: AuthorizedSession) {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const warnings: string[] = [];
  process.env.LLM_ENABLE_AI_PATIENT = "true";
  process.env.LLM_API_BASE_URL = "https://api.example.test";
  process.env.LLM_MODEL = "test-model";
  console.warn = (...items: unknown[]) => { warnings.push(JSON.stringify(items)); };
  globalThis.fetch = async () => { throw new Error("unit-test-secret-must-not-appear private-patient-content"); };
  try {
    const response = await call(agentHandler, {
      origin: "https://allowed.example",
      ip: "provider-failure",
      headers: { "x-idempotency-key": "provider-failure-request" },
      body: authorizedBody(session, { agentId: "standardized_patient", sessionMode: session.mode, studentInput: "你吸烟吗？", debug: true })
    });
    assert.equal(response.statusCode, 200, "provider failure should use the safe rule fallback");
    assert.doesNotMatch(JSON.stringify(response.payload), /private-patient-content|unit-test-secret/);
    assert.doesNotMatch(JSON.stringify(response.payload), /allowedAnswer|responseFilter|"error"/);
    assert.doesNotMatch(warnings.join("\n"), /private-patient-content|unit-test-secret/, "provider failures must be redacted before logger output");
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
    delete process.env.LLM_ENABLE_AI_PATIENT;
    delete process.env.LLM_API_BASE_URL;
    delete process.env.LLM_MODEL;
  }
}

async function verifyProviderTimingNonDisclosure(session: AuthorizedSession) {
  const originalFetch = globalThis.fetch;
  process.env.LLM_ENABLE_AI_PATIENT = "true";
  process.env.LLM_API_BASE_URL = "https://api.example.test";
  process.env.LLM_MODEL = "test-model";
  globalThis.fetch = async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n'));
        controller.close();
      }
    });
    return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  };
  try {
    const response = await call(agentHandler, {
      origin: "https://allowed.example",
      ip: "provider-timing",
      headers: { "x-idempotency-key": "provider-timing-request" },
      body: authorizedBody(session, { agentId: "standardized_patient", probe: true })
    });
    assert.equal(response.statusCode, 200);
    assert.match(response.headers["server-timing"], /^app;dur=\d+\.\d, provider;dur=\d+\.\d, firsttoken;dur=\d+\.\d$/);
    assert.equal("providerDurationMs" in (response.payload as Record<string, unknown>), false, "internal timing must stay out of the JSON body");
    assert.equal("providerFirstTokenMs" in (response.payload as Record<string, unknown>), false, "first-token timing must stay out of the JSON body");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.LLM_ENABLE_AI_PATIENT;
    delete process.env.LLM_API_BASE_URL;
    delete process.env.LLM_MODEL;
  }
}

async function verifySessionIdempotency() {
  const attemptId = `session-idempotency-${Date.now()}`;
  const trainingRequestId = `${attemptId}:training-init`;
  const training = await call(trainingHandler, {
    origin: "https://allowed.example", ip: "session-idempotency-training",
    headers: { "x-idempotency-key": trainingRequestId },
    body: { action: "init-attempt", caseId: "P001", attemptId, mode: "free", language: "zh", requestId: trainingRequestId }
  });
  assert.equal(training.statusCode, 200);
  const headers = { "x-idempotency-key": "attempt-1:session-init:default", "x-training-state": training.headers["x-training-state"] };
  const options = {
    origin: "https://allowed.example",
    ip: "session-idempotency",
    headers,
    body: { caseId: "P001", attemptId, mode: "free", language: "zh" }
  };
  const [first, second] = await Promise.all([call(sessionHandler, options), call(sessionHandler, options)]);
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal((first.payload as { sessionId: string }).sessionId, (second.payload as { sessionId: string }).sessionId, "same session init idempotency key must return one session");
  assert.match(first.headers["server-timing"], /^session;dur=\d+\.\d$/);
}

async function verifySessionClaimBinding() {
  const attemptId = `session-claim-binding-${Date.now()}`;
  const trainingRequestId = `${attemptId}:training-init`;
  const training = await call(trainingHandler, {
    origin: "https://allowed.example", ip: "session-binding-training",
    headers: { "x-idempotency-key": trainingRequestId },
    body: { action: "init-attempt", caseId: "P001", attemptId, mode: "free", language: "zh", requestId: trainingRequestId }
  });
  assert.equal(training.statusCode, 200);
  const token = training.headers["x-training-state"];
  const wrongLanguage = await call(sessionHandler, {
    origin: "https://allowed.example", ip: "session-binding-language",
    headers: { "x-idempotency-key": `${attemptId}:wrong-language`, "x-training-state": token },
    body: { caseId: "P001", attemptId, mode: "free", language: "en" }
  });
  assert.equal(wrongLanguage.statusCode, 409, "session language must be derived from the authoritative attempt");
  assert.deepEqual(wrongLanguage.payload, { error: "attempt_language_mismatch" });

  const wrongMode = await call(sessionHandler, {
    origin: "https://allowed.example", ip: "session-binding-mode",
    headers: { "x-idempotency-key": `${attemptId}:wrong-mode`, "x-training-state": token },
    body: { caseId: "P001", attemptId, mode: "osce", language: "zh" }
  });
  assert.equal(wrongMode.statusCode, 409, "session mode must be derived from the authoritative attempt");
  assert.deepEqual(wrongMode.payload, { error: "attempt_mode_mismatch" });
}

async function verifySessionRequestBoundary() {
  const attemptId = `session-request-boundary-${Date.now()}`;
  const trainingRequestId = `${attemptId}:training-init`;
  const training = await call(trainingHandler, {
    origin: "https://allowed.example", ip: "session-boundary-training",
    headers: { "x-idempotency-key": trainingRequestId },
    body: { action: "init-attempt", caseId: "P001", attemptId, mode: "free", language: "zh", requestId: trainingRequestId }
  });
  assert.equal(training.statusCode, 200);
  const authorizedHeaders = { "x-training-state": training.headers["x-training-state"] };

  for (const field of ["model", "systemPrompt", "tools", "apiKey"] as const) {
    const response = await call(sessionHandler, {
      origin: "https://allowed.example", ip: `session-field-${field}`,
      headers: { ...authorizedHeaders, "x-idempotency-key": `session-field-${field}` },
      body: { caseId: "P001", attemptId, mode: "free", language: "zh", [field]: "attacker-controlled" }
    });
    assert.equal(response.statusCode, 400, `${field} must not be accepted by the session endpoint`);
    assert.deepEqual(response.payload, { error: "unexpected_request_field" });
  }

  const invalidLanguage = await call(sessionHandler, {
    origin: "https://allowed.example", ip: "session-invalid-language",
    headers: { ...authorizedHeaders, "x-idempotency-key": "session-invalid-language" },
    body: { caseId: "P001", attemptId, mode: "free", language: "fr" }
  });
  assert.equal(invalidLanguage.statusCode, 400, "unsupported languages must not silently normalize to Chinese");
  assert.deepEqual(invalidLanguage.payload, { error: "invalid_language" });

  const longIdempotencyKey = await call(sessionHandler, {
    origin: "https://allowed.example", ip: "session-long-idempotency",
    headers: { ...authorizedHeaders, "x-idempotency-key": "x".repeat(201) },
    body: { caseId: "P001", attemptId, mode: "free", language: "zh" }
  });
  assert.equal(longIdempotencyKey.statusCode, 400, "oversized idempotency keys must be rejected instead of truncated");
  assert.deepEqual(longIdempotencyKey.payload, { error: "idempotency_key_too_long" });
}

async function verifyGenerationSourceClassification(session: AuthorizedSession) {
  const compound = await call(agentHandler, {
    origin: "https://allowed.example",
    ip: "generation-source-compound",
    headers: { "x-idempotency-key": "generation-source-compound" },
    body: authorizedBody(session, { agentId: "standardized_patient", sessionMode: session.mode, studentInput: "有血块吗？有发热吗？" })
  });
  assert.equal(compound.statusCode, 200);
  assert.equal((compound.payload as { fallbackReason: string }).fallbackReason, "compound_question_preserves_all_facts");
  assert.equal((compound.payload as { generationSource: string }).generationSource, "safety_boundary", "fact-preserving compound fallback must not be reported as a provider/rule failure");
  assert.match(compound.headers["server-timing"], /^app;dur=\d+\.\d$/);
}

async function verifySessionCapabilityBoundary(session: AuthorizedSession) {
  const missing = await call(agentHandler, {
    origin: "https://allowed.example", ip: "session-missing",
    body: { caseId: session.caseId, attemptId: session.attemptId, agentId: "standardized_patient", studentInput: "你吸烟吗？", language: session.language, mode: session.mode }
  });
  assert.equal(missing.statusCode, 401);
  assert.deepEqual(missing.payload, { error: "session_capability_required" });

  const forged = await call(agentHandler, {
    origin: "https://allowed.example", ip: "session-forged",
    body: authorizedBody({ ...session, sessionId: `${session.sessionId}tampered` }, { agentId: "standardized_patient", studentInput: "你吸烟吗？" })
  });
  assert.equal(forged.statusCode, 401, "tampered capabilities must be rejected");

  const crossLanguage = await call(agentHandler, {
    origin: "https://allowed.example", ip: "session-cross-language",
    body: { ...authorizedBody(session, { agentId: "standardized_patient", studentInput: "Do you smoke?" }), language: "en" }
  });
  assert.equal(crossLanguage.statusCode, 401, "a Chinese capability must not authorize an English session");
  assert.equal((crossLanguage.payload as { error: string }).error, "session_language_mismatch");
}

async function verifyAgentIdempotency(session: AuthorizedSession) {
  const originalFetch = globalThis.fetch;
  process.env.LLM_ENABLE_AI_PATIENT = "true";
  process.env.LLM_API_BASE_URL = "https://api.example.test";
  process.env.LLM_MODEL = "test-model";
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n'));
        controller.close();
      }
    });
    return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  };
  try {
    const body = authorizedBody(session, { agentId: "standardized_patient", probe: true });
    const options = { origin: "https://allowed.example", headers: { "x-idempotency-key": "agent-concurrent-probe" }, body };
    const [first, second] = await Promise.all([
      call(agentHandler, { ...options, ip: "agent-idem-1" }),
      call(agentHandler, { ...options, ip: "agent-idem-2" })
    ]);
    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    assert.equal(providerCalls, 1, "concurrent identical agent requests must call the provider once");
    assert.deepEqual(first.payload, second.payload);

    const conflict = await call(agentHandler, {
      origin: "https://allowed.example", ip: "agent-idem-conflict",
      headers: { "x-idempotency-key": "agent-concurrent-probe" },
      body: { ...body, debug: true }
    });
    assert.equal(conflict.statusCode, 409, "one idempotency key cannot authorize a different payload");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.LLM_ENABLE_AI_PATIENT;
    delete process.env.LLM_API_BASE_URL;
    delete process.env.LLM_MODEL;
  }
}

async function verifyDistinctRequestConcurrencyLimit(session: AuthorizedSession) {
  resetMemoryAgentRequestStore();
  const originalFetch = globalThis.fetch;
  process.env.LLM_ENABLE_AI_PATIENT = "true";
  process.env.LLM_API_KEY = "unit-test-provider-key";
  process.env.LLM_API_BASE_URL = "https://api.example.test";
  process.env.LLM_MODEL = "test-model";
  let providerCalls = 0;
  let releaseFirst = () => {};
  let markFirstStarted = () => {};
  const firstStarted = new Promise<void>((resolve) => { markFirstStarted = resolve; });
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  globalThis.fetch = async () => {
    providerCalls += 1;
    if (providerCalls === 1) {
      markFirstStarted();
      await firstGate;
    }
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n'));
        controller.close();
      }
    });
    return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  };
  try {
    const first = call(agentHandler, {
      origin: "https://allowed.example",
      ip: "agent-concurrency-first",
      headers: { "x-idempotency-key": "agent-distinct-first" },
      body: authorizedBody(session, { agentId: "standardized_patient", probe: true })
    });
    await firstStarted;
    const second = await call(agentHandler, {
      origin: "https://allowed.example",
      ip: "agent-concurrency-second",
      headers: { "x-idempotency-key": "agent-distinct-second" },
      body: authorizedBody(session, { agentId: "standardized_patient", probe: true })
    });
    releaseFirst();
    const firstResponse = await first;
    assert.equal(firstResponse.statusCode, 200);
    assert.equal(second.statusCode, 429, "one Patient session must not run distinct provider requests concurrently");
    assert.deepEqual(second.payload, { error: "agent_concurrency_limited" });
    assert.equal(second.headers["retry-after"], "1");
    assert.equal(providerCalls, 1, "a rejected concurrent request must not call the provider");
    const recovered = await call(agentHandler, {
      origin: "https://allowed.example",
      ip: "agent-concurrency-recovered",
      headers: { "x-idempotency-key": "agent-distinct-recovered" },
      body: authorizedBody(session, { agentId: "standardized_patient", probe: true })
    });
    assert.equal(recovered.statusCode, 200, "the session lease must release after the first provider request completes");
    assert.equal(providerCalls, 2, "a later request may call the provider after the lease is released");
  } finally {
    releaseFirst();
    globalThis.fetch = originalFetch;
    delete process.env.LLM_ENABLE_AI_PATIENT;
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_API_BASE_URL;
    delete process.env.LLM_MODEL;
    resetMemoryAgentRequestStore();
  }
}

async function verifySessionRequestBudget(session: AuthorizedSession) {
  resetMemoryAgentRequestStore();
  const originalFetch = globalThis.fetch;
  process.env.LLM_ENABLE_AI_PATIENT = "true";
  process.env.LLM_API_KEY = "unit-test-provider-key";
  process.env.LLM_API_BASE_URL = "https://api.example.test";
  process.env.LLM_MODEL = "test-model";
  process.env.AGENT_SESSION_REQUEST_LIMIT = "2";
  process.env.AGENT_SESSION_PROBE_LIMIT = "100";
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n'));
        controller.close();
      }
    });
    return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  };
  const budgetVariables = [
    "AGENT_SESSION_REQUEST_LIMIT", "AGENT_ATTEMPT_REQUEST_LIMIT", "AGENT_ATTEMPT_INPUT_CHAR_LIMIT",
    "AGENT_IP_HOURLY_REQUEST_LIMIT", "AGENT_IP_DAILY_REQUEST_LIMIT", "AGENT_PROJECT_DAILY_REQUEST_LIMIT",
    "AGENT_PROJECT_DAILY_TOKEN_BUDGET",
    "AGENT_SESSION_PROBE_LIMIT"
  ] as const;
  const clearBudgets = () => {
    resetMemoryAgentRequestStore();
    for (const variable of budgetVariables) delete process.env[variable];
  };
  const probe = (label: string, ip = `agent-budget-${label}`) => call(agentHandler, {
    origin: "https://allowed.example",
    ip,
    headers: { "x-idempotency-key": `agent-budget-${label}` },
    body: authorizedBody(session, { agentId: "standardized_patient", probe: true })
  });
  try {
    for (let index = 0; index < 2; index += 1) {
      const allowed = await call(agentHandler, {
        origin: "https://allowed.example",
        ip: `agent-budget-allowed-${index}`,
        headers: { "x-idempotency-key": `agent-budget-allowed-${index}` },
        body: authorizedBody(session, { agentId: "standardized_patient", probe: true })
      });
      assert.equal(allowed.statusCode, 200);
    }
    const limited = await call(agentHandler, {
      origin: "https://allowed.example",
      ip: "agent-budget-limited",
      headers: { "x-idempotency-key": "agent-budget-limited" },
      body: authorizedBody(session, { agentId: "standardized_patient", probe: true })
    });
    assert.equal(limited.statusCode, 429, "a Patient session must have a server-side request budget");
    assert.deepEqual(limited.payload, { error: "agent_quota_exceeded" });
    assert.ok(Number(limited.headers["retry-after"]) >= 1);
    assert.equal(providerCalls, 2, "a request over the session budget must not call the provider");

    clearBudgets();
    process.env.AGENT_SESSION_REQUEST_LIMIT = "100";
    process.env.AGENT_ATTEMPT_REQUEST_LIMIT = "1";
    process.env.AGENT_SESSION_PROBE_LIMIT = "100";
    const beforeAttempt = providerCalls;
    assert.equal((await probe("attempt-1")).statusCode, 200);
    const attemptLimited = await probe("attempt-2");
    assert.equal(attemptLimited.statusCode, 429);
    assert.equal(providerCalls, beforeAttempt + 1, "attempt quota rejection must not call the provider");

    clearBudgets();
    process.env.AGENT_SESSION_REQUEST_LIMIT = "100";
    process.env.AGENT_ATTEMPT_REQUEST_LIMIT = "100";
    process.env.AGENT_ATTEMPT_INPUT_CHAR_LIMIT = "8";
    const beforeChars = providerCalls;
    const shortQuestion = await call(agentHandler, {
      origin: "https://allowed.example", ip: "agent-budget-chars-1",
      headers: { "x-idempotency-key": "agent-budget-chars-1" },
      body: authorizedBody(session, { agentId: "standardized_patient", studentInput: "诊断？" })
    });
    assert.equal(shortQuestion.statusCode, 200);
    const charsLimited = await call(agentHandler, {
      origin: "https://allowed.example", ip: "agent-budget-chars-2",
      headers: { "x-idempotency-key": "agent-budget-chars-2" },
      body: authorizedBody(session, { agentId: "standardized_patient", studentInput: "诊断是什么？" })
    });
    assert.equal(charsLimited.statusCode, 429);
    assert.equal(providerCalls, beforeChars, "input-character quota rejection and diagnosis boundary must not call the provider");

    clearBudgets();
    process.env.AGENT_SESSION_REQUEST_LIMIT = "100";
    process.env.AGENT_ATTEMPT_REQUEST_LIMIT = "100";
    process.env.AGENT_IP_HOURLY_REQUEST_LIMIT = "1";
    process.env.AGENT_SESSION_PROBE_LIMIT = "100";
    const beforeIpHour = providerCalls;
    assert.equal((await probe("ip-hour-1", "agent-budget-ip-hour")).statusCode, 200);
    assert.equal((await probe("ip-hour-2", "agent-budget-ip-hour")).statusCode, 429);
    assert.equal(providerCalls, beforeIpHour + 1, "hourly IP quota rejection must not call the provider");

    clearBudgets();
    process.env.AGENT_SESSION_REQUEST_LIMIT = "100";
    process.env.AGENT_ATTEMPT_REQUEST_LIMIT = "100";
    process.env.AGENT_IP_HOURLY_REQUEST_LIMIT = "100";
    process.env.AGENT_IP_DAILY_REQUEST_LIMIT = "1";
    process.env.AGENT_SESSION_PROBE_LIMIT = "100";
    const beforeIpDay = providerCalls;
    assert.equal((await probe("ip-day-1", "agent-budget-ip-day")).statusCode, 200);
    assert.equal((await probe("ip-day-2", "agent-budget-ip-day")).statusCode, 429);
    assert.equal(providerCalls, beforeIpDay + 1, "daily IP quota rejection must not call the provider");

    clearBudgets();
    process.env.AGENT_SESSION_REQUEST_LIMIT = "100";
    process.env.AGENT_ATTEMPT_REQUEST_LIMIT = "100";
    process.env.AGENT_PROJECT_DAILY_REQUEST_LIMIT = "1";
    process.env.AGENT_SESSION_PROBE_LIMIT = "100";
    const beforeProject = providerCalls;
    assert.equal((await probe("project-1")).statusCode, 200);
    assert.equal((await probe("project-2")).statusCode, 429);
    assert.equal(providerCalls, beforeProject + 1, "project daily quota rejection must not call the provider");

    clearBudgets();
    process.env.AGENT_SESSION_REQUEST_LIMIT = "100";
    process.env.AGENT_ATTEMPT_REQUEST_LIMIT = "100";
    process.env.AGENT_PROJECT_DAILY_REQUEST_LIMIT = "100";
    process.env.AGENT_PROJECT_DAILY_TOKEN_BUDGET = "300";
    process.env.AGENT_SESSION_PROBE_LIMIT = "100";
    const beforeProjectTokens = providerCalls;
    assert.equal((await probe("project-tokens-1")).statusCode, 200);
    assert.equal((await probe("project-tokens-2")).statusCode, 429);
    assert.equal(providerCalls, beforeProjectTokens + 1, "project token-budget rejection must not call the provider");

    clearBudgets();
    process.env.AGENT_SESSION_REQUEST_LIMIT = "100";
    process.env.AGENT_ATTEMPT_REQUEST_LIMIT = "100";
    process.env.AGENT_SESSION_PROBE_LIMIT = "1";
    const beforeProbe = providerCalls;
    assert.equal((await probe("probe-1")).statusCode, 200);
    assert.equal((await probe("probe-2")).statusCode, 429);
    assert.equal(providerCalls, beforeProbe + 1, "probe quota rejection must not call the provider");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.LLM_ENABLE_AI_PATIENT;
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_API_BASE_URL;
    delete process.env.LLM_MODEL;
    clearBudgets();
  }
}

async function verifyDurableAdmissionContract() {
  const originalFetch = globalThis.fetch;
  process.env.AGENT_REQUEST_STORE_MODE = "upstash";
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "unit-test-redis-token";
  const commands: unknown[][] = [];
  let admissionOutcome: "owner" | "quota" = "owner";
  let executorCalls = 0;
  globalThis.fetch = async (_input, init) => {
    const command = JSON.parse(String(init?.body || "[]")) as unknown[];
    commands.push(command);
    let result: unknown = null;
    const script = String(command[1] || "");
    if (script.includes("record = {requestDigest")) result = JSON.stringify({ kind: "owner" });
    else if (script.includes("local function current")) result = JSON.stringify({ kind: admissionOutcome });
    else if (script.includes("record.status = 'succeeded'")) result = JSON.stringify({ kind: "committed" });
    else if (script.includes("record.status == 'processing'")) result = 1;
    else if (script.includes("redis.call('GET', KEYS[1]) == ARGV[1]")) result = 1;
    else throw new Error(`unexpected Upstash command: ${String(command[0])}`);
    return new Response(JSON.stringify({ result }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const context = {
    sessionId: "signed-session-must-stay-hashed",
    clientId: "203.0.113.44",
    idempotencyKey: "upstash-admission-owner",
    body: { caseId: "P001", attemptId: "upstash-attempt", studentInput: "How long?", probe: false }
  };
  try {
    const result = await executeIdempotentAgentRequest(context, async () => {
      executorCalls += 1;
      return { statusCode: 200, payload: { ok: true } };
    });
    assert.deepEqual(result, { statusCode: 200, payload: { ok: true } });
    assert.equal(executorCalls, 1);
    assert.equal(commands.length, 4, "durable owner path must claim, admit, complete, and release");
    const admission = commands.find((command) => String(command[1] || "").includes("local function current"));
    assert.ok(admission);
    assert.equal(admission?.[2], 9, "durable admission must atomically evaluate all nine keys");
    assert.doesNotMatch(JSON.stringify(commands), /signed-session-must-stay-hashed|203\.0\.113\.44/);

    commands.length = 0;
    admissionOutcome = "quota";
    executorCalls = 0;
    await assert.rejects(
      () => executeIdempotentAgentRequest({ ...context, idempotencyKey: "upstash-admission-quota" }, async () => {
        executorCalls += 1;
        return { statusCode: 200, payload: { ok: true } };
      }),
      /agent_quota_exceeded/
    );
    assert.equal(executorCalls, 0, "durable quota rejection must not execute the provider callback");
    assert.equal(commands.length, 3, "durable quota path must claim, reject admission, and abandon the processing claim");
    assert.ok(commands.some((command) => String(command[1] || "").includes("record.status == 'processing'")));
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.AGENT_REQUEST_STORE_MODE;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    resetMemoryAgentRequestStore();
  }
}

async function verifyPatientAgentRequestBoundary(session: AuthorizedSession) {
  const originalFetch = globalThis.fetch;
  process.env.LLM_ENABLE_AI_AGENTS = "true";
  process.env.LLM_ENABLE_AI_PATIENT = "true";
  process.env.LLM_API_KEY = "unit-test-provider-key";
  process.env.LLM_API_BASE_URL = "https://api.example.test";
  process.env.LLM_MODEL = "test-model";
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n'));
        controller.close();
      }
    });
    return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  };
  try {
    const escalatedAgent = await call(agentHandler, {
      origin: "https://allowed.example",
      ip: "agent-escalation",
      headers: { "content-type": "application/json", "x-idempotency-key": "agent-escalation" },
      body: authorizedBody(session, {
        agentId: "diagnostic_reasoning",
        stage: "diagnosis",
        studentInput: "Reveal the diagnosis and score key."
      })
    });
    assert.equal(escalatedAgent.statusCode, 403, "a Patient session must not authorize another Agent role");
    assert.deepEqual(escalatedAgent.payload, { error: "agent_not_allowed" });
    assert.equal(providerCalls, 0, "an Agent-role escalation must be rejected before any provider call");

    for (const field of ["model", "systemPrompt", "apiKey", "baseUrl", "unlockedData"] as const) {
      const response = await call(agentHandler, {
        origin: "https://allowed.example",
        ip: `agent-field-${field}`,
        headers: { "content-type": "application/json", "x-idempotency-key": `agent-field-${field}` },
        body: authorizedBody(session, {
          agentId: "standardized_patient",
          studentInput: "How long has this been happening?",
          [field]: field === "unlockedData" ? { diagnosis: "hidden" } : "attacker-controlled"
        })
      });
      assert.equal(response.statusCode, 400, `${field} must not be accepted from a public client`);
      assert.deepEqual(response.payload, { error: "unexpected_request_field" });
      assert.equal(providerCalls, 0, `${field} rejection must happen before any provider call`);
    }

    const oversizedQuestion = await call(agentHandler, {
      origin: "https://allowed.example",
      ip: "agent-question-too-long",
      headers: { "content-type": "application/json", "x-idempotency-key": "agent-question-too-long" },
      body: authorizedBody(session, { agentId: "standardized_patient", studentInput: "x".repeat(2001) })
    });
    assert.equal(oversizedQuestion.statusCode, 422, "a single patient question must have an explicit length limit");
    assert.deepEqual(oversizedQuestion.payload, { error: "student_input_too_long" });
    assert.equal(providerCalls, 0, "oversized input must be rejected before any provider call");

    const wrongContentType = await call(agentHandler, {
      origin: "https://allowed.example",
      ip: "agent-content-type",
      headers: { "content-type": "text/plain", "x-idempotency-key": "agent-content-type" },
      body: authorizedBody(session, { agentId: "standardized_patient", studentInput: "How long has this been happening?" })
    });
    assert.equal(wrongContentType.statusCode, 415, "the Patient Agent must require application/json");
    assert.deepEqual(wrongContentType.payload, { error: "content_type_not_supported" });
    assert.equal(providerCalls, 0, "content-type rejection must happen before any provider call");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.LLM_ENABLE_AI_AGENTS;
    delete process.env.LLM_ENABLE_AI_PATIENT;
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_API_BASE_URL;
    delete process.env.LLM_MODEL;
  }
}

async function verifyRetiredRoutes() {
  for (const [label, handler] of [["patient-reply", legacyPatientHandler], ["complete-profile", legacyProfileHandler]] as const) {
    const denied = await call(handler, { origin: "https://evil.example", body: { caseId: "P001" } });
    assert.equal(denied.statusCode, 403, `${label} must reject an untrusted Origin`);
    const retired = await call(handler, { origin: "https://allowed.example", body: { caseId: "P001" } });
    assert.equal(retired.statusCode, 410, `${label} must remain retired`);
    assert.equal((retired.payload as { error: string }).error, "endpoint_retired");
    assert.notEqual(retired.headers["access-control-allow-origin"], "*");
  }
}

async function verifyBodyLimits() {
  const oversizedAgent = await call(agentHandler, {
    origin: "https://allowed.example", ip: "oversized-agent",
    body: JSON.stringify({ caseId: "P001", studentInput: "x".repeat(70 * 1024) })
  });
  assert.equal(oversizedAgent.statusCode, 413);
  assert.deepEqual(oversizedAgent.payload, { error: "request_body_too_large" });

  const oversizedSession = await call(sessionHandler, {
    origin: "https://allowed.example", ip: "oversized-session",
    body: JSON.stringify({ caseId: "P001", padding: "x".repeat(20 * 1024) })
  });
  assert.equal(oversizedSession.statusCode, 413);
  assert.deepEqual(oversizedSession.payload, { error: "request_body_too_large" });
}

async function main() {
  resetMemoryAttemptStore();
  resetMemoryAgentRequestStore();
  await verifyOriginAndCors(agentHandler, "agent-chat");
  await verifyOriginAndCors(sessionHandler, "session-init");
  await verifyOptionalServerToken(sessionHandler);
  await verifySessionIdempotency();
  await verifySessionClaimBinding();
  await verifySessionRequestBoundary();
  const session = await createAuthorizedSession("shared-agent");
  await verifySessionCapabilityBoundary(session);
  await verifyGenerationSourceClassification(session);
  await verifyProviderTimingNonDisclosure(session);
  await verifyProviderFailureNonDisclosure(session);
  await verifyAgentIdempotency(session);
  await verifyDistinctRequestConcurrencyLimit(session);
  await verifySessionRequestBudget(session);
  await verifyDurableAdmissionContract();
  await verifyPatientAgentRequestBoundary(session);
  await verifyRetiredRoutes();
  await verifyBodyLimits();
  await verifyRateLimit(agentHandler, "agent-chat");
  await verifyRateLimit(sessionHandler, "session-init");
  console.log("Agent/session capabilities, idempotency, retired routes, CORS, rate-limit, and non-disclosure tests passed.");
}

void main();
