const crypto = require("node:crypto");

const ATTEMPT_TTL_SECONDS = 24 * 60 * 60;
const MAX_IDEMPOTENCY_RECORDS = 64;
const memoryAttempts = globalThis.__hematuriaTrainingAttemptStore || new Map();
globalThis.__hematuriaTrainingAttemptStore = memoryAttempts;

function digest(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function attemptKey(caseId, attemptId) {
  const scope = `${String(caseId || "").toLowerCase()}:${String(attemptId || "")}`;
  return `hematuria:attempt:v1:${digest(scope)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizedRequestId(value) {
  return String(value || "").replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 160);
}

function assertRequest(requestId, requestDigest) {
  if (!normalizedRequestId(requestId)) throw new Error("idempotency_key_required");
  if (!/^[a-f0-9]{64}$/.test(String(requestDigest || ""))) throw new Error("invalid_request_digest");
}

function pruneIdempotency(record) {
  const entries = Object.entries(record.idempotency || {}).sort((a, b) => Number(a[1].at || 0) - Number(b[1].at || 0));
  while (entries.length > MAX_IDEMPOTENCY_RECORDS) {
    const [key] = entries.shift();
    delete record.idempotency[key];
  }
}

function storeMode() {
  const configured = String(process.env.TRAINING_ATTEMPT_STORE_MODE || "").toLowerCase();
  if (configured === "memory") return "memory";
  if (configured === "upstash") return "upstash";
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) return "upstash";
  if (process.env.VERCEL || process.env.NODE_ENV === "production") return "unavailable";
  return "memory";
}

function assertStoreConfigured() {
  const mode = storeMode();
  if (mode === "unavailable") throw new Error("training_attempt_store_unavailable");
  if (mode === "upstash" && (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN)) {
    throw new Error("training_attempt_store_unavailable");
  }
  return mode;
}

function durableAttemptStoreConfigured() {
  return storeMode() === "upstash" && Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function upstash(command) {
  const url = String(process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/+$/, "");
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || "");
  if (!url || !token) throw new Error("training_attempt_store_unavailable");
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(5000)
    });
  } catch {
    throw new Error("training_attempt_store_unavailable");
  }
  if (!response.ok) throw new Error("training_attempt_store_unavailable");
  const payload = await response.json();
  if (payload.error) throw new Error("training_attempt_store_unavailable");
  return payload.result;
}

const REGISTER_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if raw then
  local record = cjson.decode(raw)
  local cached = record.idempotency and record.idempotency[ARGV[1]]
  if cached then
    if cached.requestDigest ~= ARGV[2] then return cjson.encode({kind='conflict'}) end
    return cjson.encode({kind='duplicate', cached=cached})
  end
  return cjson.encode({kind='exists'})
end
redis.call('SET', KEYS[1], ARGV[3], 'EX', ARGV[4])
return cjson.encode({kind='created'})
`;

const LOAD_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return cjson.encode({kind='missing'}) end
local record = cjson.decode(raw)
local cached = record.idempotency and record.idempotency[ARGV[1]]
if cached then
  if cached.requestDigest ~= ARGV[2] then return cjson.encode({kind='conflict'}) end
  return cjson.encode({kind='duplicate', cached=cached})
end
if record.currentTokenHash ~= ARGV[3] then return cjson.encode({kind='stale'}) end
return cjson.encode({kind='active', state=record.state})
`;

const COMMIT_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return cjson.encode({kind='missing'}) end
local record = cjson.decode(raw)
local cached = record.idempotency and record.idempotency[ARGV[1]]
if cached then
  if cached.requestDigest ~= ARGV[2] then return cjson.encode({kind='conflict'}) end
  return cjson.encode({kind='duplicate', cached=cached})
end
if record.currentTokenHash ~= ARGV[3] then return cjson.encode({kind='stale'}) end
record.state = cjson.decode(ARGV[4])
record.currentTokenHash = ARGV[5]
record.idempotency = record.idempotency or {}
record.idempotency[ARGV[1]] = cjson.decode(ARGV[6])
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[7])
return cjson.encode({kind='committed'})
`;

function cachedResult(entry) {
  return { duplicate: true, statusCode: Number(entry.statusCode || 200), payload: clone(entry.payload), token: String(entry.token || "") };
}

function resultError(kind) {
  if (kind === "conflict") throw new Error("idempotency_key_reused");
  if (kind === "stale") throw new Error("stale_attempt_token");
  if (kind === "missing") throw new Error("attempt_not_found");
  if (kind === "exists") throw new Error("attempt_already_exists");
  throw new Error("training_attempt_store_failed");
}

async function registerAttempt({ state, token, requestId, requestDigest, payload, statusCode = 200 }) {
  assertRequest(requestId, requestDigest);
  const mode = assertStoreConfigured();
  const id = normalizedRequestId(requestId);
  const cached = { requestDigest, statusCode, payload: clone(payload), token, at: Date.now() };
  const record = { state: clone(state), currentTokenHash: digest(token), idempotency: { [id]: cached } };
  const key = attemptKey(state.caseId, state.attemptId);
  if (mode === "memory") {
    const existing = memoryAttempts.get(key);
    if (existing) {
      const previous = existing.idempotency?.[id];
      if (previous) {
        if (previous.requestDigest !== requestDigest) resultError("conflict");
        return cachedResult(previous);
      }
      resultError("exists");
    }
    memoryAttempts.set(key, record);
    return { duplicate: false, statusCode, payload: clone(payload), token };
  }
  const raw = await upstash(["EVAL", REGISTER_SCRIPT, 1, key, id, requestDigest, JSON.stringify(record), ATTEMPT_TTL_SECONDS]);
  const result = JSON.parse(raw);
  if (result.kind === "created") return { duplicate: false, statusCode, payload: clone(payload), token };
  if (result.kind === "duplicate") return cachedResult(result.cached);
  return resultError(result.kind);
}

async function loadAttempt({ caseId, attemptId, token, requestId, requestDigest }) {
  assertRequest(requestId, requestDigest);
  const mode = assertStoreConfigured();
  const id = normalizedRequestId(requestId);
  const tokenHash = digest(token);
  const key = attemptKey(caseId, attemptId);
  if (mode === "memory") {
    const record = memoryAttempts.get(key);
    if (!record) return resultError("missing");
    const previous = record.idempotency?.[id];
    if (previous) {
      if (previous.requestDigest !== requestDigest) return resultError("conflict");
      return cachedResult(previous);
    }
    if (record.currentTokenHash !== tokenHash) return resultError("stale");
    return { duplicate: false, state: clone(record.state) };
  }
  const raw = await upstash(["EVAL", LOAD_SCRIPT, 1, key, id, requestDigest, tokenHash]);
  const result = JSON.parse(raw);
  if (result.kind === "active") return { duplicate: false, state: result.state };
  if (result.kind === "duplicate") return cachedResult(result.cached);
  return resultError(result.kind);
}

async function validateCurrentAttempt({ caseId, attemptId, token }) {
  const mode = assertStoreConfigured();
  const key = attemptKey(caseId, attemptId);
  let record;
  if (mode === "memory") {
    record = memoryAttempts.get(key);
  } else {
    const raw = await upstash(["GET", key]);
    record = raw ? JSON.parse(raw) : null;
  }
  if (!record) throw new Error("attempt_not_found");
  if (record.currentTokenHash !== digest(token)) throw new Error("stale_attempt_token");
  if (record.state?.status !== "active") throw new Error("attempt_already_completed");
  return clone(record.state);
}

async function commitAttempt({ state, previousToken, nextToken, requestId, requestDigest, payload, statusCode = 200 }) {
  assertRequest(requestId, requestDigest);
  const mode = assertStoreConfigured();
  const id = normalizedRequestId(requestId);
  const cached = { requestDigest, statusCode, payload: clone(payload), token: nextToken, at: Date.now() };
  const key = attemptKey(state.caseId, state.attemptId);
  if (mode === "memory") {
    const record = memoryAttempts.get(key);
    if (!record) return resultError("missing");
    const previous = record.idempotency?.[id];
    if (previous) {
      if (previous.requestDigest !== requestDigest) return resultError("conflict");
      return cachedResult(previous);
    }
    if (record.currentTokenHash !== digest(previousToken)) return resultError("stale");
    record.state = clone(state);
    record.currentTokenHash = digest(nextToken);
    record.idempotency[id] = cached;
    pruneIdempotency(record);
    return { duplicate: false, statusCode, payload: clone(payload), token: nextToken };
  }
  const raw = await upstash(["EVAL", COMMIT_SCRIPT, 1, key, id, requestDigest, digest(previousToken), JSON.stringify(state), digest(nextToken), JSON.stringify(cached), ATTEMPT_TTL_SECONDS]);
  const result = JSON.parse(raw);
  if (result.kind === "committed") return { duplicate: false, statusCode, payload: clone(payload), token: nextToken };
  if (result.kind === "duplicate") return cachedResult(result.cached);
  return resultError(result.kind);
}

function resetMemoryAttemptStore() {
  memoryAttempts.clear();
}

module.exports = {
  assertStoreConfigured,
  commitAttempt,
  digest,
  durableAttemptStoreConfigured,
  loadAttempt,
  registerAttempt,
  resetMemoryAttemptStore,
  storeMode,
  validateCurrentAttempt
};
