const crypto = require("node:crypto");

const TOKEN_VERSION = 3;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MIN_SECRET_BYTES = 32;

function signingSecret() {
  const dedicatedSecret = process.env.TRAINING_STATE_SECRET || "";
  if (!dedicatedSecret) throw new Error("training_state_secret_missing");
  if (Buffer.byteLength(dedicatedSecret, "utf8") < MIN_SECRET_BYTES) throw new Error("training_state_secret_weak");
  if (/^(replace_with_|your_|changeme)/i.test(dedicatedSecret) || new Set(dedicatedSecret).size < 8) {
    throw new Error("training_state_secret_placeholder");
  }
  if (process.env.LLM_API_KEY && safeEqual(dedicatedSecret, process.env.LLM_API_KEY)) {
    throw new Error("training_state_secret_reused");
  }
  return dedicatedSecret;
}

function signingSecretConfigured() {
  try {
    signingSecret();
    return true;
  } catch {
    return false;
  }
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signature(payload) {
  const secret = signingSecret();
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createAttemptState({ attemptId, caseId, mode, language }) {
  const now = Date.now();
  return {
    version: TOKEN_VERSION,
    nonce: crypto.randomUUID(),
    attemptId: String(attemptId || crypto.randomUUID()),
    caseId,
    mode,
    language,
    status: "active",
    practiceOnly: mode === "public-practice",
    createdAt: new Date(now).toISOString(),
    issuedAt: now,
    expiresAt: now + MAX_AGE_MS,
    tokenSequence: 0,
    sequence: 0,
    currentStage: 1,
    completedStages: [],
    orders: [],
    events: [],
    submissions: {}
  };
}

function normalizeAttemptMode(mode) {
  return ["osce", "rct", "formal-attempt"].includes(String(mode)) ? "formal-attempt" : "public-practice";
}

function tokenClaims(state) {
  return {
    version: TOKEN_VERSION,
    nonce: state.nonce,
    attemptId: state.attemptId,
    caseId: state.caseId,
    mode: state.mode,
    language: state.language,
    status: state.status,
    practiceOnly: state.practiceOnly,
    issuedAt: state.issuedAt,
    expiresAt: state.expiresAt,
    tokenSequence: Number(state.tokenSequence || 0),
    currentStage: Number(state.currentStage || 1)
  };
}

function signAttemptState(state) {
  const payload = encode(tokenClaims(state));
  return `${payload}.${signature(payload)}`;
}

function advanceAttemptToken(state) {
  state.tokenSequence = Number(state.tokenSequence || 0) + 1;
  state.nonce = crypto.randomUUID();
  state.issuedAt = Date.now();
  return state;
}

function verifyAttemptState(token, expected = {}) {
  const [payload, receivedSignature, extra] = String(token || "").split(".");
  if (!payload || !receivedSignature || extra || !safeEqual(signature(payload), receivedSignature)) {
    throw new Error("invalid_attempt_token");
  }
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (claims.version !== TOKEN_VERSION) throw new Error("unsupported_attempt_token_version");
  if (!claims.nonce || !Number.isFinite(Number(claims.issuedAt)) || Number(claims.issuedAt) > Date.now() + 60_000) throw new Error("invalid_attempt_token_claims");
  if (!Number.isInteger(Number(claims.tokenSequence)) || Number(claims.tokenSequence) < 0) throw new Error("invalid_attempt_token_claims");
  if (Number(claims.expiresAt) < Date.now()) throw new Error("expired_attempt_token");
  if (expected.caseId && claims.caseId !== expected.caseId) throw new Error("attempt_case_mismatch");
  if (expected.attemptId && claims.attemptId !== expected.attemptId) throw new Error("attempt_id_mismatch");
  if (expected.mode && claims.mode !== expected.mode) throw new Error("attempt_mode_mismatch");
  if (claims.status === "completed" && expected.allowCompleted !== true) throw new Error("attempt_already_completed");
  return claims;
}

function appendEvents(state, events) {
  const existing = new Set(state.events.map((event) => event.eventId));
  let appended = 0;
  for (const event of events) {
    if (!existing.has(event.eventId)) {
      state.events.push(event);
      existing.add(event.eventId);
      appended += 1;
    }
  }
  if (appended > 0) state.sequence += 1;
  return state;
}

module.exports = { advanceAttemptToken, appendEvents, createAttemptState, normalizeAttemptMode, signAttemptState, signingSecret, signingSecretConfigured, verifyAttemptState };
