const crypto = require("node:crypto");

const TOKEN_VERSION = 1;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function signingSecret() {
  const dedicatedSecret = process.env.TRAINING_STATE_SECRET || "";
  if (dedicatedSecret) return dedicatedSecret;

  // Public practice keeps the legacy fallback so an existing practice-only
  // deployment does not lose signed-state support during migration. Formal
  // deployments must use a separately managed signing secret; coupling formal
  // attempt integrity to an LLM credential would make rotation and revocation
  // unsafe.
  if (process.env.TRAINING_DEPLOYMENT_TIER !== "formal") return process.env.LLM_API_KEY || "";
  return "";
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signature(payload) {
  const secret = signingSecret();
  if (!secret) throw new Error("training_state_secret_missing");
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
    attemptId: String(attemptId || crypto.randomUUID()),
    caseId,
    mode,
    language,
    status: "active",
    practiceOnly: mode === "public-practice",
    createdAt: new Date(now).toISOString(),
    expiresAt: now + MAX_AGE_MS,
    sequence: 0,
    orders: [],
    events: [],
    submissions: {}
  };
}

function signAttemptState(state) {
  const payload = encode(state);
  return `${payload}.${signature(payload)}`;
}

function verifyAttemptState(token, expected = {}) {
  const [payload, receivedSignature, extra] = String(token || "").split(".");
  if (!payload || !receivedSignature || extra || !safeEqual(signature(payload), receivedSignature)) {
    throw new Error("invalid_attempt_token");
  }
  const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (state.version !== TOKEN_VERSION || Number(state.expiresAt) < Date.now()) throw new Error("expired_attempt_token");
  if (expected.caseId && state.caseId !== expected.caseId) throw new Error("attempt_case_mismatch");
  if (expected.attemptId && state.attemptId !== expected.attemptId) throw new Error("attempt_id_mismatch");
  if (expected.mode && state.mode !== expected.mode) throw new Error("attempt_mode_mismatch");
  if (state.status === "completed" && expected.allowCompleted !== true) throw new Error("attempt_already_completed");
  return state;
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

module.exports = { appendEvents, createAttemptState, signAttemptState, signingSecret, verifyAttemptState };
