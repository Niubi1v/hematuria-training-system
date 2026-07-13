const crypto = require("node:crypto");
const { signingSecret } = require("./trainingState.js");

const CAPABILITY_VERSION = 1;

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function signature(payload) {
  return crypto.createHmac("sha256", signingSecret()).update(`patient-session-v1.${payload}`).digest("base64url");
}

function createSessionCapability({ attemptId, caseId, language, mode, expiresAt }) {
  const now = Date.now();
  const claims = {
    version: CAPABILITY_VERSION,
    sid: crypto.randomUUID(),
    nonce: crypto.randomUUID(),
    attemptId: String(attemptId || ""),
    caseId: String(caseId || ""),
    language: language === "en" ? "en" : "zh",
    mode: String(mode || "training"),
    issuedAt: now,
    expiresAt: Number(expiresAt || now)
  };
  if (!claims.attemptId || !claims.caseId || claims.expiresAt <= now) throw new Error("invalid_session_capability_claims");
  const payload = encode(claims);
  return `${payload}.${signature(payload)}`;
}

function verifySessionCapability(token, expected = {}) {
  const [payload, receivedSignature, extra] = String(token || "").split(".");
  if (!payload || !receivedSignature || extra || !safeEqual(signature(payload), receivedSignature)) {
    throw new Error("invalid_session_capability");
  }
  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new Error("invalid_session_capability");
  }
  if (claims.version !== CAPABILITY_VERSION || !claims.sid || !claims.nonce || !claims.attemptId || !claims.caseId) {
    throw new Error("invalid_session_capability_claims");
  }
  if (!Number.isFinite(Number(claims.issuedAt)) || Number(claims.issuedAt) > Date.now() + 60_000) throw new Error("invalid_session_capability_claims");
  if (Number(claims.expiresAt) <= Date.now()) throw new Error("expired_session_capability");
  if (expected.attemptId && claims.attemptId !== String(expected.attemptId)) throw new Error("session_attempt_mismatch");
  if (expected.caseId && claims.caseId !== String(expected.caseId)) throw new Error("session_case_mismatch");
  if (expected.language && claims.language !== (expected.language === "en" ? "en" : "zh")) throw new Error("session_language_mismatch");
  if (expected.mode && claims.mode !== String(expected.mode)) throw new Error("session_mode_mismatch");
  return claims;
}

module.exports = { createSessionCapability, verifySessionCapability };
