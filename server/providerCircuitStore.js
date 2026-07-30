const crypto = require("node:crypto");
const { resolveRedisRestCredentials } = require("./redisRestCredentials.js");

const MAX_MEMORY_CIRCUITS = 100;
const memoryCircuits = globalThis.__hematuriaProviderCircuits || new Map();
const memoryProbes = globalThis.__hematuriaProviderCircuitProbes || new Map();
globalThis.__hematuriaProviderCircuits = memoryCircuits;
globalThis.__hematuriaProviderCircuitProbes = memoryProbes;

function boundedInteger(value, fallback, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function settings(minimumProbeSeconds = 0) {
  const openSeconds = boundedInteger(process.env.LLM_PROVIDER_CIRCUIT_OPEN_SECONDS, 30, 300);
  const probeSeconds = Math.max(
    boundedInteger(process.env.LLM_PROVIDER_CIRCUIT_PROBE_SECONDS, 15, 120),
    Math.min(Math.max(0, Number(minimumProbeSeconds) || 0), 120)
  );
  return {
    threshold: boundedInteger(process.env.LLM_PROVIDER_CIRCUIT_FAILURE_THRESHOLD, 3, 20),
    openSeconds,
    probeSeconds,
    failureTtlSeconds: Math.max(
      boundedInteger(process.env.LLM_PROVIDER_CIRCUIT_FAILURE_TTL_SECONDS, 600, 3600),
      openSeconds + 120 + 60
    ),
    storeTimeoutMs: boundedInteger(process.env.LLM_PROVIDER_CIRCUIT_STORE_TIMEOUT_MS, 1000, 3000)
  };
}

function storeMode() {
  const configured = String(process.env.LLM_PROVIDER_CIRCUIT_STORE_MODE || process.env.AGENT_REQUEST_STORE_MODE || process.env.TRAINING_ATTEMPT_STORE_MODE || "").toLowerCase();
  if (configured === "memory") return process.env.VERCEL || process.env.NODE_ENV === "production" ? "unavailable" : "memory";
  if (configured === "upstash") return "upstash";
  const credentials = resolveRedisRestCredentials();
  if (credentials.url && credentials.token) return "upstash";
  if (process.env.VERCEL || process.env.NODE_ENV === "production") return "unavailable";
  return "memory";
}

function digest(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function circuitKeys(config) {
  const scope = digest(JSON.stringify([config.provider, config.baseUrl, config.model, config.endpointType]));
  return {
    state: `hematuria:llm-circuit:v1:${scope}`,
    probe: `hematuria:llm-circuit-probe:v1:${scope}`
  };
}

function circuitError(retryAfterSeconds) {
  const error = new Error("provider_circuit_open");
  error.code = "provider_circuit_open";
  error.retryAfterSeconds = Math.max(1, Number(retryAfterSeconds) || 1);
  return error;
}

async function upstash(command) {
  const credentials = resolveRedisRestCredentials();
  const url = credentials.url.replace(/\/+$/, "");
  const token = credentials.token;
  if (!url || !token) throw new Error("provider_circuit_store_unavailable");
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(settings().storeTimeoutMs)
    });
  } catch {
    throw new Error("provider_circuit_store_unavailable");
  }
  if (!response.ok) throw new Error("provider_circuit_store_unavailable");
  const payload = await response.json();
  if (payload.error) throw new Error("provider_circuit_store_unavailable");
  return payload.result;
}

const ENTER_SCRIPT = `
local failures = tonumber(redis.call('HGET', KEYS[1], 'failures') or '0')
local openUntil = tonumber(redis.call('HGET', KEYS[1], 'openUntil') or '0')
local now = tonumber(ARGV[1])
if openUntil > now then
  return cjson.encode({kind='open', failures=failures, retryAfter=math.ceil((openUntil-now)/1000)})
end
if openUntil > 0 then
  local acquired = redis.call('SET', KEYS[2], ARGV[2], 'NX', 'EX', ARGV[3])
  if not acquired then return cjson.encode({kind='open', failures=failures, retryAfter=1}) end
  return cjson.encode({kind='probe', failures=failures})
end
return cjson.encode({kind='closed', failures=failures})
`;

const FAILURE_SCRIPT = `
local failures = redis.call('HINCRBY', KEYS[1], 'failures', 1)
local opened = 0
if failures >= tonumber(ARGV[1]) then
  redis.call('HSET', KEYS[1], 'openUntil', ARGV[2])
  opened = 1
else
  redis.call('HSET', KEYS[1], 'openUntil', 0)
end
redis.call('EXPIRE', KEYS[1], ARGV[3])
if ARGV[4] ~= '' and redis.call('GET', KEYS[2]) == ARGV[4] then redis.call('DEL', KEYS[2]) end
return cjson.encode({failures=failures, opened=opened})
`;

const SUCCESS_SCRIPT = `
redis.call('DEL', KEYS[1])
if ARGV[1] ~= '' and redis.call('GET', KEYS[2]) == ARGV[1] then redis.call('DEL', KEYS[2]) end
return 1
`;

function memoryState(key) {
  const state = memoryCircuits.get(key);
  if (!state || state.expiresAt <= Date.now()) {
    if (state) memoryCircuits.delete(key);
    return { failures: 0, openUntil: 0 };
  }
  return state;
}

async function enterProviderCircuit(config, { minimumProbeSeconds = 0 } = {}) {
  const mode = storeMode();
  if (mode === "unavailable") throw new Error("provider_circuit_store_unavailable");
  const keys = circuitKeys(config);
  const probeId = crypto.randomUUID();
  const configured = settings(minimumProbeSeconds);
  if (mode === "memory") {
    const state = memoryState(keys.state);
    if (state.openUntil > Date.now()) throw circuitError(Math.ceil((state.openUntil - Date.now()) / 1000));
    if (state.openUntil > 0) {
      const activeProbe = memoryProbes.get(keys.probe);
      if (activeProbe?.expiresAt > Date.now()) throw circuitError(1);
      memoryProbes.set(keys.probe, { probeId, expiresAt: Date.now() + configured.probeSeconds * 1000 });
      return { mode, keys, probeId, hadFailures: true, probe: true };
    }
    return { mode, keys, probeId: "", hadFailures: state.failures > 0, probe: false };
  }
  const raw = await upstash(["EVAL", ENTER_SCRIPT, 2, keys.state, keys.probe, Date.now(), probeId, configured.probeSeconds]);
  const result = JSON.parse(raw);
  if (result.kind === "open") throw circuitError(result.retryAfter);
  return { mode, keys, probeId: result.kind === "probe" ? probeId : "", hadFailures: Number(result.failures) > 0, probe: result.kind === "probe" };
}

async function recordProviderSuccess(admission) {
  if (!admission || (!admission.hadFailures && !admission.probe)) return;
  if (admission.mode === "memory") {
    memoryCircuits.delete(admission.keys.state);
    if (memoryProbes.get(admission.keys.probe)?.probeId === admission.probeId) memoryProbes.delete(admission.keys.probe);
    return;
  }
  await upstash(["EVAL", SUCCESS_SCRIPT, 2, admission.keys.state, admission.keys.probe, admission.probeId || ""]);
}

async function recordProviderFailure(admission) {
  if (!admission) return;
  const configured = settings();
  const openUntil = Date.now() + configured.openSeconds * 1000;
  if (admission.mode === "memory") {
    const previous = memoryState(admission.keys.state);
    const failures = previous.failures + 1;
    if (!memoryCircuits.has(admission.keys.state) && memoryCircuits.size >= MAX_MEMORY_CIRCUITS) memoryCircuits.delete(memoryCircuits.keys().next().value);
    memoryCircuits.set(admission.keys.state, {
      failures,
      openUntil: failures >= configured.threshold ? openUntil : 0,
      expiresAt: Date.now() + configured.failureTtlSeconds * 1000
    });
    if (memoryProbes.get(admission.keys.probe)?.probeId === admission.probeId) memoryProbes.delete(admission.keys.probe);
    return;
  }
  await upstash([
    "EVAL", FAILURE_SCRIPT, 2, admission.keys.state, admission.keys.probe,
    configured.threshold, openUntil, configured.failureTtlSeconds, admission.probeId || ""
  ]);
}

function resetMemoryProviderCircuitStore() {
  memoryCircuits.clear();
  memoryProbes.clear();
}

module.exports = { enterProviderCircuit, recordProviderFailure, recordProviderSuccess, resetMemoryProviderCircuitStore };
