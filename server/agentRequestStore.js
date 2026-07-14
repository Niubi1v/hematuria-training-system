const crypto = require("node:crypto");

const REQUEST_TTL_SECONDS = 24 * 60 * 60;
const WAIT_TIMEOUT_MS = 20_000;
const DEFAULT_SESSION_LEASE_SECONDS = 30;
const BUDGET_TTL_SECONDS = 24 * 60 * 60;
const HOUR_WINDOW_TTL_SECONDS = 2 * 60 * 60;
const DAY_WINDOW_TTL_SECONDS = 2 * 24 * 60 * 60;
const MAX_MEMORY_BUDGET_KEYS = 10_000;
const memoryRequests = globalThis.__hematuriaAgentRequestStore || new Map();
globalThis.__hematuriaAgentRequestStore = memoryRequests;
const memoryAdmissions = globalThis.__hematuriaAgentAdmissionStore || new Map();
globalThis.__hematuriaAgentAdmissionStore = memoryAdmissions;
const memoryBudgets = globalThis.__hematuriaAgentBudgetStore || new Map();
globalThis.__hematuriaAgentBudgetStore = memoryBudgets;

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

function sessionLeaseSeconds() {
  const parsed = Number(process.env.AGENT_SESSION_LEASE_SECONDS);
  return Number.isInteger(parsed) && parsed >= 5 && parsed <= 120 ? parsed : DEFAULT_SESSION_LEASE_SECONDS;
}

function boundedInteger(value, fallback, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function admissionLimits() {
  return {
    sessionRequests: boundedInteger(process.env.AGENT_SESSION_REQUEST_LIMIT, 60, 500),
    attemptRequests: boundedInteger(process.env.AGENT_ATTEMPT_REQUEST_LIMIT, 80, 1000),
    attemptInputChars: boundedInteger(process.env.AGENT_ATTEMPT_INPUT_CHAR_LIMIT, 120_000, 2_000_000),
    ipHourlyRequests: boundedInteger(process.env.AGENT_IP_HOURLY_REQUEST_LIMIT, 120, 5000),
    ipDailyRequests: boundedInteger(process.env.AGENT_IP_DAILY_REQUEST_LIMIT, 500, 20_000),
    projectDailyRequests: boundedInteger(process.env.AGENT_PROJECT_DAILY_REQUEST_LIMIT, 5000, 100_000),
    projectDailyTokens: boundedInteger(process.env.AGENT_PROJECT_DAILY_TOKEN_BUDGET, 2_000_000, 50_000_000),
    sessionProbes: boundedInteger(process.env.AGENT_SESSION_PROBE_LIMIT, 3, 100)
  };
}

function requestInputChars(body) {
  return String(body?.studentInput || "").length
    + (Array.isArray(body?.conversationHistory)
      ? body.conversationHistory.reduce((total, item) => total + String(item?.text || "").length, 0)
      : 0);
}

function admissionKeys({ sessionId, attemptId, caseId, clientId }) {
  const now = new Date();
  const hour = now.toISOString().slice(0, 13);
  const day = now.toISOString().slice(0, 10);
  const sessionScope = digest(sessionId);
  const attemptScope = digest(`${String(caseId || "").toLowerCase()}:${attemptId}`);
  const clientScope = digest(clientId || "unknown");
  return {
    concurrency: `hematuria:agent-admission:v1:${sessionScope}`,
    sessionRequests: `hematuria:agent-budget:v1:session:${sessionScope}`,
    attemptRequests: `hematuria:agent-budget:v1:attempt:${attemptScope}`,
    attemptInputChars: `hematuria:agent-budget:v1:chars:${attemptScope}`,
    ipHourlyRequests: `hematuria:agent-budget:v1:ip-hour:${clientScope}:${hour}`,
    ipDailyRequests: `hematuria:agent-budget:v1:ip-day:${clientScope}:${day}`,
    projectDailyRequests: `hematuria:agent-budget:v1:project:${day}`,
    projectDailyTokens: `hematuria:agent-budget:v1:project-tokens:${day}`,
    sessionProbes: `hematuria:agent-budget:v1:probe:${sessionScope}`
  };
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

const RELEASE_ADMISSION_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

const ABANDON_REQUEST_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local record = cjson.decode(raw)
if record.status == 'processing' and record.leaseId == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

const ACQUIRE_ADMISSION_SCRIPT = `
local function current(key)
  return tonumber(redis.call('GET', key) or '0')
end
if current(KEYS[2]) >= tonumber(ARGV[3]) then return cjson.encode({kind='quota'}) end
if current(KEYS[3]) >= tonumber(ARGV[4]) then return cjson.encode({kind='quota'}) end
if current(KEYS[4]) + tonumber(ARGV[5]) > tonumber(ARGV[6]) then return cjson.encode({kind='quota'}) end
if current(KEYS[5]) >= tonumber(ARGV[7]) then return cjson.encode({kind='quota'}) end
if current(KEYS[6]) >= tonumber(ARGV[8]) then return cjson.encode({kind='quota'}) end
if current(KEYS[7]) >= tonumber(ARGV[9]) then return cjson.encode({kind='quota'}) end
if current(KEYS[8]) + tonumber(ARGV[10]) > tonumber(ARGV[11]) then return cjson.encode({kind='quota'}) end
if tonumber(ARGV[12]) > 0 and current(KEYS[9]) >= tonumber(ARGV[13]) then return cjson.encode({kind='quota'}) end
local acquired = redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', ARGV[2])
if not acquired then return cjson.encode({kind='concurrency'}) end
local function bump(key, amount, ttl)
  if amount <= 0 then return end
  local value = redis.call('INCRBY', key, amount)
  if value == amount then redis.call('EXPIRE', key, ttl) end
end
bump(KEYS[2], 1, tonumber(ARGV[14]))
bump(KEYS[3], 1, tonumber(ARGV[14]))
bump(KEYS[4], tonumber(ARGV[5]), tonumber(ARGV[14]))
bump(KEYS[5], 1, tonumber(ARGV[15]))
bump(KEYS[6], 1, tonumber(ARGV[16]))
bump(KEYS[7], 1, tonumber(ARGV[16]))
bump(KEYS[8], tonumber(ARGV[10]), tonumber(ARGV[16]))
bump(KEYS[9], tonumber(ARGV[12]), tonumber(ARGV[14]))
return cjson.encode({kind='owner'})
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
    let reject;
    const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
    promise.catch(() => {});
    memoryRequests.set(key, { requestDigest, status: "processing", leaseId, promise, resolve, reject, startedAt: Date.now() });
    return { kind: "owner", mode, key, leaseId };
  }
  const raw = await upstash(["EVAL", CLAIM_SCRIPT, 1, key, requestDigest, leaseId, Date.now(), REQUEST_TTL_SECONDS]);
  const result = JSON.parse(raw);
  return { ...result, mode, key, leaseId };
}

function memoryBudgetValue(key) {
  const record = memoryBudgets.get(key);
  if (!record || record.expiresAt <= Date.now()) {
    if (record) memoryBudgets.delete(key);
    return 0;
  }
  return record.value;
}

function bumpMemoryBudget(key, amount, ttlSeconds) {
  if (amount <= 0) return;
  if (!memoryBudgets.has(key) && memoryBudgets.size >= MAX_MEMORY_BUDGET_KEYS) memoryBudgets.delete(memoryBudgets.keys().next().value);
  memoryBudgets.set(key, { value: memoryBudgetValue(key) + amount, expiresAt: Date.now() + ttlSeconds * 1000 });
}

async function acquireAdmission(mode, context) {
  const keys = admissionKeys(context);
  const leaseId = crypto.randomUUID();
  const ttlSeconds = sessionLeaseSeconds();
  const limits = admissionLimits();
  const inputChars = requestInputChars(context.body);
  const reservedTokens = inputChars + boundedInteger(process.env.LLM_MAX_TOKENS, 300, 500);
  const probeIncrement = context.body?.probe ? 1 : 0;
  if (mode === "memory") {
    const overQuota = memoryBudgetValue(keys.sessionRequests) >= limits.sessionRequests
      || memoryBudgetValue(keys.attemptRequests) >= limits.attemptRequests
      || memoryBudgetValue(keys.attemptInputChars) + inputChars > limits.attemptInputChars
      || memoryBudgetValue(keys.ipHourlyRequests) >= limits.ipHourlyRequests
      || memoryBudgetValue(keys.ipDailyRequests) >= limits.ipDailyRequests
      || memoryBudgetValue(keys.projectDailyRequests) >= limits.projectDailyRequests
      || memoryBudgetValue(keys.projectDailyTokens) + reservedTokens > limits.projectDailyTokens
      || (probeIncrement > 0 && memoryBudgetValue(keys.sessionProbes) >= limits.sessionProbes);
    if (overQuota) throw new Error("agent_quota_exceeded");
    const current = memoryAdmissions.get(keys.concurrency);
    if (current && current.expiresAt > Date.now()) throw new Error("agent_concurrency_limited");
    memoryAdmissions.set(keys.concurrency, { leaseId, expiresAt: Date.now() + ttlSeconds * 1000 });
    bumpMemoryBudget(keys.sessionRequests, 1, BUDGET_TTL_SECONDS);
    bumpMemoryBudget(keys.attemptRequests, 1, BUDGET_TTL_SECONDS);
    bumpMemoryBudget(keys.attemptInputChars, inputChars, BUDGET_TTL_SECONDS);
    bumpMemoryBudget(keys.ipHourlyRequests, 1, HOUR_WINDOW_TTL_SECONDS);
    bumpMemoryBudget(keys.ipDailyRequests, 1, DAY_WINDOW_TTL_SECONDS);
    bumpMemoryBudget(keys.projectDailyRequests, 1, DAY_WINDOW_TTL_SECONDS);
    bumpMemoryBudget(keys.projectDailyTokens, reservedTokens, DAY_WINDOW_TTL_SECONDS);
    bumpMemoryBudget(keys.sessionProbes, probeIncrement, BUDGET_TTL_SECONDS);
    return { mode, key: keys.concurrency, leaseId };
  }
  const raw = await upstash([
    "EVAL", ACQUIRE_ADMISSION_SCRIPT, 9,
    keys.concurrency, keys.sessionRequests, keys.attemptRequests, keys.attemptInputChars,
    keys.ipHourlyRequests, keys.ipDailyRequests, keys.projectDailyRequests, keys.projectDailyTokens, keys.sessionProbes,
    leaseId, ttlSeconds, limits.sessionRequests, limits.attemptRequests, inputChars, limits.attemptInputChars,
    limits.ipHourlyRequests, limits.ipDailyRequests, limits.projectDailyRequests, reservedTokens, limits.projectDailyTokens,
    probeIncrement, limits.sessionProbes,
    BUDGET_TTL_SECONDS, HOUR_WINDOW_TTL_SECONDS, DAY_WINDOW_TTL_SECONDS
  ]);
  const result = JSON.parse(raw);
  if (result.kind === "quota") throw new Error("agent_quota_exceeded");
  if (result.kind !== "owner") throw new Error("agent_concurrency_limited");
  return { mode, key: keys.concurrency, leaseId };
}

async function releaseAdmission(admission) {
  if (!admission) return;
  if (admission.mode === "memory") {
    if (memoryAdmissions.get(admission.key)?.leaseId === admission.leaseId) memoryAdmissions.delete(admission.key);
    return;
  }
  await upstash(["EVAL", RELEASE_ADMISSION_SCRIPT, 1, admission.key, admission.leaseId]);
}

async function abandon(owner, error) {
  if (owner.mode === "memory") {
    const record = memoryRequests.get(owner.key);
    if (record?.leaseId === owner.leaseId && record.status === "processing") {
      memoryRequests.delete(owner.key);
      record.reject(error);
    }
    return;
  }
  await upstash(["EVAL", ABANDON_REQUEST_SCRIPT, 1, owner.key, owner.leaseId]);
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

async function executeIdempotentAgentRequest({ sessionId, idempotencyKey, body, clientId }, executor) {
  const requestDigest = digest(stableJson(body));
  const claimed = await claim({ sessionId, idempotencyKey, requestDigest });
  if (claimed.kind === "conflict") throw new Error("idempotency_key_reused");
  if (claimed.kind === "cached") return { ...clone(claimed.result), idempotencyReplay: true };
  if (claimed.kind === "pending") return { ...await waitForPending(claimed), idempotencyReplay: true };
  let admission;
  try {
    admission = await acquireAdmission(claimed.mode, { sessionId, clientId, body, attemptId: body?.attemptId, caseId: body?.caseId });
    const result = await executor();
    return await complete(claimed, requestDigest, result);
  } catch (error) {
    await abandon(claimed, error).catch(() => {});
    throw error;
  } finally {
    await releaseAdmission(admission).catch(() => {});
  }
}

function resetMemoryAgentRequestStore() {
  memoryRequests.clear();
  memoryAdmissions.clear();
  memoryBudgets.clear();
}

module.exports = { executeIdempotentAgentRequest, resetMemoryAgentRequestStore };
