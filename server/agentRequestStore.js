const crypto = require("node:crypto");

const REQUEST_TTL_SECONDS = 24 * 60 * 60;
const WAIT_TIMEOUT_MS = 20_000;
const memoryRequests = globalThis.__hematuriaAgentRequestStore || new Map();
globalThis.__hematuriaAgentRequestStore = memoryRequests;

function digest(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function requestKey(sessionId, idempotencyKey) {
  return `hematuria:agent-request:v1:${digest(`${sessionId}:${idempotencyKey}`)}`;
}

function storeMode() {
  const configured = String(process.env.AGENT_REQUEST_STORE_MODE || process.env.TRAINING_ATTEMPT_STORE_MODE || "").toLowerCase();
  if (configured === "memory") return "memory";
  if (configured === "upstash") return "upstash";
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) return "upstash";
  if (process.env.VERCEL || process.env.NODE_ENV === "production") return "unavailable";
  return "memory";
}

async function upstash(command) {
  const url = String(process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/+$/, "");
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || "");
  if (!url || !token) throw new Error("agent_request_store_unavailable");
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(5000)
    });
  } catch {
    throw new Error("agent_request_store_unavailable");
  }
  if (!response.ok) throw new Error("agent_request_store_unavailable");
  const payload = await response.json();
  if (payload.error) throw new Error("agent_request_store_unavailable");
  return payload.result;
}

const CLAIM_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if raw then
  local record = cjson.decode(raw)
  if record.requestDigest ~= ARGV[1] then return cjson.encode({kind='conflict'}) end
  if record.status == 'succeeded' then return cjson.encode({kind='cached', result=record.result}) end
  return cjson.encode({kind='pending'})
end
local record = {requestDigest=ARGV[1], status='processing', leaseId=ARGV[2], startedAt=tonumber(ARGV[3])}
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[4])
return cjson.encode({kind='owner'})
`;

const COMPLETE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return cjson.encode({kind='missing'}) end
local record = cjson.decode(raw)
if record.requestDigest ~= ARGV[1] then return cjson.encode({kind='conflict'}) end
if record.status == 'succeeded' then return cjson.encode({kind='cached', result=record.result}) end
if record.leaseId ~= ARGV[2] then return cjson.encode({kind='lease_lost'}) end
record.status = 'succeeded'
record.result = cjson.decode(ARGV[3])
record.completedAt = tonumber(ARGV[4])
redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[5])
return cjson.encode({kind='committed'})
`;

function assertInputs(sessionId, idempotencyKey) {
  if (!sessionId) throw new Error("session_capability_required");
  if (!String(idempotencyKey || "").trim()) throw new Error("idempotency_key_required");
  const mode = storeMode();
  if (mode === "unavailable") throw new Error("agent_request_store_unavailable");
  if (mode === "upstash" && (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN)) {
    throw new Error("agent_request_store_unavailable");
  }
  return mode;
}

async function claim({ sessionId, idempotencyKey, requestDigest }) {
  const mode = assertInputs(sessionId, idempotencyKey);
  const key = requestKey(sessionId, idempotencyKey);
  const leaseId = crypto.randomUUID();
  if (mode === "memory") {
    const existing = memoryRequests.get(key);
    if (existing) {
      if (existing.requestDigest !== requestDigest) return { kind: "conflict" };
      if (existing.status === "succeeded") return { kind: "cached", result: clone(existing.result) };
      return { kind: "pending", promise: existing.promise };
    }
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    memoryRequests.set(key, { requestDigest, status: "processing", leaseId, promise, resolve, startedAt: Date.now() });
    return { kind: "owner", mode, key, leaseId };
  }
  const raw = await upstash(["EVAL", CLAIM_SCRIPT, 1, key, requestDigest, leaseId, Date.now(), REQUEST_TTL_SECONDS]);
  const result = JSON.parse(raw);
  return { ...result, mode, key, leaseId };
}

async function complete(owner, requestDigest, result) {
  const normalized = clone(result);
  if (owner.mode === "memory") {
    const record = memoryRequests.get(owner.key);
    if (!record || record.leaseId !== owner.leaseId) throw new Error("agent_request_lease_lost");
    record.status = "succeeded";
    record.result = normalized;
    record.completedAt = Date.now();
    record.resolve(normalized);
    delete record.resolve;
    delete record.promise;
    return normalized;
  }
  const raw = await upstash(["EVAL", COMPLETE_SCRIPT, 1, owner.key, requestDigest, owner.leaseId, JSON.stringify(normalized), Date.now(), REQUEST_TTL_SECONDS]);
  const outcome = JSON.parse(raw);
  if (outcome.kind === "cached") return outcome.result;
  if (outcome.kind !== "committed") throw new Error(`agent_request_${outcome.kind}`);
  return normalized;
}

async function waitForPending(claimed) {
  if (claimed.promise) {
    return Promise.race([
      claimed.promise.then(clone),
      new Promise((_, reject) => setTimeout(() => reject(new Error("agent_request_in_progress")), WAIT_TIMEOUT_MS))
    ]);
  }
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const raw = await upstash(["GET", claimed.key]);
    if (!raw) throw new Error("agent_request_ambiguous");
    const record = JSON.parse(raw);
    if (record.status === "succeeded") return record.result;
  }
  throw new Error("agent_request_in_progress");
}

async function executeIdempotentAgentRequest({ sessionId, idempotencyKey, body }, executor) {
  const requestDigest = digest(stableJson(body));
  const claimed = await claim({ sessionId, idempotencyKey, requestDigest });
  if (claimed.kind === "conflict") throw new Error("idempotency_key_reused");
  if (claimed.kind === "cached") return { ...clone(claimed.result), idempotencyReplay: true };
  if (claimed.kind === "pending") return { ...await waitForPending(claimed), idempotencyReplay: true };
  const result = await executor();
  return complete(claimed, requestDigest, result);
}

function resetMemoryAgentRequestStore() {
  memoryRequests.clear();
}

module.exports = { executeIdempotentAgentRequest, resetMemoryAgentRequestStore };
