import assert from "node:assert/strict";

const baseUrl = String(process.env.MAINLAND_HEALTHCHECK_URL || "").replace(/\/+$/, "");
assert.ok(/^https:\/\//.test(baseUrl), "MAINLAND_HEALTHCHECK_URL must be the HTTPS mainland staging origin");
assert.equal(process.env.MAINLAND_EXPECT_LIVE_AI, "1", "MAINLAND_EXPECT_LIVE_AI=1 is required");

const samples = [];
const counters = { success: 0, fallback: 0, providerCalls: 0, status: {} };
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] || 0;
};

async function call(path, init = {}) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Origin: baseUrl,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {})
    },
    signal: AbortSignal.timeout(35_000)
  });
  const durationMs = performance.now() - startedAt;
  const payload = await response.json().catch(() => ({}));
  counters.status[response.status] = (counters.status[response.status] || 0) + 1;
  return { response, payload, durationMs };
}

async function newSession(language, suffix) {
  const attemptId = `live-${language}-${suffix}-${Date.now()}`;
  const init = await call("/api/training-action/", {
    method: "POST",
    body: JSON.stringify({
      action: "init-attempt", caseId: "P001", attemptId, mode: "free", language, requestId: `${attemptId}-init`
    })
  });
  assert.equal(init.response.status, 200);
  const token = init.response.headers.get("x-training-state");
  const session = await call("/api/session/init/", {
    method: "POST",
    headers: { "X-Training-State": token, "X-Idempotency-Key": `${attemptId}-session` },
    body: JSON.stringify({ caseId: "P001", attemptId, mode: "free", language })
  });
  assert.equal(session.response.status, 200);
  samples.push({ kind: "session", language, durationMs: session.durationMs });
  return { attemptId, sessionId: session.payload.sessionId };
}

async function ask(context, language, question, index) {
  const answer = await call("/api/agent-chat/", {
    method: "POST",
    headers: { "X-Idempotency-Key": `${context.attemptId}-${index}` },
    body: JSON.stringify({
      caseId: "P001",
      agentId: "standardized_patient",
      sessionId: context.sessionId,
      attemptId: context.attemptId,
      sessionMode: "free",
      mode: "free",
      stage: "history",
      language,
      studentInput: question,
      conversationHistory: []
    })
  });
  assert.equal(answer.response.status, 200);
  assert.equal(answer.payload.generationSource, "live_ai", `not live_ai: ${answer.payload.generationSource}`);
  assert.notEqual(answer.payload.isSafeMock, true);
  assert.notEqual(answer.payload.isFallback, true);
  counters.success += 1;
  counters.providerCalls += 1;
  samples.push({
    kind: "answer",
    language,
    durationMs: answer.durationMs,
    firstVisibleMs: Number(answer.response.headers.get("server-timing")?.match(/firsttoken;dur=([\d.]+)/)?.[1] || 0)
  });
}

for (let index = 0; index < 20; index += 1) await newSession(index % 2 ? "en" : "zh", `init-${index}`);
for (const language of ["zh", "en"]) {
  for (let index = 0; index < 10; index += 1) {
    const context = await newSession(language, `accept-${index}`);
    await ask(context, language, language === "zh" ? "请问血尿什么时候开始？" : "When did the blood in your urine begin?", index);
  }
}
const sessions = samples.filter((item) => item.kind === "session").map((item) => item.durationMs);
const zh = samples.filter((item) => item.kind === "answer" && item.language === "zh");
const en = samples.filter((item) => item.kind === "answer" && item.language === "en");
process.stdout.write(`${JSON.stringify({
  status: "ok",
  evidenceType: "live_deepseek",
  baseUrl,
  successRate: counters.success / 20,
  fallbackRate: counters.fallback / 20,
  providerCalls: counters.providerCalls,
  httpStatus: counters.status,
  session: { p50: percentile(sessions, 0.5), p95: percentile(sessions, 0.95) },
  zh: { p50: percentile(zh.map((x) => x.durationMs), 0.5), p95: percentile(zh.map((x) => x.durationMs), 0.95) },
  en: { p50: percentile(en.map((x) => x.durationMs), 0.5), p95: percentile(en.map((x) => x.durationMs), 0.95) },
  firstVisible: {
    p50: percentile([...zh, ...en].map((x) => x.firstVisibleMs), 0.5),
    p95: percentile([...zh, ...en].map((x) => x.firstVisibleMs), 0.95)
  }
})}\n`);
