import assert from "node:assert/strict";
import { ApiRequestError, createIdempotencyKey, fetchWithRecovery, requestJson } from "../src/lib/apiClient";

async function main() {
  const chineseKey = createIdempotencyKey("attempt-1", "patient", "什么时候开始小便变红？");
  assert.match(chineseKey, /^req-[0-9a-f]{8}$/);
  assert.equal(chineseKey, createIdempotencyKey("attempt-1", "patient", "什么时候开始小便变红？"));
  const originalFetch = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = async (_input, init) => {
      calls += 1;
      assert.equal(new Headers(init?.headers).get("X-Idempotency-Key"), "attempt-1:question-1");
      if (calls < 3) return new Response(JSON.stringify({ error: "temporary" }), { status: 503 });
      return Response.json({ ok: true });
    };
    const recovered = await requestJson<{ ok: boolean }>("https://api.example.test/api/agent-chat/", { question: "test" }, {
      retries: 2,
      timeoutMs: 1_000,
      idempotencyKey: "attempt-1:question-1"
    });
    assert.deepEqual(recovered, { ok: true });
    assert.equal(calls, 3, "transient failures should retry at most twice");

    calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
    };
    await assert.rejects(
      fetchWithRecovery("https://api.example.test/api/session/init/", { retries: 2 }),
      (error: unknown) => error instanceof ApiRequestError && error.kind === "request" && error.status === 403
    );
    assert.equal(calls, 1, "non-transient failures must not retry");

    globalThis.fetch = async (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    });
    await assert.rejects(
      fetchWithRecovery("https://api.example.test/api/health/", { retries: 0, timeoutMs: 10 }),
      (error: unknown) => error instanceof ApiRequestError && error.kind === "timeout"
    );

    calls = 0;
    const externalController = new AbortController();
    globalThis.fetch = async (_input, init) => {
      calls += 1;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      });
    };
    const cancelled = fetchWithRecovery("https://api.example.test/api/tts/", { retries: 2, timeoutMs: 1_000, signal: externalController.signal });
    externalController.abort();
    await assert.rejects(cancelled, (error: unknown) => error instanceof ApiRequestError && error.kind === "timeout");
    assert.equal(calls, 1, "an explicitly cancelled obsolete request must not retry");
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log("API retry, idempotency, non-retryable error, and timeout behavior passed.");
}

void main();
