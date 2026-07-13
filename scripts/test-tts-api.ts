import assert from "node:assert/strict";

process.env.AZURE_SPEECH_KEY = "unit-test-only-key";
process.env.AZURE_SPEECH_REGION = "eastasia";
process.env.TTS_ALLOWED_ORIGINS = "https://niubi1v.github.io,https://preview.example.test";
const testAudioCache = new Map<string, unknown>();
(globalThis as typeof globalThis & { __hematuriaTtsAudioCache?: Map<string, unknown>; __hematuriaTtsRequestWindows?: Map<string, unknown> }).__hematuriaTtsAudioCache = testAudioCache;
(globalThis as typeof globalThis & { __hematuriaTtsRequestWindows?: Map<string, unknown> }).__hematuriaTtsRequestWindows = new Map();

const originalFetch = globalThis.fetch;
let fetchCalls = 0;
globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
  assert.equal(init?.headers && (init.headers as Record<string, string>)["Ocp-Apim-Subscription-Key"], "unit-test-only-key");
  fetchCalls += 1;
  return new Response(new Uint8Array([0x49, 0x44, 0x33, fetchCalls % 256]), { status: 200, headers: { "Content-Type": "audio/mpeg" } });
}) as typeof fetch;

const handler = require("../api/tts.js");

async function call(voiceName: string, text: string, options: { rate?: number; pitch?: number; ip?: string; origin?: string } = {}) {
  let statusCode = 200;
  let payload: unknown;
  const headers: Record<string, string> = {};
  const req = {
    method: "POST",
    body: { voiceName, text, ...(options.rate === undefined ? {} : { rate: options.rate }), ...(options.pitch === undefined ? {} : { pitch: options.pitch }) },
    headers: { origin: options.origin || "https://niubi1v.github.io" },
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
