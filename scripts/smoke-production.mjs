import crypto from "node:crypto";

const base = String(process.env.PRODUCTION_API_BASE_URL || "https://hematuria-training-system.vercel.app").replace(/\/+$/, "");
const origin = "https://niubi1v.github.io";
const results = [];
const sessionDurations = [];
const patientDurations = [];
const statusCounts = new Map();
let realAiReplies = 0;
let fallbackReplies = 0;

async function request(path, init = {}) {
  const response = await fetch(`${base}${path}`, { ...init, redirect: "manual", headers: { Origin: origin, ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) } });
  statusCounts.set(response.status, (statusCounts.get(response.status) || 0) + 1);
  if ([301, 302, 307, 308].includes(response.status)) throw new Error(`${path}: unexpected redirect ${response.status}`);
  if (response.headers.get("access-control-allow-origin") !== origin) throw new Error(`${path}: CORS origin missing`);
  return response;
}

async function jsonPost(path, body, extraHeaders = {}) {
  const response = await request(path, { method: "POST", headers: extraHeaders, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${payload.error || payload.code || "request_failed"}`);
  return { response, payload };
}

async function check(name, action) {
  try { await action(); results.push({ name, status: "PASS" }); }
  catch (error) { results.push({ name, status: "FAIL", detail: error instanceof Error ? error.message : "unknown" }); }
}

await check("health", async () => {
  const response = await request("/api/health/", { method: "GET" });
  if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  if (!body.patientServiceConfigured || !body.trainingStateConfigured || !body.cloudTtsConfigured) throw new Error(`configuration incomplete: patient=${body.patientServiceConfigured}, state=${body.trainingStateConfigured}, tts=${body.cloudTtsConfigured}`);
  if (body.apiVersion !== "2.6.0") throw new Error(`outdated API version: ${body.apiVersion || "missing"}`);
  if (process.env.EXPECTED_DEPLOYMENT_SHA && !String(body.deploymentSha || "").startsWith(process.env.EXPECTED_DEPLOYMENT_SHA)) throw new Error(`deployment SHA mismatch: ${body.deploymentSha || "missing"}`);
});

const sessions = { zh: [], en: [] };
for (let index = 0; index < 10; index += 1) {
  const language = index < 5 ? "zh" : "en";
  await check(`session-init-${index + 1}-${language}`, async () => {
    const startedAt = performance.now();
    const session = await jsonPost("/api/session/init/", { caseId: "P001", mode: "training", language, forceRefresh: true });
    sessionDurations.push(performance.now() - startedAt);
    if (!session.payload.sessionId) throw new Error("missing sessionId");
    sessions[language].push(session.payload.sessionId);
  });
}

for (const language of ["zh", "en"]) {
  for (let index = 0; index < 5; index += 1) {
    await check(`patient-${language}-${index + 1}`, async () => {
      const sessionId = sessions[language][index];
      if (!sessionId) throw new Error("session initialization failed");
      const attemptId = `smoke-${language}-${crypto.randomUUID()}`;
      const question = language === "en" ? "When did your urine turn red?" : "小便什么时候开始变红？";
      const startedAt = performance.now();
      const reply = await jsonPost("/api/agent-chat/", { caseId: "P001", agentId: "standardized_patient", sessionId, stage: "history", mode: "training", language, studentInput: question, conversationHistory: [], askedSlotIds: [], askedQuestions: [] }, { "X-Idempotency-Key": `${attemptId}:patient` });
      patientDurations.push(performance.now() - startedAt);
      if (!String(reply.payload.replyText || "").trim()) throw new Error("empty patient reply");
      if (language === "en" && /[\u3400-\u9fff]/.test(reply.payload.replyText)) throw new Error("English reply contains Chinese text");
      if (reply.payload.isFallback) fallbackReplies += 1;
      else realAiReplies += 1;
    });
  }
}

await check("training-action", async () => {
  const attemptId = `smoke-training-${crypto.randomUUID()}`;
  const initialized = await jsonPost("/api/training-action/", { action: "init-attempt", caseId: "P008", attemptId, mode: "free", language: "zh" });
  const token = initialized.response.headers.get("x-training-state");
  if (!token) throw new Error("missing signed state token");
});

for (const [name, voiceName, text] of [
  ["tts-zh-female", "zh-CN-XiaoxiaoNeural", "医生您好"], ["tts-zh-male", "zh-CN-YunxiNeural", "医生您好"],
  ["tts-en-female", "en-US-JennyNeural", "Hello doctor"], ["tts-en-male", "en-US-GuyNeural", "Hello doctor"]
]) {
  await check(name, async () => {
    const response = await request("/api/tts/", { method: "POST", body: JSON.stringify({ voiceName, text }) });
    if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
    if (!String(response.headers.get("content-type") || "").startsWith("audio/mpeg")) throw new Error("content-type is not audio/mpeg");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 500) throw new Error("audio payload is unexpectedly small");
    const mp3Like = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33 || bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
    if (!mp3Like) throw new Error("payload does not have an MP3 signature");
  });
}

for (const row of results) console.log(`${row.status}\t${row.name}${row.detail ? `\t${row.detail}` : ""}`);
function metricSummary(values) {
  if (!values.length) return "no successful samples";
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
  const average = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  return `n=${sorted.length} min=${sorted[0].toFixed(0)}ms avg=${average.toFixed(0)}ms p50=${percentile(0.5).toFixed(0)}ms p95=${percentile(0.95).toFixed(0)}ms max=${sorted.at(-1).toFixed(0)}ms`;
}
console.log(`METRIC\tsession-init\t${metricSummary(sessionDurations)}`);
console.log(`METRIC\tpatient-reply\t${metricSummary(patientDurations)}`);
console.log(`METRIC\tpatient-source\treal-ai=${realAiReplies} fallback=${fallbackReplies} success-rate=${((realAiReplies + fallbackReplies) / 10 * 100).toFixed(0)}%`);
console.log(`METRIC\tupstream-status\t429=${statusCounts.get(429) || 0} 502=${statusCounts.get(502) || 0} 503=${statusCounts.get(503) || 0} 504=${statusCounts.get(504) || 0}`);
if (results.some((row) => row.status === "FAIL")) process.exit(1);
console.log("Production smoke passed with real services; no mocks were used.");
