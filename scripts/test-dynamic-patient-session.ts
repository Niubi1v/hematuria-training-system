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
  assert(session.patientOpeningStatement.includes("小便颜色变红3月余") || session.patientOpeningStatement.includes("血尿3月余"), `opening should use simplified complaint: ${session.patientOpeningStatement}`);
  assertNotContains(session.patientOpeningStatement, ["无痛", "肉眼", "全程"], "session opening complaint");
  assert(session.apiVersion === "2.6.0", `session/init should expose API version: ${session.apiVersion}`);
  assert(session.deploymentSha, "session/init should expose deployment SHA");
  assert(Date.parse(session.sessionExpiresAt) > Date.parse(session.sessionCreatedAt), "session should have a future expiration");
  assert(["local-reviewed", "local-simulation"].includes(session.profileSource), "session should declare a local profile source");
  const refreshed = await initSession({ caseId: "P001", mode: "training", language: "zh", forceRefresh: true });
  assert(refreshed.sessionId !== session.sessionId, "forceRefresh must create a new sessionId");
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

  process.env.LLM_ENABLE_AI_AGENTS = previousEnable;
  console.log("Dynamic Patient Session tests passed.");
}

void main();
