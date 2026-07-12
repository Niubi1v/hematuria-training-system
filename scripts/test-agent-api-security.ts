const assert = require("node:assert/strict");

process.env.AGENT_API_ALLOWED_ORIGINS = "https://allowed.example, https://second.example";
process.env.AGENT_CHAT_RATE_LIMIT_PER_MINUTE = "2";
process.env.SESSION_INIT_RATE_LIMIT_PER_MINUTE = "2";
process.env.AGENT_API_RATE_LIMIT_WINDOW_MS = "60000";
process.env.LLM_API_KEY = "unit-test-secret-must-not-appear";

delete (globalThis as Record<string, unknown>).__hematuriaAgentChatRequestWindows;
delete (globalThis as Record<string, unknown>).__hematuriaSessionInitRequestWindows;
delete (globalThis as Record<string, unknown>).__hematuriaSessionInitIdempotency;

const agentHandler = require("../api/agent-chat.js");
const sessionHandler = require("../api/session/init.js");

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

async function verifyProviderFailureNonDisclosure() {
  const originalFetch = globalThis.fetch;
  process.env.LLM_ENABLE_AI_PATIENT = "true";
  process.env.LLM_API_BASE_URL = "https://api.example.test";
  process.env.LLM_MODEL = "test-model";
  globalThis.fetch = async () => { throw new Error("unit-test-secret-must-not-appear private-patient-content"); };
  try {
    const response = await call(agentHandler, {
      origin: "https://allowed.example",
      ip: "provider-failure",
      body: { caseId: "P001", agentId: "standardized_patient", studentInput: "你吸烟吗？", language: "zh", debug: true }
    });
    assert.equal(response.statusCode, 200, "provider failure should use the safe rule fallback");
    assert.doesNotMatch(JSON.stringify(response.payload), /private-patient-content|unit-test-secret/);
    assert.doesNotMatch(JSON.stringify(response.payload), /allowedAnswer|responseFilter|"error"/);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.LLM_ENABLE_AI_PATIENT;
    delete process.env.LLM_API_BASE_URL;
    delete process.env.LLM_MODEL;
  }
}

async function verifySessionIdempotency() {
  const headers = { "x-idempotency-key": "attempt-1:session-init:default" };
  const options = {
    origin: "https://allowed.example",
    ip: "session-idempotency",
    headers,
    body: { caseId: "P001", mode: "free", language: "zh" }
  };
  const [first, second] = await Promise.all([call(sessionHandler, options), call(sessionHandler, options)]);
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal((first.payload as { sessionId: string }).sessionId, (second.payload as { sessionId: string }).sessionId, "same session init idempotency key must return one session");
}

async function main() {
  await verifyOriginAndCors(agentHandler, "agent-chat");
  await verifyOriginAndCors(sessionHandler, "session-init");
  await verifyOptionalServerToken(sessionHandler);
  await verifySessionIdempotency();
  await verifyProviderFailureNonDisclosure();
  await verifyRateLimit(agentHandler, "agent-chat");
  await verifyRateLimit(sessionHandler, "session-init");
  console.log("Agent chat/session Origin, CORS, trusted direct-call, bounded rate-limit, and non-disclosure tests passed.");
}

void main();
