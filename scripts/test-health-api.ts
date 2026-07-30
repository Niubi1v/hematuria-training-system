import assert from "node:assert/strict";

process.env.LLM_API_KEY = "test-placeholder";
process.env.LLM_API_BASE_URL = "https://api.example.test";
process.env.LLM_MODEL = "test-model";
process.env.TRAINING_STATE_SECRET = "test-only-state-secret-at-least-32-bytes";
process.env.AZURE_SPEECH_KEY = "test-placeholder";
process.env.AZURE_SPEECH_REGION = "eastasia";
process.env.AGENT_API_ALLOWED_ORIGINS = "https://niubi1v.github.io";
delete process.env.AGENT_API_ALLOWED_ORIGIN;
const handler = require("../api/health.js");

async function call(method: string) {
  let statusCode = 200;
  let payload: Record<string, unknown> = {};
  const headers: Record<string, string> = {};
  const req = { method, headers: { origin: "https://niubi1v.github.io" } };
  const res = {
    setHeader(name: string, value: string) { headers[name.toLowerCase()] = value; },
    status(code: number) { statusCode = code; return this; },
    json(value: Record<string, unknown>) { payload = value; return this; },
    end() { return this; }
  };
  await handler(req, res);
  return { statusCode, payload, headers };
}

async function main() {
  const health = await call("GET");
  assert.equal(health.statusCode, 200);
  assert.equal(health.payload.patientServiceConfigured, true);
  assert.equal(health.payload.trainingStateConfigured, true);
  assert.equal(health.payload.durableAttemptStoreConfigured, false, "local memory test store must not be advertised as durable");
  assert.equal(health.payload.durableAttemptStoreCredentialSource, "none");
  assert.equal(health.payload.cloudTtsConfigured, true);
  assert.equal(health.payload.apiVersion, "2.6.0");
  assert.ok(health.payload.deploymentSha);
  assert.equal(health.headers["access-control-allow-origin"], "https://niubi1v.github.io");
  assert.equal(JSON.stringify(health.payload).includes("test-placeholder"), false, "health must never expose secret values");

  const dedicatedSecret = process.env.TRAINING_STATE_SECRET;
  delete process.env.TRAINING_STATE_SECRET;
  const legacyFallbackOnly = await call("GET");
  assert.equal(legacyFallbackOnly.payload.patientServiceConfigured, true, "LLM configuration should remain independently visible");
  assert.equal(legacyFallbackOnly.payload.trainingStateConfigured, false, "LLM_API_KEY fallback must not be reported as an independent training-state secret");
  process.env.TRAINING_STATE_SECRET = dedicatedSecret;

  process.env.TRAINING_STATE_SECRET = "replace_with_at_least_32_random_bytes";
  const placeholder = await call("GET");
  assert.equal(placeholder.payload.trainingStateConfigured, false, "documented placeholders must never be reported as configured");
  process.env.TRAINING_STATE_SECRET = dedicatedSecret;

  process.env.LLM_API_KEY = dedicatedSecret;
  const reusedProviderKey = await call("GET");
  assert.equal(reusedProviderKey.payload.trainingStateConfigured, false, "provider and training secrets must remain independent");
  process.env.LLM_API_KEY = "test-placeholder";

  process.env.VERCEL = "1";
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.TRAINING_ATTEMPT_STORE_MODE;
  const productionWithoutStore = await call("GET");
  assert.equal(productionWithoutStore.payload.trainingStateConfigured, false, "serverless health must fail closed without a durable attempt store");
  process.env.VERCEL = "";

  const options = await call("OPTIONS");
  assert.equal(options.statusCode, 204);
  console.log("Health API secret-strength, durable-store, boolean-only output, and CORS contract passed.");
}

void main();
