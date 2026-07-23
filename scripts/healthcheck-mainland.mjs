import process from "node:process";

const args = new Map(process.argv.slice(2).map((entry) => {
  const [key, ...rest] = entry.split("=");
  return [key, rest.join("=")];
}));
const baseUrl = String(args.get("--base-url") || process.env.MAINLAND_HEALTHCHECK_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
const shallow = args.has("--shallow");
const timeoutMs = Number(args.get("--timeout-ms") || 10_000);

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Accept: "application/json",
      Origin: baseUrl,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {})
    }
  });
  let payload = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) payload = await response.json();
  else await response.arrayBuffer();
  return { response, payload };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const health = await request("/api/health/");
  assert(health.response.status === 200, `health_http_${health.response.status}`);
  assert(health.payload?.status === "ok", "health_not_ok");
  assert(health.payload?.trainingStateConfigured === true, "training_state_not_ready");
  assert(health.payload?.durableAttemptStoreConfigured === true, "durable_store_not_configured");
  assert(health.payload?.durableAttemptStoreReachable === true, "durable_store_not_reachable");

  if (shallow) {
    process.stdout.write(`${JSON.stringify({ status: "ok", mode: "shallow", baseUrl })}\n`);
    return;
  }

  for (const path of ["/", "/cases/", "/cases/P001/"]) {
    const page = await request(path);
    assert(page.response.status === 200, `page_failed:${path}:${page.response.status}`);
  }

  const attemptId = `mainland-health-${Date.now()}`;
  const initRequestId = `${attemptId}-init`;
  const initBody = {
    action: "init-attempt",
    caseId: "P001",
    attemptId,
    mode: "free",
    language: "zh",
    requestId: initRequestId
  };
  const initialized = await request("/api/training-action/", { method: "POST", body: JSON.stringify(initBody) });
  const initialToken = initialized.response.headers.get("x-training-state") || "";
  assert(initialized.response.status === 200 && initialToken, "attempt_init_failed");

  const duplicate = await request("/api/training-action/", { method: "POST", body: JSON.stringify(initBody) });
  assert(duplicate.response.status === 200, "attempt_idempotency_failed");
  assert(duplicate.response.headers.get("x-training-state") === initialToken, "attempt_idempotency_token_changed");

  const session = await request("/api/session/init/", {
    method: "POST",
    headers: {
      "X-Training-State": initialToken,
      "X-Idempotency-Key": `${attemptId}-session`
    },
    body: JSON.stringify({ caseId: "P001", attemptId, mode: "free", language: "zh" })
  });
  assert(session.response.status === 200 && session.payload?.sessionId, "session_init_failed");

  const historyBody = {
    action: "history-log",
    caseId: "P001",
    attemptId,
    mode: "free",
    language: "zh",
    question: "请问血尿什么时候开始？",
    requestId: `${attemptId}-history`
  };
  const history = await request("/api/training-action/", {
    method: "POST",
    headers: { "X-Training-State": initialToken },
    body: JSON.stringify(historyBody)
  });
  assert(history.response.status === 200, "history_write_failed");

  const repeated = await request("/api/training-action/", {
    method: "POST",
    headers: { "X-Training-State": initialToken },
    body: JSON.stringify(historyBody)
  });
  assert(repeated.response.status === 200, "history_idempotent_replay_failed");

  const rejectedReplay = await request("/api/training-action/", {
    method: "POST",
    headers: { "X-Training-State": initialToken },
    body: JSON.stringify({ ...historyBody, question: "改变后的请求不得复用幂等键" })
  });
  assert(rejectedReplay.response.status === 409 && rejectedReplay.payload?.error === "idempotency_key_reused", "changed_replay_not_rejected");

  process.stdout.write(`${JSON.stringify({
    status: "ok",
    mode: "deep",
    baseUrl,
    checks: ["homepage", "cases", "health", "attempt", "idempotency", "replay-rejection", "session", "history-log"]
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ status: "failed", reason: error instanceof Error ? error.message : "healthcheck_failed" })}\n`);
  process.exit(1);
});
