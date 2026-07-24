const crypto = require("node:crypto");

const DEFAULT_ALLOWED_ORIGIN = "https://niubi1v.github.io";
const MAX_RATE_LIMIT_KEYS = 5000;

function headerValue(req, name) {
  const headers = req?.headers || {};
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function allowedOrigins() {
  const configured = process.env.AGENT_API_ALLOWED_ORIGINS
    || process.env.AGENT_API_ALLOWED_ORIGIN
    || process.env.PATIENT_AGENT_ALLOWED_ORIGIN
    || DEFAULT_ALLOWED_ORIGIN;
  return new Set(String(configured).split(",").map((value) => value.trim()).filter((value) => value && value !== "*"));
}

function sameOriginRequest(req, origin) {
  if (!origin) return false;
  try {
    const originUrl = new URL(origin);
    const forwardedHost = headerValue(req, "x-forwarded-host").split(",")[0].trim();
    const host = forwardedHost || headerValue(req, "host").split(",")[0].trim();
    const forwardedProto = headerValue(req, "x-forwarded-proto").split(",")[0].trim();
    const protocol = forwardedProto || (originUrl.protocol === "http:" ? "http" : "https");
    return Boolean(host) && originUrl.host === host && originUrl.protocol === `${protocol}:`;
  } catch {
    return false;
  }
}

function safeTokenEqual(actual, expected) {
  const actualBuffer = Buffer.from(String(actual || ""));
  const expectedBuffer = Buffer.from(String(expected || ""));
  return actualBuffer.length === expectedBuffer.length
    && actualBuffer.length > 0
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function applyAgentCors(req, res) {
  const origin = headerValue(req, "origin").trim();
  const configuredServerToken = String(process.env.AGENT_API_SERVER_TOKEN || "");
  const directRequestAllowed = !configuredServerToken
    || safeTokenEqual(headerValue(req, "x-agent-api-token"), configuredServerToken);
  const allowed = origin ? allowedOrigins().has(origin) || sameOriginRequest(req, origin) : directRequestAllowed;

  if (origin && allowed) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Request-Id, X-Idempotency-Key, X-Training-State");
  res.setHeader("Access-Control-Expose-Headers", "Server-Timing, X-Hematuria-Timing");
  res.setHeader("Access-Control-Max-Age", "600");
  res.setHeader("Cache-Control", "no-store");
  return { allowed, origin, direct: !origin };
}

function positiveInteger(value, fallback, maximum = 60 * 60 * 1000) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function clientKey(req) {
  const forwarded = headerValue(req, "x-vercel-forwarded-for")
    || headerValue(req, "x-real-ip")
    || headerValue(req, "x-forwarded-for")
    || String(req?.socket?.remoteAddress || "unknown");
  return forwarded.split(",")[0].trim() || "unknown";
}

function takeRateLimit(req, { store, limit, windowMs }) {
  const safeLimit = positiveInteger(limit, 30, 10000);
  const safeWindowMs = positiveInteger(windowMs, 60_000);
  const key = clientKey(req);
  const now = Date.now();
  const recent = (store.get(key) || []).filter((stamp) => stamp > now - safeWindowMs);

  if (recent.length >= safeLimit) {
    store.set(key, recent);
    return {
      limited: true,
      limit: safeLimit,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + safeWindowMs - now) / 1000))
    };
  }

  if (!store.has(key) && store.size >= MAX_RATE_LIMIT_KEYS) store.delete(store.keys().next().value);
  recent.push(now);
  store.set(key, recent);
  return { limited: false, limit: safeLimit, remaining: safeLimit - recent.length, retryAfterSeconds: 0 };
}

function setRateLimitHeaders(res, result) {
  res.setHeader("RateLimit-Limit", String(result.limit));
  res.setHeader("RateLimit-Remaining", String(result.remaining));
  if (result.limited) res.setHeader("Retry-After", String(result.retryAfterSeconds));
}

function parseJsonBody(req, maxBytes = 64 * 1024) {
  const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
  if (Buffer.byteLength(raw, "utf8") > maxBytes) throw new Error("request_body_too_large");
  try {
    return typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch {
    throw new Error("invalid_json_body");
  }
}

module.exports = { applyAgentCors, clientKey, parseJsonBody, positiveInteger, setRateLimitHeaders, takeRateLimit };
