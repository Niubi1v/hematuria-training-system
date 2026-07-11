import crypto from "node:crypto";

const base = String(process.env.PRODUCTION_API_BASE_URL || "https://hematuria-training-system.vercel.app").replace(/\/+$/, "");
const origin = "https://niubi1v.github.io";
const results = [];

async function request(path, init = {}) {
  const response = await fetch(`${base}${path}`, { ...init, redirect: "manual", headers: { Origin: origin, ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) } });
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
});

for (const language of ["zh", "en"]) {
  await check(`patient-${language}`, async () => {
    const attemptId = `smoke-${language}-${crypto.randomUUID()}`;
    const session = await jsonPost("/api/session/init/", { caseId: "P001", mode: "training", language });
    if (!session.payload.sessionId) throw new Error("missing sessionId");
    const question = language === "en" ? "When did your urine turn red?" : "小便什么时候开始变红？";
    const reply = await jsonPost("/api/agent-chat/", { caseId: "P001", agentId: "standardized_patient", sessionId: session.payload.sessionId, stage: "history", mode: "training", language, studentInput: question, conversationHistory: [], askedSlotIds: [], askedQuestions: [] }, { "X-Idempotency-Key": `${attemptId}:patient` });
    if (!String(reply.payload.replyText || "").trim()) throw new Error("empty patient reply");
    if (language === "en" && /[\u3400-\u9fff]/.test(reply.payload.replyText)) throw new Error("English reply contains Chinese text");
  });
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
if (results.some((row) => row.status === "FAIL")) process.exit(1);
console.log("Production smoke passed with real services; no mocks were used.");
