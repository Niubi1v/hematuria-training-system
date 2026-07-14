import assert from "node:assert/strict";

const { callLLM } = require("../server/llmClient.runtime.js") as {
  callLLM: (input: Record<string, unknown>) => Promise<{ text: string; durationMs: number; firstTokenMs?: number }>;
};
const { enterProviderCircuit, recordProviderFailure, recordProviderSuccess, resetMemoryProviderCircuitStore } = require("../server/providerCircuitStore.js");

const originalFetch = globalThis.fetch;
const originalEnvironment = new Map([
  "LLM_PROVIDER",
  "LLM_API_KEY",
  "LLM_API_BASE_URL",
  "LLM_MODEL",
  "LLM_ENABLE_AI_PATIENT",
  "LLM_STREAMING_ENABLED",
  "LLM_PROVIDER_CIRCUIT_FAILURE_THRESHOLD",
  "LLM_PROVIDER_CIRCUIT_OPEN_SECONDS",
  "LLM_PROVIDER_CIRCUIT_PROBE_SECONDS",
  "LLM_PROVIDER_CIRCUIT_FAILURE_TTL_SECONDS",
  "LLM_PROVIDER_CIRCUIT_STORE_TIMEOUT_MS",
  "LLM_PROVIDER_CIRCUIT_STORE_MODE",
  "AGENT_REQUEST_STORE_MODE",
  "TRAINING_ATTEMPT_STORE_MODE",
  "VERCEL",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN"
].map((name) => [name, process.env[name]]));

function restoreEnvironment() {
  for (const [name, value] of originalEnvironment) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

async function main() {
  resetMemoryProviderCircuitStore();
  process.env.LLM_PROVIDER = "deepseek";
  process.env.LLM_API_KEY = "streaming-contract-test-key";
  process.env.LLM_API_BASE_URL = "https://api.example.test";
  process.env.LLM_MODEL = "test-model";
  process.env.LLM_ENABLE_AI_PATIENT = "true";
  delete process.env.LLM_STREAMING_ENABLED;

  let requestBody: Record<string, unknown> = {};
  let requestHeaders = new Headers();
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body || "{}"));
    requestHeaders = new Headers(init?.headers);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"role":"assistant","content":""}}]}\n\n'));
        await new Promise((resolve) => setTimeout(resolve, 5));
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"thinking"}}]}\n\n'));
        await new Promise((resolve) => setTimeout(resolve, 5));
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hel'));
        controller.enqueue(encoder.encode('lo"}}]}\n\ndata: {"choices":[{"delta":{"content":" world"}}]}\n\ndata: [DONE]\n\n'));
        controller.close();
      }
    });
    return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  };

  const streamed = await callLLM({ systemPrompt: "system", userPayload: { probe: true }, maxRetries: 0 });
  assert.equal(requestBody.stream, true, "provider request must enable SSE streaming by default");
  assert.equal(requestHeaders.get("accept"), "text/event-stream");
  assert.equal(streamed.text, "Hello world", "content deltas must be aggregated without exposing reasoning tokens");
  assert.ok(Number.isFinite(streamed.firstTokenMs), "the first non-empty provider token must be timed");
  assert.ok(streamed.firstTokenMs! >= 0 && streamed.firstTokenMs! <= streamed.durationMs);

  process.env.LLM_STREAMING_ENABLED = "false";
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body || "{}"));
    requestHeaders = new Headers(init?.headers);
    return new Response(JSON.stringify({ choices: [{ message: { content: "Non-stream reply" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  const nonStreamed = await callLLM({ systemPrompt: "system", userPayload: { probe: true }, maxRetries: 0 });
  assert.equal(requestBody.stream, false, "explicit compatibility override must retain non-streaming mode");
  assert.equal(requestHeaders.get("accept"), "application/json");
  assert.equal(nonStreamed.text, "Non-stream reply");
  assert.equal(nonStreamed.firstTokenMs, undefined, "non-streaming completion must not fabricate first-token timing");

  let transientNetworkCalls = 0;
  globalThis.fetch = async () => {
    transientNetworkCalls += 1;
    if (transientNetworkCalls === 1) throw new TypeError("temporary network failure");
    return new Response(JSON.stringify({ choices: [{ message: { content: "Recovered after network failure" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  const networkRecovered = await callLLM({ systemPrompt: "system", userPayload: { probe: true }, maxRetries: 1 });
  assert.equal(networkRecovered.text, "Recovered after network failure");
  assert.equal(transientNetworkCalls, 2, "a transient network error must use the bounded retry path exactly once");

  process.env.LLM_PROVIDER_CIRCUIT_FAILURE_THRESHOLD = "2";
  resetMemoryProviderCircuitStore();
  let requestErrorCalls = 0;
  globalThis.fetch = async () => {
    requestErrorCalls += 1;
    if (requestErrorCalls <= 2) return new Response("bad request", { status: 400 });
    return new Response(JSON.stringify({ choices: [{ message: { content: "Healthy after request errors" } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  await assert.rejects(() => callLLM({ systemPrompt: "system", userPayload: { invalid: 1 }, maxRetries: 0 }));
  await assert.rejects(() => callLLM({ systemPrompt: "system", userPayload: { invalid: 2 }, maxRetries: 0 }));
  assert.equal((await callLLM({ systemPrompt: "system", userPayload: { valid: true }, maxRetries: 0 })).text, "Healthy after request errors", "request-level 400 responses must not poison the global provider circuit");
  assert.equal(requestErrorCalls, 3);

  resetMemoryProviderCircuitStore();
  let serverErrorCalls = 0;
  globalThis.fetch = async () => {
    serverErrorCalls += 1;
    if (serverErrorCalls === 1) return new Response("server error", { status: 500 });
    return new Response(JSON.stringify({ choices: [{ message: { content: "Recovered after 500" } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  assert.equal((await callLLM({ systemPrompt: "system", userPayload: { probe: true }, maxRetries: 1 })).text, "Recovered after 500");
  assert.equal(serverErrorCalls, 2, "provider 500 must use the bounded transient retry path");

  resetMemoryProviderCircuitStore();
  let malformedProviderCalls = 0;
  globalThis.fetch = async () => {
    malformedProviderCalls += 1;
    return new Response("not-json", { status: 200, headers: { "Content-Type": "application/json" } });
  };
  await assert.rejects(() => callLLM({ systemPrompt: "system", userPayload: { malformed: 1 }, maxRetries: 0 }));
  await assert.rejects(() => callLLM({ systemPrompt: "system", userPayload: { malformed: 2 }, maxRetries: 0 }));
  await assert.rejects(() => callLLM({ systemPrompt: "system", userPayload: { malformed: 3 }, maxRetries: 0 }), /provider_circuit_open/);
  assert.equal(malformedProviderCalls, 2, "repeated malformed provider payloads must open the circuit");

  resetMemoryProviderCircuitStore();

  let failedProviderCalls = 0;
  globalThis.fetch = async () => {
    failedProviderCalls += 1;
    return new Response("temporarily unavailable", { status: 503 });
  };
  for (let request = 0; request < 4; request += 1) {
    await assert.rejects(() => callLLM({ systemPrompt: "system", userPayload: { request }, maxRetries: 0 }));
  }
  assert.equal(failedProviderCalls, 2, "the provider circuit must stop repeated calls after consecutive failures");

  const originalNow = Date.now;
  const afterCooldown = originalNow() + 31_000;
  Date.now = () => afterCooldown;
  let releaseProbe!: () => void;
  let recoveryProviderCalls = 0;
  globalThis.fetch = async () => {
    recoveryProviderCalls += 1;
    await new Promise<void>((resolve) => { releaseProbe = resolve; });
    return new Response(JSON.stringify({ choices: [{ message: { content: "Recovered" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  try {
    const recoveryProbe = callLLM({ systemPrompt: "system", userPayload: { probe: "owner" }, maxRetries: 0 });
    await assert.rejects(
      () => callLLM({ systemPrompt: "system", userPayload: { probe: "contender" }, maxRetries: 0 }),
      /provider_circuit_open/,
      "only one request may probe provider recovery"
    );
    assert.equal(recoveryProviderCalls, 1, "a concurrent recovery contender must not reach the provider");
    releaseProbe();
    assert.equal((await recoveryProbe).text, "Recovered");
  } finally {
    Date.now = originalNow;
  }

  process.env.LLM_PROVIDER_CIRCUIT_STORE_MODE = "upstash";
  process.env.LLM_PROVIDER_CIRCUIT_OPEN_SECONDS = "300";
  process.env.LLM_PROVIDER_CIRCUIT_PROBE_SECONDS = "60";
  process.env.LLM_PROVIDER_CIRCUIT_FAILURE_TTL_SECONDS = "1";
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "unit-test-redis-token";
  const commands: unknown[][] = [];
  let enterOutcome: "closed" | "open" | "probe" = "closed";
  globalThis.fetch = async (_input, init) => {
    const command = JSON.parse(String(init?.body || "[]")) as unknown[];
    commands.push(command);
    const script = String(command[1] || "");
    let result: unknown = 1;
    if (script.includes("local failures = tonumber")) {
      result = JSON.stringify(enterOutcome === "open"
        ? { kind: "open", failures: 2, retryAfter: 10 }
        : { kind: enterOutcome, failures: enterOutcome === "closed" ? 0 : 2 });
    } else if (script.includes("HINCRBY")) result = JSON.stringify({ failures: 1, opened: 0 });
    return new Response(JSON.stringify({ result }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const circuitConfig = { provider: "provider-must-stay-hashed", baseUrl: "https://private-provider.example.test", model: "model-must-stay-hashed", endpointType: "chat_completions" };
  const admission = await enterProviderCircuit(circuitConfig);
  assert.equal(commands[0][2], 2, "provider circuit entry must atomically inspect state and probe keys");
  await recordProviderSuccess(admission);
  assert.equal(commands.length, 1, "a healthy closed circuit must not add a success write round trip");
  await recordProviderFailure(admission);
  assert.equal(commands.length, 2);
  assert.ok(Number(commands[1][7]) >= 480, "failure state TTL must cover the maximum open and probe windows");
  assert.doesNotMatch(JSON.stringify(commands), /provider-must-stay-hashed|private-provider|model-must-stay-hashed/);
  enterOutcome = "open";
  await assert.rejects(() => enterProviderCircuit(circuitConfig), /provider_circuit_open/);
  assert.equal(commands.length, 3);

  delete process.env.LLM_PROVIDER_CIRCUIT_STORE_MODE;
  delete process.env.AGENT_REQUEST_STORE_MODE;
  delete process.env.TRAINING_ATTEMPT_STORE_MODE;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.VERCEL = "1";
  await assert.rejects(() => enterProviderCircuit(circuitConfig), /provider_circuit_store_unavailable/, "serverless provider calls must fail closed without a persistent circuit store");

  console.log("LLM SSE, first-token timing, bounded retries, provider circuit and controlled recovery passed.");
}

void main().finally(() => {
  globalThis.fetch = originalFetch;
  resetMemoryProviderCircuitStore();
  restoreEnvironment();
});
