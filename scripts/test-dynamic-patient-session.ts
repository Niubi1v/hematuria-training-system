import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  initSession,
  generatePatientAnswer,
  filterPatientOutput
} = require("../api/lib/patientSession.js") as {
  initSession: (input: { caseId: string; mode?: string; language?: string; debug?: boolean }) => Promise<any>;
  generatePatientAnswer: (input: {
    sessionId?: string;
    caseId: string;
    studentInput: string;
    conversationHistory?: Array<{ role: string; text: string }>;
    language?: string;
    completedPatientFacingProfile?: Record<string, unknown>;
  }) => Promise<any>;
  filterPatientOutput: (text: string) => { ok: boolean; hits: string[] };
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

  const session = await initSession({ caseId: "P001", mode: "training", language: "zh", debug: true });
  assert(session.sessionId, "session/init should return sessionId");
  assert(session.completedPatientFacingProfile, "session/init should return completedPatientFacingProfile");
  assert(session.patientOpeningStatement, "session/init should return patientOpeningStatement");

  const profileText = JSON.stringify(session.completedPatientFacingProfile);
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
    completedPatientFacingProfile: session.completedPatientFacingProfile,
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

  const filter = filterPatientOutput("- 根据原始病史：CT提示占位，诊断肿瘤。");
  assert(!filter.ok && filter.hits.length >= 3, "responseFilter should block raw history, CT, diagnosis leaks");

  const source = [
    ".env.example",
    "api/lib/llmClient.runtime.js",
    "api/lib/llmClient.ts",
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
