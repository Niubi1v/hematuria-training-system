import assert from "node:assert/strict";

const { callLLM } = require("../server/llmClient.runtime.js") as {
  callLLM: (input: Record<string, unknown>) => Promise<{ text: string; durationMs: number; firstTokenMs?: number }>;
};

const originalFetch = globalThis.fetch;
const originalEnvironment = new Map([
  "LLM_PROVIDER",
  "LLM_API_KEY",
  "LLM_API_BASE_URL",
  "LLM_MODEL",
  "LLM_ENABLE_AI_PATIENT",
  "LLM_STREAMING_ENABLED"
].map((name) => [name, process.env[name]]));

function restoreEnvironment() {
  for (const [name, value] of originalEnvironment) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

async function main() {
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

  console.log("LLM SSE aggregation, first-token timing and explicit non-stream compatibility passed.");
}

void main().finally(() => {
  globalThis.fetch = originalFetch;
  restoreEnvironment();
});
