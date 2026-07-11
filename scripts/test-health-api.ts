import assert from "node:assert/strict";

process.env.LLM_API_KEY = "test-placeholder";
process.env.LLM_API_BASE_URL = "https://api.example.test";
process.env.LLM_MODEL = "test-model";
process.env.TRAINING_STATE_SECRET = "test-only-state-secret-at-least-32-bytes";
process.env.AZURE_SPEECH_KEY = "test-placeholder";
process.env.AZURE_SPEECH_REGION = "eastasia";
process.env.AGENT_API_ALLOWED_ORIGIN = "https://niubi1v.github.io";
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
  assert.equal(health.payload.cloudTtsConfigured, true);
  assert.equal(health.payload.apiVersion, "2.6.0");
  assert.ok(health.payload.deploymentSha);
  assert.equal(health.headers["access-control-allow-origin"], "https://niubi1v.github.io");
  assert.equal(JSON.stringify(health.payload).includes("test-placeholder"), false, "health must never expose secret values");
  const options = await call("OPTIONS");
  assert.equal(options.statusCode, 204);
  console.log("Health API boolean-only configuration and CORS contract passed.");
}

void main();
