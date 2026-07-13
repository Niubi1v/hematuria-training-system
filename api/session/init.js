const { initSession } = require("../../server/patientSession.js");
const { applyAgentCors, positiveInteger, setRateLimitHeaders, takeRateLimit } = require("../../server/requestSecurity.js");
const { setServerTiming } = require("../../server/performanceTiming.js");

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
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    if (!body.caseId) return res.status(400).json({ error: "caseId is required" });
    const idempotencyKey = requestHeader(req, "x-idempotency-key").slice(0, 200);
    const scope = idempotencyKey
      ? `${idempotencyKey}:${body.caseId}:${body.mode || "training"}:${body.language || "zh"}:${Boolean(body.forceRefresh)}`
      : "";
    const now = Date.now();
    pruneIdempotency(now);
    let entry = scope ? idempotentSessions.get(scope) : null;
    if (!entry) {
      const promise = initSession({
        caseId: body.caseId,
        mode: body.mode || "training",
        language: body.language || "zh",
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
  } catch {
    return res.status(500).json({ error: "session_init_failed" });
  }
};
