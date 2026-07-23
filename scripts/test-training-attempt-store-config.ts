import assert from "node:assert/strict";

const ENV_NAMES = [
  "TRAINING_ATTEMPT_STORE_MODE",
  "AGENT_REQUEST_STORE_MODE",
  "LLM_PROVIDER_CIRCUIT_STORE_MODE",
  "TRAINING_STATE_SECRET",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "KV_REST_API_READ_ONLY_TOKEN",
  "KV_URL",
  "REDIS_URL",
  "REDIS_HOST",
  "REDIS_PORT",
  "REDIS_USERNAME",
  "REDIS_PASSWORD",
  "REDIS_TLS",
  "REDIS_CA_FILE",
  "REDIS_KEY_PREFIX",
  "REDIS_NAMESPACE",
  "VERCEL"
] as const;

const originalEnv = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
const originalFetch = globalThis.fetch;

function clearStoreEnv() {
  for (const name of ENV_NAMES) delete process.env[name];
  process.env.TRAINING_ATTEMPT_STORE_MODE = "upstash";
}

function restoreEnv() {
  for (const name of ENV_NAMES) {
    const value = originalEnv[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  globalThis.fetch = originalFetch;
}

async function callHealth() {
  const handler = require("../api/health.js");
  let payload: Record<string, unknown> = {};
  const req = { method: "GET", headers: {} };
  const res = {
    setHeader() {},
    status() { return this; },
    json(value: Record<string, unknown>) { payload = value; return this; }
  };
  await handler(req, res);
  return payload;
}

async function main() {
  const store = require("../server/trainingAttemptStore.js");

  clearStoreEnv();
  process.env.UPSTASH_REDIS_REST_URL = "https://upstash-primary.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "unit-test-upstash-write-token";
  assert.equal(store.assertStoreConfigured(), "upstash");
  assert.equal(store.durableAttemptStoreConfigured(), true);
  assert.equal(store.attemptStoreCredentialSource(), "upstash_rest");

  clearStoreEnv();
  process.env.KV_REST_API_URL = "https://vercel-kv.example.test";
  process.env.KV_REST_API_TOKEN = "unit-test-kv-write-token";
  assert.equal(store.assertStoreConfigured(), "upstash");
  assert.equal(store.durableAttemptStoreConfigured(), true);
  assert.equal(store.attemptStoreCredentialSource(), "vercel_kv_rest");

  clearStoreEnv();
  process.env.UPSTASH_REDIS_REST_URL = "https://upstash-primary.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "unit-test-upstash-write-token";
  process.env.KV_REST_API_URL = "https://vercel-kv.example.test";
  process.env.KV_REST_API_TOKEN = "unit-test-kv-write-token";
  assert.equal(store.attemptStoreCredentialSource(), "upstash_rest", "explicit Upstash names must take precedence");
  let requestedUrl = "";
  let authorization = "";
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    authorization = String((init?.headers as Record<string, string>)?.Authorization || "");
    return { ok: true, json: async () => ({ result: null }) } as Response;
  };
  await assert.rejects(
    store.validateCurrentAttempt({ caseId: "P003", attemptId: "attempt-priority", token: "attempt-token-test" }),
    /attempt_not_found/
  );
  assert.equal(requestedUrl, "https://upstash-primary.example.test");
  assert.equal(authorization, "Bearer unit-test-upstash-write-token");

  process.env.TRAINING_ATTEMPT_STORE_MODE = "memory";
  assert.equal(store.durableAttemptStoreConfigured(), false);
  assert.equal(store.attemptStoreCredentialSource(), "none", "health must describe the credential type actually in use");

  clearStoreEnv();
  process.env.TRAINING_ATTEMPT_STORE_MODE = "redis";
  process.env.REDIS_URL = "rediss://redis-private.example.test:6379";
  process.env.REDIS_KEY_PREFIX = "mainland-staging-test";
  assert.equal(store.assertStoreConfigured(), "redis");
  assert.equal(store.durableAttemptStoreConfigured(), true);
  assert.equal(store.attemptStoreCredentialSource(), "standard_redis_url");

  clearStoreEnv();
  process.env.TRAINING_ATTEMPT_STORE_MODE = "redis";
  process.env.REDIS_HOST = "redis.internal.example.test";
  process.env.REDIS_PORT = "6380";
  process.env.REDIS_PASSWORD = "unit-test-password";
  process.env.REDIS_TLS = "true";
  process.env.REDIS_KEY_PREFIX = "mainland-staging-fields";
  assert.equal(store.assertStoreConfigured(), "redis");
  assert.equal(store.attemptStoreCredentialSource(), "standard_redis_fields");

  clearStoreEnv();
  process.env.TRAINING_ATTEMPT_STORE_MODE = "redis";
  process.env.REDIS_URL = "redis://redis-private.example.test:6379";
  assert.throws(
    () => store.assertStoreConfigured(),
    /training_attempt_store_unavailable/,
    "Redis mode must fail closed without an environment namespace"
  );

  for (const configure of [
    () => { process.env.KV_REST_API_TOKEN = "unit-test-kv-write-token"; },
    () => { process.env.KV_REST_API_URL = "https://vercel-kv.example.test"; },
    () => {
      process.env.KV_REST_API_URL = "https://vercel-kv.example.test";
      process.env.KV_REST_API_READ_ONLY_TOKEN = "unit-test-read-only-token";
    },
    () => {
      process.env.KV_URL = "redis://not-a-rest-endpoint.example.test";
      process.env.REDIS_URL = "redis://not-a-rest-endpoint.example.test";
      process.env.KV_REST_API_READ_ONLY_TOKEN = "unit-test-read-only-token";
    }
  ]) {
    clearStoreEnv();
    configure();
    assert.throws(() => store.assertStoreConfigured(), /training_attempt_store_unavailable/);
    assert.equal(store.durableAttemptStoreConfigured(), false);
    assert.equal(store.attemptStoreCredentialSource(), "none");
  }

  clearStoreEnv();
  process.env.KV_REST_API_URL = "https://vercel-kv.example.test";
  process.env.KV_REST_API_TOKEN = "unit-test-invalid-write-token";
  globalThis.fetch = async () => ({ ok: false, status: 401 }) as Response;
  await assert.rejects(
    store.validateCurrentAttempt({ caseId: "P003", attemptId: "attempt-test", token: "attempt-token-test" }),
    (error: Error) => error.message === "training_attempt_store_unavailable"
  );

  process.env.TRAINING_STATE_SECRET = "test-only-state-secret-at-least-32-bytes";
  process.env.VERCEL = "1";
  const health = await callHealth();
  assert.equal(health.durableAttemptStoreConfigured, true);
  assert.equal(health.trainingStateConfigured, true);
  assert.equal(health.durableAttemptStoreCredentialSource, "vercel_kv_rest");
  const serializedHealth = JSON.stringify(health);
  assert.equal(serializedHealth.includes("vercel-kv.example.test"), false);
  assert.equal(serializedHealth.includes("unit-test-invalid-write-token"), false);
  assert.equal(serializedHealth.includes("unit-test-read-only-token"), false);

  const agentStore = require("../server/agentRequestStore.js");
  clearStoreEnv();
  process.env.AGENT_REQUEST_STORE_MODE = "upstash";
  process.env.KV_REST_API_URL = "https://vercel-kv.example.test";
  process.env.KV_REST_API_TOKEN = "unit-test-kv-write-token";
  const redisResults = [
    JSON.stringify({ kind: "owner" }),
    JSON.stringify({ kind: "owner" }),
    JSON.stringify({ kind: "committed" }),
    1
  ];
  const agentUrls: string[] = [];
  globalThis.fetch = async (input, init) => {
    agentUrls.push(String(input));
    assert.equal(String((init?.headers as Record<string, string>)?.Authorization || ""), "Bearer unit-test-kv-write-token");
    return { ok: true, json: async () => ({ result: redisResults.shift() }) } as Response;
  };
  const agentResult = await agentStore.executeIdempotentAgentRequest({
    sessionId: "session-test",
    idempotencyKey: "request-test",
    clientId: "client-test",
    body: { caseId: "P001", attemptId: "attempt-test", studentInput: "test" }
  }, async () => ({ answer: "test-answer" }));
  assert.deepEqual(agentResult, { answer: "test-answer" });
  assert.equal(agentUrls.length, 4);
  assert.equal(agentUrls.every((url) => url === "https://vercel-kv.example.test"), true);

  clearStoreEnv();
  process.env.AGENT_REQUEST_STORE_MODE = "upstash";
  process.env.KV_REST_API_URL = "https://vercel-kv.example.test";
  process.env.KV_REST_API_READ_ONLY_TOKEN = "unit-test-read-only-token";
  await assert.rejects(
    agentStore.executeIdempotentAgentRequest({
      sessionId: "session-test",
      idempotencyKey: "request-readonly-test",
      clientId: "client-test",
      body: { caseId: "P001", attemptId: "attempt-test", studentInput: "test" }
    }, async () => ({ answer: "must-not-run" })),
    (error: Error) => error.message === "agent_request_store_unavailable"
  );

  const circuitStore = require("../server/providerCircuitStore.js");
  clearStoreEnv();
  process.env.LLM_PROVIDER_CIRCUIT_STORE_MODE = "upstash";
  process.env.KV_REST_API_URL = "https://vercel-kv.example.test";
  process.env.KV_REST_API_TOKEN = "unit-test-kv-write-token";
  let circuitCalls = 0;
  globalThis.fetch = async (input, init) => {
    circuitCalls += 1;
    assert.equal(String(input), "https://vercel-kv.example.test");
    assert.equal(String((init?.headers as Record<string, string>)?.Authorization || ""), "Bearer unit-test-kv-write-token");
    return { ok: true, json: async () => ({ result: JSON.stringify({ kind: "closed", failures: 0 }) }) } as Response;
  };
  const circuitAdmission = await circuitStore.enterProviderCircuit({
    provider: "test-provider",
    baseUrl: "https://provider.example.test",
    model: "test-model",
    endpointType: "chat_completions"
  });
  assert.equal(circuitAdmission.mode, "upstash");
  assert.equal(circuitCalls, 1);

  clearStoreEnv();
  process.env.LLM_PROVIDER_CIRCUIT_STORE_MODE = "upstash";
  process.env.KV_REST_API_URL = "https://vercel-kv.example.test";
  process.env.KV_REST_API_READ_ONLY_TOKEN = "unit-test-read-only-token";
  await assert.rejects(
    circuitStore.enterProviderCircuit({
      provider: "test-provider",
      baseUrl: "https://provider.example.test",
      model: "test-model",
      endpointType: "chat_completions"
    }),
    (error: Error) => error.message === "provider_circuit_store_unavailable"
  );

  console.log("Training attempt store credential compatibility and safe health contract passed.");
}

main().finally(restoreEnv);
