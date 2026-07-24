import fs from "node:fs";
import { handleAgentChatRequest } from "@/src/server/agentChatService";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function assertNotContains(text: string, words: string[], context: string) {
  const hits = words.filter((word) => text.includes(word));
  assert(hits.length === 0, `${context} leaked forbidden words: ${hits.join(", ")}\n${text}`);
}

async function ask(studentInput: string, caseId = "HX-ADD-001") {
  return handleAgentChatRequest({
    caseId,
    agentId: "standardized_patient",
    stage: "history",
    mode: "training",
    language: "zh",
    studentInput,
    conversationHistory: [],
    unlockedData: {},
    studentActions: [],
    askedQuestions: []
  });
}

async function main() {
  const smoking = await ask("抽烟吗？");
  assert(/吸烟|抽烟|包年|不吸烟/.test(smoking.replyText), `smoking reply should answer smoking: ${smoking.replyText}`);
  assertNotContains(smoking.replyText, ["饮酒", "喝酒", "乙肝", "糖尿病", "输血", "子女", "诊断"], "smoking");
  assert(smoking.agentId === "standardized_patient", "agentId should be standardized_patient");
  assert(smoking.visibleToStudent === true, "reply should be student-visible");

  const p001Smoking = await ask("吸烟吗？", "P001");
  assertNotContains(p001Smoking.replyText, ["无痛", "肉眼血尿", "血块", "阿司匹林", "膀胱癌", "肿瘤", "高龄男性", "需警惕", "原始既往史"], "P001 smoking");

  const color = await ask("尿是鲜红色吗？", "P004");
  assert(/红|颜色|茶色|酱油|洗肉水/.test(color.replyText), `color reply should answer color: ${color.replyText}`);
  assertNotContains(color.replyText, ["CT", "占位", "癌栓", "淋巴结", "骨转移", "诊断", "治疗", "手术"], "color");

  const ct = await ask("做过CT吗，结果怎么样？", "P004");
  assert(ct.safetyFlags.includes("blocked_report_request"), "CT result should be blocked in patient agent");
  assertNotContains(ct.replyText, ["占位", "癌栓", "淋巴结", "骨转移", "CT提示", "诊断"], "CT");

  const diagnostic = await handleAgentChatRequest({
    caseId: "P001",
    agentId: "diagnostic_reasoning",
    stage: "diagnosis",
    mode: "training",
    language: "zh",
    studentInput: "我认为需要鉴别肿瘤、结石和感染。",
    unlockedData: { historySummary: "学生已提交的病史小结" },
    studentActions: [],
    askedQuestions: []
  });
  assert(diagnostic.agentId === "diagnostic_reasoning", "diagnostic agent should respond with its agentId");
  assert(diagnostic.blockedDataKeys.includes("teacherOnlyData"), "diagnostic agent should keep teacher data blocked");

  const source = [
    ".env.example",
    "src/server/llmClient.ts",
    "src/server/agentChatService.ts",
    "api/agent-chat.js",
    "api/patient-reply.js",
    "src/components/ClinicalTrainingClient.tsx"
  ].map((file) => fs.readFileSync(file, "utf8")).join("\n");
  const apiConfigSource = fs.readFileSync("src/lib/apiConfig.ts", "utf8");
  assert(!/sk-[A-Za-z0-9_-]{12,}/.test(source), "source should not contain real API keys");
  assert(source.includes("LLM_ENABLE_AI_AGENTS"), "source should document or read LLM_ENABLE_AI_AGENTS");
  assert(apiConfigSource.includes("/api/agent-chat/"), "public API configuration must use the unified agent-chat endpoint");
  assert(source.includes("publicApiConfig.patientAgent"), "frontend must call the configured unified Patient Agent endpoint");

  console.log("Agent Chat API tests passed.");
}

void main();
