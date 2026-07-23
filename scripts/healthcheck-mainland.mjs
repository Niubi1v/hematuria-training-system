const option = (name, fallback) => {
  const raw = process.argv.find((item) => item.startsWith(`${name}=`));
  return raw ? raw.slice(name.length + 1) : fallback;
};
const baseUrl = String(option("--base-url", process.env.MAINLAND_HEALTHCHECK_URL || "http://127.0.0.1:8080")).replace(/\/+$/, "");
const shallow = process.argv.includes("--shallow");

async function call(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(10_000),
    headers: {
      Accept: "application/json",
      Origin: baseUrl,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {})
    }
  });
  const payload = (response.headers.get("content-type") || "").includes("application/json")
    ? await response.json()
    : null;
  return { response, payload };
}

function check(value, message) {
  if (!value) throw new Error(message);
}

async function main() {
  const health = await call("/api/health/");
  check(health.response.status === 200, `health_http_${health.response.status}`);
  check(health.payload?.status === "ok", "health_not_ok");
  check(health.payload?.trainingStateConfigured === true, "training_state_not_ready");
  check(health.payload?.durableAttemptStoreConfigured === true, "durable_store_not_configured");
  check(health.payload?.durableAttemptStoreReachable === true, "durable_store_not_reachable");
  if (shallow) return { status: "ok", mode: "shallow", baseUrl };

  for (const path of ["/", "/cases/", "/cases/P001/"]) {
    const page = await call(path);
    check(page.response.status === 200, `page_failed:${path}`);
  }
  const attemptId = `mainland-health-${Date.now()}`;
  const initBody = {
    action: "init-attempt",
    caseId: "P001",
    attemptId,
    mode: "free",
    language: "zh",
    requestId: `${attemptId}-init`
  };
  const initialized = await call("/api/training-action/", { method: "POST", body: JSON.stringify(initBody) });
  const token = initialized.response.headers.get("x-training-state") || "";
  check(initialized.response.status === 200 && token, "attempt_init_failed");
  const duplicate = await call("/api/training-action/", { method: "POST", body: JSON.stringify(initBody) });
  check(duplicate.response.status === 200, "attempt_idempotency_failed");
  check(duplicate.response.headers.get("x-training-state") === token, "attempt_idempotency_token_changed");
  const session = await call("/api/session/init/", {
    method: "POST",
    headers: { "X-Training-State": token, "X-Idempotency-Key": `${attemptId}-session` },
    body: JSON.stringify({ caseId: "P001", attemptId, mode: "free", language: "zh" })
  });
  check(session.response.status === 200 && session.payload?.sessionId, "session_init_failed");
  return {
    status: "ok",
    mode: "deep",
    baseUrl,
    checks: ["pages", "health", "attempt", "idempotency", "session"]
  };
}

main()
  .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
  .catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "failed", reason: error.message })}\n`);
    process.exit(1);
  });
