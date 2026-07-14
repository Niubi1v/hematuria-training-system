import assert from "node:assert/strict";

process.env.AZURE_SPEECH_KEY = "unit-test-only-key";
process.env.AZURE_SPEECH_REGION = "eastasia";
process.env.TTS_ALLOWED_ORIGINS = "https://niubi1v.github.io,https://preview.example.test";
process.env.TRAINING_STATE_SECRET = "unit-test-training-state-secret-with-adequate-length";
const { createSessionCapability } = require("../server/sessionCapability.js");
const { normalizeAttemptMode } = require("../server/trainingState.js");
const sessionContext = {
  zh: { attemptId: "tts-attempt-zh", caseId: "P001", language: "zh", mode: "free" },
  en: { attemptId: "tts-attempt-en", caseId: "P001", language: "en", mode: "free" }
} as const;
const sessionIds = {
  zh: createSessionCapability({ ...sessionContext.zh, mode: normalizeAttemptMode(sessionContext.zh.mode), expiresAt: Date.now() + 24 * 60 * 60 * 1000 }),
  en: createSessionCapability({ ...sessionContext.en, mode: normalizeAttemptMode(sessionContext.en.mode), expiresAt: Date.now() + 24 * 60 * 60 * 1000 })
};
const testAudioCache = new Map<string, unknown>();
const testRequestWindows = new Map<string, unknown>();
(globalThis as typeof globalThis & { __hematuriaTtsAudioCache?: Map<string, unknown>; __hematuriaTtsRequestWindows?: Map<string, unknown> }).__hematuriaTtsAudioCache = testAudioCache;
(globalThis as typeof globalThis & { __hematuriaTtsRequestWindows?: Map<string, unknown> }).__hematuriaTtsRequestWindows = testRequestWindows;

const originalFetch = globalThis.fetch;
let fetchCalls = 0;
let providerDelayMs = 0;
globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
  assert.equal(init?.headers && (init.headers as Record<string, string>)["Ocp-Apim-Subscription-Key"], "unit-test-only-key");
  fetchCalls += 1;
  if (providerDelayMs) await new Promise((resolve) => setTimeout(resolve, providerDelayMs));
  return new Response(new Uint8Array([0x49, 0x44, 0x33, fetchCalls % 256]), { status: 200, headers: { "Content-Type": "audio/mpeg" } });
}) as typeof fetch;

const handler = require("../api/tts.js");
const { resetMemoryTtsRequestStore } = require("../server/ttsRequestStore.js");

async function call(voiceName: string, text: string, options: { rate?: number; pitch?: number; ip?: string; origin?: string; body?: unknown; contentType?: string; method?: string; omitCapability?: boolean } = {}) {
  let statusCode = 200;
  let payload: unknown;
  const headers: Record<string, string> = {};
  const language = voiceName.startsWith("en-US") ? "en" : "zh";
  const capability = options.omitCapability ? {} : { ...sessionContext[language], sessionId: sessionIds[language] };
  const defaultBody = { ...capability, voiceName, text, ...(options.rate === undefined ? {} : { rate: options.rate }), ...(options.pitch === undefined ? {} : { pitch: options.pitch }) };
  const body = options.body && typeof options.body === "object" && !Array.isArray(options.body)
    ? { ...capability, ...options.body as Record<string, unknown> }
    : options.body ?? defaultBody;
  const req = {
    method: options.method || "POST",
    body,
    headers: { origin: options.origin || "https://niubi1v.github.io", "content-type": options.contentType || "application/json" },
    socket: { remoteAddress: options.ip || `tts-${voiceName}` }
  };
  const res = {
    setHeader(name: string, value: string) { headers[name.toLowerCase()] = value; },
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { payload = value; return this; },
    send(value: unknown) { payload = value; return this; },
    end() { return this; }
  };
  await handler(req, res);
  return { statusCode, payload, headers };
}

function clearDurableLimitOverrides() {
  for (const name of [
    "TTS_SESSION_DAILY_REQUEST_LIMIT",
    "TTS_IP_HOURLY_REQUEST_LIMIT",
    "TTS_IP_DAILY_REQUEST_LIMIT",
    "TTS_PROJECT_DAILY_REQUEST_LIMIT",
    "TTS_PROJECT_DAILY_CHAR_BUDGET"
  ]) delete process.env[name];
}

async function verifyPersistentTtsStoreContract() {
  const providerFetch = globalThis.fetch;
  process.env.TTS_REQUEST_STORE_MODE = "upstash";
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "unit-test-redis-token";
  const commands: unknown[][] = [];
  let admissionOutcome: "owner" | "quota" | "in_progress" = "owner";
  let persistentProviderCalls = 0;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input) === "https://redis.example.test") {
      const command = JSON.parse(String(init?.body || "[]")) as unknown[];
      commands.push(command);
      const script = String(command[1] || "");
      const result = script.includes("local function current") ? JSON.stringify({ kind: admissionOutcome }) : 1;
      return new Response(JSON.stringify({ result }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    persistentProviderCalls += 1;
    return new Response(new Uint8Array([0x49, 0x44, 0x33, persistentProviderCalls]), { status: 200, headers: { "Content-Type": "audio/mpeg" } });
  }) as typeof fetch;
  testAudioCache.clear();
  try {
    const owner = await call("en-US-JennyNeural", "Persistent owner request", { ip: "203.0.113.51" });
    assert.equal(owner.statusCode, 200);
    assert.equal(persistentProviderCalls, 1);
    assert.equal(commands.length, 2, "persistent owner path must atomically admit and release its tuple lease");
    const admission = commands[0];
    assert.equal(admission[2], 6, "persistent TTS admission must atomically evaluate six keys");
    assert.doesNotMatch(JSON.stringify(commands), new RegExp(`${sessionIds.en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|203\\.0\\.113\\.51`));

    commands.length = 0;
    admissionOutcome = "quota";
    const quota = await call("en-US-JennyNeural", "Persistent quota request", { ip: "203.0.113.52" });
    assert.equal(quota.statusCode, 429);
    assert.equal(quota.payload && (quota.payload as { code?: string }).code, "tts_quota_exceeded");
    assert.equal(persistentProviderCalls, 1, "persistent quota rejection must not call the speech provider");
    assert.equal(commands.length, 1, "persistent quota rejection must not attempt an unowned lease release");

    commands.length = 0;
    admissionOutcome = "in_progress";
    const duplicate = await call("en-US-JennyNeural", "Persistent duplicate request", { ip: "203.0.113.53" });
    assert.equal(duplicate.statusCode, 425);
    assert.equal(duplicate.payload && (duplicate.payload as { code?: string }).code, "tts_request_in_progress");
    assert.equal(persistentProviderCalls, 1, "cross-instance tuple contention must not call the speech provider twice");
    assert.equal(commands.length, 1);
  } finally {
    globalThis.fetch = providerFetch;
    delete process.env.TTS_REQUEST_STORE_MODE;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    testAudioCache.clear();
    resetMemoryTtsRequestStore();
  }
}

async function main() {
  const fetchesBeforeCapability = fetchCalls;
  const missingCapability = await call("en-US-JennyNeural", "Capability required", { ip: "capability-missing", omitCapability: true });
  assert.equal(missingCapability.statusCode, 401, "cloud TTS must require a valid Patient session capability");
  assert.equal(fetchCalls, fetchesBeforeCapability, "missing TTS capability must be rejected before the provider");

  for (const [label, overrides] of [
    ["forged", { sessionId: `${sessionIds.en}tampered` }],
    ["case", { caseId: "P002" }],
    ["language", { language: "zh" }],
    ["mode", { mode: "osce" }]
  ] as const) {
    const denied = await call("en-US-JennyNeural", "Capability boundary", {
      ip: `capability-${label}`,
      body: { voiceName: "en-US-JennyNeural", text: "Capability boundary", ...overrides }
    });
    assert.equal(denied.statusCode, 401, `${label} capability mismatch must be rejected`);
  }
  const crossVoice = await call("zh-CN-XiaoxiaoNeural", "语言不匹配", {
    ip: "capability-voice-language",
    body: { voiceName: "en-US-JennyNeural", text: "Language mismatch" }
  });
  assert.equal(crossVoice.statusCode, 400);
  const originalCapabilityNow = Date.now;
  const capabilityNow = originalCapabilityNow();
  const expiringSession = createSessionCapability({
    ...sessionContext.en,
    mode: normalizeAttemptMode(sessionContext.en.mode),
    expiresAt: capabilityNow + 100
  });
  Date.now = () => capabilityNow + 101;
  try {
    const expired = await call("en-US-JennyNeural", "Expired capability", {
      ip: "capability-expired",
      body: { voiceName: "en-US-JennyNeural", text: "Expired capability", sessionId: expiringSession }
    });
    assert.equal(expired.statusCode, 401, "expired TTS capabilities must be rejected");
  } finally {
    Date.now = originalCapabilityNow;
  }
  assert.equal(fetchCalls, fetchesBeforeCapability, "invalid TTS capabilities and language tuples must not call the provider");

  const fetchesBeforeRejected = fetchCalls;
  assert.equal((await call("en-US-JennyNeural", "unused", { method: "GET", ip: "method-rejected" })).statusCode, 405);
  assert.equal((await call("en-US-JennyNeural", "unused", { origin: "https://evil.example", ip: "origin-rejected" })).statusCode, 403);
  assert.equal((await call("en-US-JennyNeural", "", { ip: "text-rejected" })).statusCode, 400);
  assert.equal((await call("attacker-controlled-voice", "Hello", { ip: "voice-rejected" })).statusCode, 400);
  assert.equal((await call("en-US-JennyNeural", "Hello", {
    ip: "field-rejected",
    body: { voiceName: "en-US-JennyNeural", text: "Hello", model: "attacker-controlled" }
  })).statusCode, 400);
  assert.equal(fetchCalls, fetchesBeforeRejected, "method, origin, text, voice, and field rejection must happen before the provider");

  process.env.TTS_RATE_LIMIT_PER_MINUTE = "1";
  testRequestWindows.clear();
  const beforeRateLimit = fetchCalls;
  assert.equal((await call("en-US-JennyNeural", "Rate limit first", { ip: "rate-limited-client" })).statusCode, 200);
  const rateLimited = await call("en-US-JennyNeural", "Rate limit second", { ip: "rate-limited-client" });
  assert.equal(rateLimited.statusCode, 429);
  assert.ok(Number(rateLimited.headers["retry-after"]) >= 1);
  assert.equal(fetchCalls, beforeRateLimit + 1, "rate-limit rejection must not call the provider");
  delete process.env.TTS_RATE_LIMIT_PER_MINUTE;
  testRequestWindows.clear();

  process.env.TTS_SESSION_DAILY_REQUEST_LIMIT = "1";
  resetMemoryTtsRequestStore();
  const beforeDurableBudget = fetchCalls;
  assert.equal((await call("en-US-JennyNeural", "Durable budget first", { ip: "durable-budget-a" })).statusCode, 200);
  const durableLimited = await call("en-US-JennyNeural", "Durable budget second", { ip: "durable-budget-b" });
  assert.equal(durableLimited.statusCode, 429, "TTS must enforce a session budget beyond one serverless instance");
  assert.equal(fetchCalls, beforeDurableBudget + 1, "durable TTS quota rejection must not call the provider");
  delete process.env.TTS_SESSION_DAILY_REQUEST_LIMIT;
  resetMemoryTtsRequestStore();

  const quotaScenarios = [
    { variable: "TTS_IP_HOURLY_REQUEST_LIMIT", sameIp: true, label: "hourly IP" },
    { variable: "TTS_IP_DAILY_REQUEST_LIMIT", sameIp: true, label: "daily IP" },
    { variable: "TTS_PROJECT_DAILY_REQUEST_LIMIT", sameIp: false, label: "daily project request" }
  ] as const;
  for (const scenario of quotaScenarios) {
    clearDurableLimitOverrides();
    process.env.TTS_SESSION_DAILY_REQUEST_LIMIT = "200";
    process.env[scenario.variable] = "1";
    resetMemoryTtsRequestStore();
    const beforeScenario = fetchCalls;
    const firstIp = `durable-${scenario.label}-a`;
    const secondIp = scenario.sameIp ? firstIp : `durable-${scenario.label}-b`;
    assert.equal((await call("en-US-JennyNeural", `${scenario.label} first`, { ip: firstIp })).statusCode, 200);
    assert.equal((await call("en-US-JennyNeural", `${scenario.label} second`, { ip: secondIp })).statusCode, 429);
    assert.equal(fetchCalls, beforeScenario + 1, `${scenario.label} rejection must not call the provider`);
  }
  clearDurableLimitOverrides();
  process.env.TTS_SESSION_DAILY_REQUEST_LIMIT = "200";
  process.env.TTS_PROJECT_DAILY_CHAR_BUDGET = "5";
  resetMemoryTtsRequestStore();
  const beforeCharBudget = fetchCalls;
  assert.equal((await call("en-US-JennyNeural", "12345", { ip: "durable-char-a" })).statusCode, 200);
  assert.equal((await call("en-US-JennyNeural", "6", { ip: "durable-char-b" })).statusCode, 429);
  assert.equal(fetchCalls, beforeCharBudget + 1, "daily project character-budget rejection must not call the provider");
  clearDurableLimitOverrides();
  resetMemoryTtsRequestStore();

  const originalStoreEnvironment = Object.fromEntries([
    "VERCEL", "TTS_REQUEST_STORE_MODE", "AGENT_REQUEST_STORE_MODE", "TRAINING_ATTEMPT_STORE_MODE",
    "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"
  ].map((name) => [name, process.env[name]]));
  const beforeFailClosed = fetchCalls;
  process.env.VERCEL = "1";
  delete process.env.TTS_REQUEST_STORE_MODE;
  delete process.env.AGENT_REQUEST_STORE_MODE;
  delete process.env.TRAINING_ATTEMPT_STORE_MODE;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  const failClosed = await call("en-US-JennyNeural", "Persistent protection required", { ip: "durable-store-missing" });
  assert.equal(failClosed.statusCode, 503, "serverless TTS must fail closed without a persistent request store");
  assert.equal(fetchCalls, beforeFailClosed, "a missing serverless request store must not call the provider");
  for (const [name, value] of Object.entries(originalStoreEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  for (const [voiceName, text] of [
    ["zh-CN-XiaoxiaoNeural", "医生您好"], ["zh-CN-YunxiNeural", "医生您好"],
    ["en-US-JennyNeural", "Hello doctor"], ["en-US-GuyNeural", "Hello doctor"]
  ]) {
    const response = await call(voiceName, text);
    assert.equal(response.statusCode, 200, `${voiceName} should return success`);
    assert.equal(response.headers["content-type"], "audio/mpeg", `${voiceName} should return audio/mpeg`);
    assert.equal(response.headers["x-tts-cache"], "MISS", `${voiceName} must use an independent cache tuple`);
    assert.ok(Buffer.isBuffer(response.payload), `${voiceName} should return an audio buffer`);
  }

  const collisionA = await call("zh-CN-XiaoxiaoNeural", "tts-pbfuso-17pa", { ip: "collision-a" });
  const fetchesAfterA = fetchCalls;
  const collisionB = await call("zh-CN-XiaoxiaoNeural", "tts-jzkt95-23ce", { ip: "collision-b" });
  assert.equal(collisionA.headers["x-tts-cache"], "MISS");
  assert.equal(collisionB.headers["x-tts-cache"], "MISS", "distinct text tuples must never share cached audio even when their legacy FNV keys collide");
  assert.equal(fetchCalls, fetchesAfterA + 1, "the second colliding tuple must call the provider independently");
  assert.notDeepEqual(collisionB.payload, collisionA.payload, "different text tuples must not receive the same cached audio buffer");

  const collisionBRepeat = await call("zh-CN-XiaoxiaoNeural", "tts-jzkt95-23ce", { ip: "collision-b-repeat" });
  assert.equal(collisionBRepeat.headers["x-tts-cache"], "HIT", "an exact tuple should still use the cache");
  assert.deepEqual(collisionBRepeat.payload, collisionB.payload);

  const secondEnglishSession = createSessionCapability({
    ...sessionContext.en,
    mode: normalizeAttemptMode(sessionContext.en.mode),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000
  });
  const sessionScopedA = await call("en-US-JennyNeural", "Session-scoped audio", { ip: "session-scope-a" });
  const fetchesAfterSessionA = fetchCalls;
  const sessionScopedB = await call("en-US-JennyNeural", "Session-scoped audio", {
    ip: "session-scope-b",
    body: { voiceName: "en-US-JennyNeural", text: "Session-scoped audio", sessionId: secondEnglishSession }
  });
  assert.equal(sessionScopedA.headers["x-tts-cache"], "MISS");
  assert.equal(sessionScopedB.headers["x-tts-cache"], "MISS", "different Patient sessions must not share personalized TTS cache entries");
  assert.equal(fetchCalls, fetchesAfterSessionA + 1);

  const parameterBase = await call("en-US-JennyNeural", "Cache parameter isolation", { rate: 0.9, pitch: 1, ip: "parameter-base" });
  const parameterRate = await call("en-US-JennyNeural", "Cache parameter isolation", { rate: 1.1, pitch: 1, ip: "parameter-rate" });
  const parameterPitch = await call("en-US-JennyNeural", "Cache parameter isolation", { rate: 0.9, pitch: 1.1, ip: "parameter-pitch" });
  assert.equal(parameterBase.headers["x-tts-cache"], "MISS");
  assert.equal(parameterRate.headers["x-tts-cache"], "MISS", "rate must be part of the cache tuple");
  assert.equal(parameterPitch.headers["x-tts-cache"], "MISS", "pitch must be part of the cache tuple");

  const originalNow = Date.now;
  let fakeNow = originalNow();
  Date.now = () => fakeNow;
  try {
    const ttlFirst = await call("en-US-GuyNeural", "Cache TTL", { ip: "ttl-first" });
    const fetchesBeforeExpiry = fetchCalls;
    fakeNow += 3_600_001;
    const ttlExpired = await call("en-US-GuyNeural", "Cache TTL", { ip: "ttl-expired" });
    assert.equal(ttlFirst.headers["x-tts-cache"], "MISS");
    assert.equal(ttlExpired.headers["x-tts-cache"], "MISS", "expired audio must not be returned from the cache");
    assert.equal(fetchCalls, fetchesBeforeExpiry + 1, "an expired tuple must call the provider again");
  } finally {
    Date.now = originalNow;
  }

  const originA = await call("zh-CN-YunxiNeural", "Origin-scoped audio", { ip: "origin-a" });
  const originB = await call("zh-CN-YunxiNeural", "Origin-scoped audio", { ip: "origin-b", origin: "https://preview.example.test" });
  assert.equal(originA.headers["x-tts-cache"], "MISS");
  assert.equal(originB.headers["x-tts-cache"], "MISS", "allowed origins must not share cached user text");
  assert.notDeepEqual(originB.payload, originA.payload);

  await call("en-US-JennyNeural", "Concurrent warm cache", { ip: "concurrent-warm" });
  const fetchesBeforeConcurrentHits = fetchCalls;
  const concurrentHits = await Promise.all([
    call("en-US-JennyNeural", "Concurrent warm cache", { ip: "concurrent-hit-a" }),
    call("en-US-JennyNeural", "Concurrent warm cache", { ip: "concurrent-hit-b" })
  ]);
  assert.deepEqual(concurrentHits.map((response) => response.headers["x-tts-cache"]), ["HIT", "HIT"]);
  assert.equal(fetchCalls, fetchesBeforeConcurrentHits, "concurrent reads of a warm tuple must not call the provider");

  providerDelayMs = 20;
  const fetchesBeforeColdConcurrent = fetchCalls;
  const coldConcurrent = await Promise.all([
    call("en-US-JennyNeural", "Concurrent cold cache", { ip: "concurrent-cold-a" }),
    call("en-US-JennyNeural", "Concurrent cold cache", { ip: "concurrent-cold-b" })
  ]);
  providerDelayMs = 0;
  assert.deepEqual(coldConcurrent.map((response) => response.statusCode), [200, 200]);
  assert.equal(fetchCalls, fetchesBeforeColdConcurrent + 1, "concurrent cold requests for one tuple must share a single provider call");

  const fetchesBeforeOversized = fetchCalls;
  const oversized = await call("en-US-JennyNeural", "Short text", {
    ip: "oversized-body",
    body: JSON.stringify({ voiceName: "en-US-JennyNeural", text: "Short text", padding: "x".repeat(20 * 1024) })
  });
  assert.equal(oversized.statusCode, 413);
  assert.deepEqual(oversized.payload, { code: "request_body_too_large", message: "TTS request body is too large" });
  assert.equal(fetchCalls, fetchesBeforeOversized, "oversized TTS input must be rejected before any provider call");

  const malformed = await call("en-US-JennyNeural", "unused", { ip: "malformed-json", body: "{" });
  assert.equal(malformed.statusCode, 400);
  assert.equal(fetchCalls, fetchesBeforeOversized, "malformed JSON must be rejected before any provider call");

  const wrongContentType = await call("en-US-JennyNeural", "unused", { ip: "wrong-content-type", contentType: "text/plain" });
  assert.equal(wrongContentType.statusCode, 415);
  assert.equal(fetchCalls, fetchesBeforeOversized, "non-JSON TTS input must be rejected before any provider call");

  process.env.TTS_SESSION_DAILY_REQUEST_LIMIT = "200";
  resetMemoryTtsRequestStore();
  for (let index = 0; index < 101; index += 1) {
    const response = await call("en-US-GuyNeural", `Capacity entry ${index}`, { ip: `capacity-${index}` });
    assert.equal(response.statusCode, 200, `capacity fixture ${index} should reach the cache`);
  }
  assert.ok(testAudioCache.size <= 100, `TTS cache must remain bounded, got ${testAudioCache.size}`);
  const fetchesBeforeEvictedRead = fetchCalls;
  const evictedRead = await call("en-US-GuyNeural", "Capacity entry 0", { ip: "capacity-evicted" });
  assert.equal(evictedRead.headers["x-tts-cache"], "MISS", "the oldest entry must be evicted once capacity is exceeded");
  assert.equal(fetchCalls, fetchesBeforeEvictedRead + 1);
  delete process.env.TTS_SESSION_DAILY_REQUEST_LIMIT;
  resetMemoryTtsRequestStore();
  await verifyPersistentTtsStoreContract();
  globalThis.fetch = originalFetch;
  console.log("TTS API voice, SHA-256 tuple, origin/parameter isolation, TTL, concurrency, and bounded eviction contracts passed.");
}

void main();
