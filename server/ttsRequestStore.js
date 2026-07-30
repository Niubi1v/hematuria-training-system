const crypto = require("node:crypto");

const HOUR_TTL_SECONDS = 2 * 60 * 60;
const DAY_TTL_SECONDS = 2 * 24 * 60 * 60;
const DEFAULT_LEASE_SECONDS = 30;
const MAX_MEMORY_KEYS = 10_000;
const memoryCounters = globalThis.__hematuriaTtsBudgetStore || new Map();
const memoryLeases = globalThis.__hematuriaTtsLeaseStore || new Map();
globalThis.__hematuriaTtsBudgetStore = memoryCounters;
globalThis.__hematuriaTtsLeaseStore = memoryLeases;

function digest(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function boundedInteger(value, fallback, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function storeMode() {
  const configured = String(process.env.TTS_REQUEST_STORE_MODE || process.env.AGENT_REQUEST_STORE_MODE || process.env.TRAINING_ATTEMPT_STORE_MODE || "").toLowerCase();
  if (configured === "memory") return process.env.VERCEL || process.env.NODE_ENV === "production" ? "unavailable" : "memory";
  if (configured === "upstash") return "upstash";
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) return "upstash";
  if (process.env.VERCEL || process.env.NODE_ENV === "production") return "unavailable";
  return "memory";
}

async function upstash(command) {
  const url = String(process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/+$/, "");
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || "");
  if (!url || !token) throw new Error("tts_request_store_unavailable");
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(5000)
    });
  } catch {
    throw new Error("tts_request_store_unavailable");
  }
  if (!response.ok) throw new Error("tts_request_store_unavailable");
  const payload = await response.json();
  if (payload.error) throw new Error("tts_request_store_unavailable");
  return payload.result;
}

function limits() {
  return {
    sessionDaily: boundedInteger(process.env.TTS_SESSION_DAILY_REQUEST_LIMIT, 60, 1000),
    ipHourly: boundedInteger(process.env.TTS_IP_HOURLY_REQUEST_LIMIT, 120, 5000),
    ipDaily: boundedInteger(process.env.TTS_IP_DAILY_REQUEST_LIMIT, 500, 20_000),
    projectDaily: boundedInteger(process.env.TTS_PROJECT_DAILY_REQUEST_LIMIT, 5000, 100_000),
    projectChars: boundedInteger(process.env.TTS_PROJECT_DAILY_CHAR_BUDGET, 1_000_000, 50_000_000),
    leaseSeconds: boundedInteger(process.env.TTS_TUPLE_LEASE_SECONDS, DEFAULT_LEASE_SECONDS, 120)
  };
}

function keys({ sessionId, clientId, tupleKey }) {
  const now = new Date().toISOString();
  const hour = now.slice(0, 13);
  const day = now.slice(0, 10);
  const session = digest(sessionId);
  const client = digest(clientId || "unknown");
  return {
    lease: `hematuria:tts-lease:v1:${digest(tupleKey)}`,
    sessionDaily: `hematuria:tts-budget:v1:session:${session}:${day}`,
    ipHourly: `hematuria:tts-budget:v1:ip-hour:${client}:${hour}`,
    ipDaily: `hematuria:tts-budget:v1:ip-day:${client}:${day}`,
    projectDaily: `hematuria:tts-budget:v1:project:${day}`,
    projectChars: `hematuria:tts-budget:v1:chars:${day}`
  };
}

const ACQUIRE_SCRIPT = `
local function current(key)
  return tonumber(redis.call('GET', key) or '0')
end
if current(KEYS[2]) >= tonumber(ARGV[3]) then return cjson.encode({kind='quota'}) end
if current(KEYS[3]) >= tonumber(ARGV[4]) then return cjson.encode({kind='quota'}) end
if current(KEYS[4]) >= tonumber(ARGV[5]) then return cjson.encode({kind='quota'}) end
if current(KEYS[5]) >= tonumber(ARGV[6]) then return cjson.encode({kind='quota'}) end
if current(KEYS[6]) + tonumber(ARGV[7]) > tonumber(ARGV[8]) then return cjson.encode({kind='quota'}) end
local acquired = redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', ARGV[2])
if not acquired then return cjson.encode({kind='in_progress'}) end
local function bump(key, amount, ttl)
  local value = redis.call('INCRBY', key, amount)
  if value == amount then redis.call('EXPIRE', key, ttl) end
end
bump(KEYS[2], 1, tonumber(ARGV[10]))
bump(KEYS[3], 1, tonumber(ARGV[9]))
bump(KEYS[4], 1, tonumber(ARGV[10]))
bump(KEYS[5], 1, tonumber(ARGV[10]))
bump(KEYS[6], tonumber(ARGV[7]), tonumber(ARGV[10]))
return cjson.encode({kind='owner'})
`;

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

function memoryValue(key) {
  const record = memoryCounters.get(key);
  if (!record || record.expiresAt <= Date.now()) {
    if (record) memoryCounters.delete(key);
    return 0;
  }
  return record.value;
}

function bumpMemory(key, amount, ttlSeconds) {
  if (!memoryCounters.has(key) && memoryCounters.size >= MAX_MEMORY_KEYS) memoryCounters.delete(memoryCounters.keys().next().value);
  memoryCounters.set(key, { value: memoryValue(key) + amount, expiresAt: Date.now() + ttlSeconds * 1000 });
}

async function acquireTtsRequest({ sessionId, clientId, tupleKey, textLength }) {
  const mode = storeMode();
  if (mode === "unavailable") throw new Error("tts_request_store_unavailable");
  const budgetKeys = keys({ sessionId, clientId, tupleKey });
  const configured = limits();
  const leaseId = crypto.randomUUID();
  const safeTextLength = Math.max(0, Number(textLength) || 0);
  if (mode === "memory") {
    const overQuota = memoryValue(budgetKeys.sessionDaily) >= configured.sessionDaily
      || memoryValue(budgetKeys.ipHourly) >= configured.ipHourly
      || memoryValue(budgetKeys.ipDaily) >= configured.ipDaily
      || memoryValue(budgetKeys.projectDaily) >= configured.projectDaily
      || memoryValue(budgetKeys.projectChars) + safeTextLength > configured.projectChars;
    if (overQuota) throw new Error("tts_quota_exceeded");
    const lease = memoryLeases.get(budgetKeys.lease);
    if (lease && lease.expiresAt > Date.now()) throw new Error("tts_request_in_progress");
    memoryLeases.set(budgetKeys.lease, { leaseId, expiresAt: Date.now() + configured.leaseSeconds * 1000 });
    bumpMemory(budgetKeys.sessionDaily, 1, DAY_TTL_SECONDS);
    bumpMemory(budgetKeys.ipHourly, 1, HOUR_TTL_SECONDS);
    bumpMemory(budgetKeys.ipDaily, 1, DAY_TTL_SECONDS);
    bumpMemory(budgetKeys.projectDaily, 1, DAY_TTL_SECONDS);
    bumpMemory(budgetKeys.projectChars, safeTextLength, DAY_TTL_SECONDS);
    return { mode, key: budgetKeys.lease, leaseId };
  }
  const raw = await upstash([
    "EVAL", ACQUIRE_SCRIPT, 6,
    budgetKeys.lease, budgetKeys.sessionDaily, budgetKeys.ipHourly, budgetKeys.ipDaily, budgetKeys.projectDaily, budgetKeys.projectChars,
    leaseId, configured.leaseSeconds, configured.sessionDaily, configured.ipHourly, configured.ipDaily, configured.projectDaily,
    safeTextLength, configured.projectChars, HOUR_TTL_SECONDS, DAY_TTL_SECONDS
  ]);
  const result = JSON.parse(raw);
  if (result.kind === "quota") throw new Error("tts_quota_exceeded");
  if (result.kind !== "owner") throw new Error("tts_request_in_progress");
  return { mode, key: budgetKeys.lease, leaseId };
}

async function releaseTtsRequest(lease) {
  if (!lease) return;
  if (lease.mode === "memory") {
    if (memoryLeases.get(lease.key)?.leaseId === lease.leaseId) memoryLeases.delete(lease.key);
    return;
  }
  await upstash(["EVAL", RELEASE_SCRIPT, 1, lease.key, lease.leaseId]);
}

function resetMemoryTtsRequestStore() {
  memoryCounters.clear();
  memoryLeases.clear();
}

module.exports = { acquireTtsRequest, releaseTtsRequest, resetMemoryTtsRequestStore };
