import fs from "node:fs";
import { createRequire } from "node:module";

process.env.TRAINING_STATE_SECRET = "unit-test-training-state-secret-with-adequate-length";

const require = createRequire(import.meta.url);
const {
  initSession,
  generatePatientAnswer,
  filterPatientOutput,
  getSession
} = require("../server/patientSession.js") as {
  initSession: (input: { caseId: string; mode?: string; language?: string; debug?: boolean; forceRefresh?: boolean }) => Promise<any>;
  generatePatientAnswer: (input: {
    sessionId?: string;
    caseId: string;
    studentInput: string;
    conversationHistory?: Array<{ role: string; text: string }>;
    language?: string;
    completedPatientFacingProfile?: Record<string, unknown>;
  }) => Promise<any>;
  filterPatientOutput: (text: string) => { ok: boolean; hits: string[] };
  getSession: (sessionId: string, caseId: string) => { completedPatientFacingProfile?: Record<string, unknown> } | null;
};
const cases = require("../data/cases.json") as Array<{ id: string }>;

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function assertNotContains(text: string, words: string[], context: string) {
  const hits = words.filter((word) => text.includes(word));
  assert(hits.length === 0, `${context} leaked forbidden words: ${hits.join(", ")}\n${text}`);
}

async function main() {
  const previousEnable = process.env.LLM_ENABLE_AI_AGENTS;
  process.env.LLM_ENABLE_AI_AGENTS = "false";
  const originalFetch = globalThis.fetch;
  let initLlmCalls = 0;
  globalThis.fetch = async () => { initLlmCalls += 1; throw new Error("session/init must not call the LLM"); };

  const initStartedAt = Date.now();
  const session = await initSession({ caseId: "P001", mode: "training", language: "zh", debug: true });
  assert(Date.now() - initStartedAt < 3000, "local session/init should not approach the patient reply timeout");
  assert(initLlmCalls === 0, "session/init should complete without a slow LLM call");
  assert(session.sessionId, "session/init should return sessionId");
  assert(!("completedPatientFacingProfile" in session), "session/init must not return the patient profile to the browser");
  assert(!("teacherOnlyData" in session), "session/init must not return teacher-only data");
  assert(session.patientOpeningStatement, "session/init should return patientOpeningStatement");
  assert(session.patientOpeningStatement === "医生您好，我来看一下。", `opening must remain neutral: ${session.patientOpeningStatement}`);
  assertNotContains(session.patientOpeningStatement, ["血尿", "尿红", "小便", "3月", "无痛", "肉眼", "全程"], "session opening complaint");
  assert(session.apiVersion === "2.6.0", `session/init should expose API version: ${session.apiVersion}`);
  assert(session.deploymentSha, "session/init should expose deployment SHA");
  assert(Date.parse(session.sessionExpiresAt) > Date.parse(session.sessionCreatedAt), "session should have a future expiration");
  assert(["local-reviewed", "local-simulation"].includes(session.profileSource), "session should declare a local profile source");
  const refreshed = await initSession({ caseId: "P001", mode: "training", language: "zh", forceRefresh: true });
  assert(refreshed.sessionId !== session.sessionId, "forceRefresh must create a new sessionId");

  for (const caseItem of cases) {
    const englishSession = await initSession({ caseId: caseItem.id, mode: "training", language: "en" });
    const opening = String(englishSession.patientOpeningStatement || "");
    assert(opening.length > 0, `${caseItem.id} English session should have an opening statement`);
    assert(!/[\u3400-\u9fff]/u.test(opening), `${caseItem.id} English opening must not contain Chinese text: ${opening}`);
    assert(/\b(?:hello|hi|doctor)\b/i.test(opening), `${caseItem.id} English opening should be a natural patient greeting: ${opening}`);
    assert(!/hematuria|blood|urine|day|week|month|year/i.test(opening), `${caseItem.id} English opening must not reveal the complaint or duration: ${opening}`);
  }
  globalThis.fetch = originalFetch;

  const profileText = JSON.stringify(getSession(session.sessionId, "P001")?.completedPatientFacingProfile || {});
  assertNotContains(profileText, ["imaging_finding", "final_diagnosis", "treatment_plan", "pathology_result", "evaluator_rubric"], "completedPatientFacingProfile");
  assert(profileText.includes('"source":"ai_completed"'), "AI-completed fields should carry source ai_completed");

  const smoking = await generatePatientAnswer({
    sessionId: session.sessionId,
    caseId: "P001",
    studentInput: "吸烟吗？",
    conversationHistory: [],
    language: "zh"
  });
  assertNotContains(smoking.replyText, ["未诉", "乙肝", "高血压", "饮酒", "喝酒", "输血", "子女", "CT", "占位", "诊断"], "smoking");

  const drinking = await generatePatientAnswer({
    sessionId: session.sessionId,
    caseId: "P001",
    studentInput: "喝酒吗？",
    conversationHistory: [],
    language: "zh"
  });
  assertNotContains(drinking.replyText, ["吸烟", "抽烟", "包年", "CT", "诊断"], "drinking");

  const color = await generatePatientAnswer({
    sessionId: session.sessionId,
    caseId: "P004",
    studentInput: "尿鲜红色吗？",
    conversationHistory: [],
    language: "zh"
  });
  assertNotContains(color.replyText, ["CT", "占位", "诊断", "肿瘤", "癌栓"], "color");

  const teacherMetaCases = [
    { caseId: "P004", question: "有血块吗？" },
    { caseId: "P005", question: "血尿是全程的吗？" },
    { caseId: "P006", question: "血尿是全程的吗？" }
  ];
  for (const testCase of teacherMetaCases) {
    const caseSession = await initSession({ caseId: testCase.caseId, mode: "training", language: "zh" });
    const answer = await generatePatientAnswer({
      sessionId: caseSession.sessionId,
      caseId: testCase.caseId,
      studentInput: testCase.question,
      conversationHistory: [],
      language: "zh"
    });
    const publicFilter = filterPatientOutput(answer.replyText);
    assert(publicFilter.ok, `${testCase.caseId} deterministic answer must pass the patient-facing output filter: ${JSON.stringify(publicFilter)}`);
    assertNotContains(answer.replyText, ["未主动诉", "需追问", "评分点", "教师提示"], `${testCase.caseId} deterministic answer`);
    assert((answer.matchedSlotIds || []).length === 0, `${testCase.caseId} blocked deterministic fact must not be marked as collected`);
  }

  const ct = await generatePatientAnswer({
    sessionId: session.sessionId,
    caseId: "P001",
    studentInput: "做过CT吗，结果怎么样？",
    conversationHistory: [],
    language: "zh"
  });
  assert(ct.safetyFlags.includes("blocked_report_request"), "CT result must be blocked in Patient Agent");
  assertNotContains(ct.replyText, ["CT提示", "占位", "诊断", "肿瘤"], "CT report");
  assert(!/^[-•*#]/.test(ct.replyText.trim()), `CT safety reply must not use Markdown bullets: ${ct.replyText}`);

  const diagnosis = await generatePatientAnswer({
    sessionId: session.sessionId,
    caseId: "P001",
    studentInput: "这是什么病？",
    conversationHistory: [],
    language: "zh"
  });
  assert(diagnosis.safetyFlags.includes("blocked_diagnosis_request"), "Diagnosis request must be blocked in Patient Agent");
  assert(!/^[-•*#]/.test(diagnosis.replyText.trim()), `Diagnosis safety reply must not use Markdown bullets: ${diagnosis.replyText}`);

  const filter = filterPatientOutput("- 根据原始病史：CT提示占位，诊断肿瘤。");
  assert(!filter.ok && filter.hits.length >= 3, "responseFilter should block raw history, CT, diagnosis leaks");

  const source = [
    ".env.example",
    "server/llmClient.runtime.js",
    "server/llmClient.ts",
    "api/session/init.js",
    "api/agent-chat.js",
    "src/components/ClinicalTrainingClient.tsx"
  ].map((file) => fs.readFileSync(file, "utf8")).join("\n");
  assert(!/sk-[A-Za-z0-9_-]{12,}/.test(source), "build/source should not contain real API keys");
  assert(source.includes("LLM_API_KEY"), "source should document backend LLM_API_KEY env var");

  const providerEnvironment = [
    "LLM_ENABLE_AI_PATIENT",
    "LLM_API_KEY",
    "LLM_API_BASE_URL",
    "LLM_PROVIDER",
    "LLM_MODEL",
    "LLM_STREAMING_ENABLED",
    "PATIENT_DEEPSEEK_THINKING"
  ] as const;
  const previousProviderEnvironment = new Map(providerEnvironment.map((key) => [key, process.env[key]]));
  const providerRequests: Array<Record<string, unknown>> = [];
  try {
    process.env.LLM_ENABLE_AI_PATIENT = "true";
    process.env.LLM_API_KEY = "synthetic-live-patient-key";
    process.env.LLM_API_BASE_URL = "https://api.deepseek.com";
    process.env.LLM_PROVIDER = "deepseek";
    process.env.LLM_MODEL = "deepseek-v4-flash";
    process.env.LLM_STREAMING_ENABLED = "false";
    process.env.PATIENT_DEEPSEEK_THINKING = "disabled";
    globalThis.fetch = async (_input, init) => {
      const providerRequest = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
      providerRequests.push(providerRequest);
      const messages = providerRequest.messages as Array<{ content?: string }>;
      const payload = JSON.parse(String(messages?.[1]?.content || "{}")) as { currentAllowedAnswer?: string };
      return new Response(JSON.stringify({
        choices: [{ message: { content: String(payload.currentAllowedAnswer || "") } }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const liveSession = await initSession({ caseId: "P001", mode: "training", language: "en" });
    const liveAnswer = await generatePatientAnswer({
      sessionId: liveSession.sessionId,
      caseId: "P001",
      studentInput: "When did your urine turn red?",
      conversationHistory: [],
      language: "en"
    });
    assert(liveAnswer.isFallback === false, "a configured successful provider must remain a live answer");
    assert(liveAnswer.provider === "deepseek", `unexpected live provider: ${liveAnswer.provider}`);
    assert(liveAnswer.model === "deepseek-v4-flash", `unexpected live model: ${liveAnswer.model}`);
    assert(liveAnswer.runtimeTrace?.generationSource === "live_ai", `unexpected generation source: ${liveAnswer.runtimeTrace?.generationSource}`);
    assert(liveAnswer.runtimeTrace?.providerConfigured === true, "live trace must mark the provider configured");
    assert(liveAnswer.runtimeTrace?.providerHttpSuccess === true, "live trace must mark the provider request successful");
    assert(liveAnswer.runtimeTrace?.thinkingExecuted === false, "Flash must not execute thinking by default");
    assert((providerRequests[0]?.thinking as { type?: string } | undefined)?.type === "disabled", "DeepSeek thinking must be disabled");

    let correctionCalls = 0;
    globalThis.fetch = async (_input, init) => {
      correctionCalls += 1;
      const providerRequest = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
      const messages = providerRequest.messages as Array<{ content?: string }>;
      const payload = JSON.parse(String(messages?.[1]?.content || "{}")) as { currentAllowedAnswer?: string };
      const content = correctionCalls === 1
        ? "I came because a urine test found blood yesterday."
        : String(payload.currentAllowedAnswer || "");
      return new Response(JSON.stringify({
        choices: [{ message: { content } }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const correctionSession = await initSession({ caseId: "HX-ADD-025", mode: "training", language: "en" });
    const correctedAnswer = await generatePatientAnswer({
      sessionId: correctionSession.sessionId,
      caseId: "HX-ADD-025",
      studentInput: "Please tell me in your own words why you came today.",
      conversationHistory: [],
      language: "en"
    });
    assert(correctionCalls === 2, "a safe but fact-incomplete paraphrase should receive exactly one bounded correction");
    assert(correctedAnswer.isFallback === false, "a corrected governed answer should remain live");
    assert(correctedAnswer.runtimeTrace?.generationSource === "live_ai", "a corrected governed answer should remain live_ai");
    assert(/menstruation/i.test(correctedAnswer.replyText), "the correction must restore the omitted governed fact");
    assert(/\b1 day\b/i.test(correctedAnswer.replyText), "the correction must restore the governed duration");
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of providerEnvironment) {
      const value = previousProviderEnvironment.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  process.env.LLM_ENABLE_AI_AGENTS = previousEnable;
  console.log("Dynamic Patient Session tests passed.");
}

void main();
