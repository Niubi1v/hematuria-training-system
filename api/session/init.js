const { initSession } = require("../../server/patientSession.js");
const { applyAgentCors, positiveInteger, setRateLimitHeaders, takeRateLimit } = require("../../server/requestSecurity.js");

const requestWindows = globalThis.__hematuriaSessionInitRequestWindows || new Map();
globalThis.__hematuriaSessionInitRequestWindows = requestWindows;

module.exports = async function handler(req, res) {
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
    const result = await initSession({
      caseId: body.caseId,
      mode: body.mode || "training",
      language: body.language || "zh",
      debug: Boolean(body.debug),
      forceRefresh: Boolean(body.forceRefresh)
    });
    return res.status(200).json(result);
  } catch {
    return res.status(500).json({ error: "session_init_failed" });
  }
};
