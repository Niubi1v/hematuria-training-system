const { initSession } = require("../../server/patientSession.js");
const { applyAgentCors, parseJsonBody, positiveInteger, setRateLimitHeaders, takeRateLimit } = require("../../server/requestSecurity.js");
const { setServerTiming } = require("../../server/performanceTiming.js");
const { normalizeAttemptMode, verifyAttemptState } = require("../../server/trainingState.js");
const { validateCurrentAttempt } = require("../../server/trainingAttemptStore.js");

const requestWindows = globalThis.__hematuriaSessionInitRequestWindows || new Map();
globalThis.__hematuriaSessionInitRequestWindows = requestWindows;
const idempotentSessions = globalThis.__hematuriaSessionInitIdempotency || new Map();
globalThis.__hematuriaSessionInitIdempotency = idempotentSessions;
const IDEMPOTENCY_TTL_MS = 30 * 60 * 1000;
const MAX_IDEMPOTENT_SESSIONS = 5000;

function requestHeader(req, name) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function pruneIdempotency(now) {
  for (const [key, entry] of idempotentSessions) {
    if (entry.expiresAt <= now) idempotentSessions.delete(key);
  }
}

module.exports = async function handler(req, res) {
  const startedAt = Date.now();
  const origin = applyAgentCors(req, res);
  if (!origin.allowed) return res.status(403).json({ error: "origin_not_allowed" });
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const rate = takeRateLimit(req, {
    store: requestWindows,
    limit: positiveInteger(process.env.SESSION_INIT_RATE_LIMIT_PER_MINUTE || process.env.AGENT_API_RATE_LIMIT_PER_MINUTE, 60, 10000),
    windowMs: positiveInteger(process.env.AGENT_API_RATE_LIMIT_WINDOW_MS, 60_000)
  });
  setRateLimitHeaders(res, rate);
  if (rate.limited) return res.status(429).json({ error: "rate_limited" });

  try {
    const body = parseJsonBody(req, 16 * 1024);
    if (!body.caseId) return res.status(400).json({ error: "caseId is required" });
    if (!body.attemptId) return res.status(400).json({ error: "attemptId is required" });
    const trainingToken = requestHeader(req, "x-training-state");
    const claims = verifyAttemptState(trainingToken, { caseId: String(body.caseId), attemptId: String(body.attemptId) });
    const state = await validateCurrentAttempt({ caseId: String(body.caseId), attemptId: String(body.attemptId), token: trainingToken });
    const language = body.language === "en" ? "en" : "zh";
    const mode = normalizeAttemptMode(body.mode);
    if (state.mode !== claims.mode || state.language !== claims.language || Number(state.tokenSequence || 0) !== Number(claims.tokenSequence || 0)) {
      throw new Error("attempt_state_mismatch");
    }
    if (language !== state.language) throw new Error("attempt_language_mismatch");
    if (mode !== state.mode) throw new Error("attempt_mode_mismatch");
    const idempotencyKey = requestHeader(req, "x-idempotency-key").slice(0, 200);
    if (!idempotencyKey) return res.status(400).json({ error: "idempotency_key_required" });
    const scope = idempotencyKey
      ? `${idempotencyKey}:${body.attemptId}:${body.caseId}:${body.mode || "training"}:${body.language || "zh"}:${Boolean(body.forceRefresh)}`
      : "";
    const now = Date.now();
    pruneIdempotency(now);
    let entry = scope ? idempotentSessions.get(scope) : null;
    if (!entry) {
      const promise = initSession({
        caseId: body.caseId,
        attemptId: body.attemptId,
        mode: body.mode || "training",
        capabilityMode: state.mode,
        language,
        debug: Boolean(body.debug),
        forceRefresh: Boolean(body.forceRefresh)
      });
      entry = { promise, expiresAt: now + IDEMPOTENCY_TTL_MS };
      if (scope) {
        if (!idempotentSessions.has(scope) && idempotentSessions.size >= MAX_IDEMPOTENT_SESSIONS) {
          idempotentSessions.delete(idempotentSessions.keys().next().value);
        }
        idempotentSessions.set(scope, entry);
      }
      promise.catch(() => { if (scope && idempotentSessions.get(scope) === entry) idempotentSessions.delete(scope); });
    }
    const result = await entry.promise;
    setServerTiming(res, { session: Date.now() - startedAt });
    return res.status(200).json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "session_init_failed";
    const status = /request_body_too_large/.test(code) ? 413
      : /invalid_json_body/.test(code) ? 400
        : /store_unavailable|secret/.test(code) ? 503
      : /stale|completed|attempt_(?:language|mode)_mismatch/.test(code) ? 409
        : /token|mismatch|not_found/.test(code) ? 401 : 500;
    return res.status(status).json({ error: code === "session_init_failed" ? code : code });
  }
};
