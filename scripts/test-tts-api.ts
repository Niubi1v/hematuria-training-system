import assert from "node:assert/strict";

process.env.AZURE_SPEECH_KEY = "unit-test-only-key";
process.env.AZURE_SPEECH_REGION = "eastasia";
process.env.TTS_ALLOWED_ORIGINS = "https://niubi1v.github.io,https://preview.example.test";
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

async function call(voiceName: string, text: string, options: { rate?: number; pitch?: number; ip?: string; origin?: string; body?: unknown; contentType?: string; method?: string } = {}) {
  let statusCode = 200;
  let payload: unknown;
  const headers: Record<string, string> = {};
  const req = {
    method: options.method || "POST",
    body: options.body ?? { voiceName, text, ...(options.rate === undefined ? {} : { rate: options.rate }), ...(options.pitch === undefined ? {} : { pitch: options.pitch }) },
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

async function main() {
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

  for (let index = 0; index < 101; index += 1) {
    await call("en-US-GuyNeural", `Capacity entry ${index}`, { ip: `capacity-${index}` });
  }
  assert.ok(testAudioCache.size <= 100, `TTS cache must remain bounded, got ${testAudioCache.size}`);
  const fetchesBeforeEvictedRead = fetchCalls;
  const evictedRead = await call("en-US-GuyNeural", "Capacity entry 0", { ip: "capacity-evicted" });
  assert.equal(evictedRead.headers["x-tts-cache"], "MISS", "the oldest entry must be evicted once capacity is exceeded");
  assert.equal(fetchCalls, fetchesBeforeEvictedRead + 1);
  globalThis.fetch = originalFetch;
  console.log("TTS API voice, SHA-256 tuple, origin/parameter isolation, TTL, concurrency, and bounded eviction contracts passed.");
}

void main();
