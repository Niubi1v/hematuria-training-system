import assert from "node:assert/strict";

const targets = String(process.env.COMPARISON_TARGETS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean)
  .map((item) => {
    const [name, url] = item.split("=");
    return { name, url: String(url || "").replace(/\/+$/, "") };
  });
assert.equal(targets.length, 2, "COMPARISON_TARGETS must contain mainland=<url>,vercel=<url>");

const questions = [
  "When did you first notice blood in your urine?", "Did it begin suddenly?", "Is the urine red throughout the stream?",
  "Have you seen blood clots?", "Is it constant or intermittent?", "Does urination hurt?", "Are you urinating more often?",
  "Do you have urgency?", "Is urination difficult?", "Do you have flank pain?", "Any fever or chills?",
  "Any recent injury?", "Has this happened before?", "Any urinary stones?", "Any urinary surgery?", "Any cancer history?",
  "Do you smoke?", "Any chemical exposure at work?", "Are you taking blood thinners?", "Any similar family history?"
];
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] || 0;
};
const summary = (values) => ({ p50: percentile(values, 0.5), p95: percentile(values, 0.95) });

function authHeaders(target) {
  if (target.name !== "vercel" || !process.env.VERCEL_AUTOMATION_BYPASS_SECRET) return {};
  return { "X-Vercel-Protection-Bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET };
}

async function call(target, path, init = {}) {
  const startedAt = performance.now();
  const response = await fetch(`${target.url}${path}`, {
    ...init,
    headers: {
      Origin: target.url,
      Accept: "application/json",
      ...authHeaders(target),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {})
    },
    signal: AbortSignal.timeout(35_000)
  });
  const durationMs = performance.now() - startedAt;
  const payload = (response.headers.get("content-type") || "").includes("application/json")
    ? await response.json().catch(() => ({}))
    : null;
  return { response, payload, durationMs };
}

async function probe(target) {
  const cold = await call(target, "/cases/P001/");
  const page = [];
  for (let index = 0; index < 3; index += 1) page.push((await call(target, "/cases/P001/")).durationMs);
  const attemptId = `comparison-${target.name}-${Date.now()}`;
  const initialized = await call(target, "/api/training-action/", {
    method: "POST",
    body: JSON.stringify({
      action: "init-attempt", caseId: "P001", attemptId, mode: "free", language: "en", requestId: `${attemptId}-init`
    })
  });
  const token = initialized.response.headers.get("x-training-state");
  const session = await call(target, "/api/session/init/", {
    method: "POST",
    headers: { "X-Training-State": token, "X-Idempotency-Key": `${attemptId}-session` },
    body: JSON.stringify({ caseId: "P001", attemptId, mode: "free", language: "en" })
  });
  const answers = [];
  const sources = {};
  const statuses = {};
  const history = [];
  for (const [index, question] of questions.entries()) {
    const answer = await call(target, "/api/agent-chat/", {
      method: "POST",
      headers: { "X-Idempotency-Key": `${attemptId}-answer-${index}` },
      body: JSON.stringify({
        caseId: "P001",
        agentId: "standardized_patient",
        sessionId: session.payload?.sessionId,
        attemptId,
        sessionMode: "free",
        mode: "free",
        stage: "history",
        language: "en",
        studentInput: question,
        conversationHistory: history.slice(-8)
      })
    });
    statuses[answer.response.status] = (statuses[answer.response.status] || 0) + 1;
    answers.push(answer.durationMs);
    const source = String(answer.payload?.generationSource || "error");
    sources[source] = (sources[source] || 0) + 1;
    if (answer.payload?.replyText) history.push({ role: "student", text: question }, { role: "patient", text: answer.payload.replyText });
  }
  const success = Object.entries(statuses)
    .filter(([status]) => Number(status) >= 200 && Number(status) < 300)
    .reduce((total, [, count]) => total + count, 0);
  return {
    target: target.name,
    url: target.url,
    coldPageMs: cold.durationMs,
    page: summary(page),
    sessionMs: session.durationMs,
    ai: summary(answers),
    overall: summary([cold.durationMs, ...page, initialized.durationMs, session.durationMs, ...answers]),
    successRate: success / questions.length,
    fallbackRate: ((sources.rule_fallback || 0) + (sources.safety_boundary || 0)) / questions.length,
    sources,
    statuses,
    redisTiming: "Collect from server-side metrics for the same request IDs; never expose Redis endpoints in this output."
  };
}

const location = process.env.COMPARISON_LOCATION || "unspecified";
process.stdout.write(`${JSON.stringify({
  status: "ok",
  location,
  caseId: "P001",
  language: "en",
  rounds: questions.length,
  results: await Promise.all(targets.map(probe))
})}\n`);
