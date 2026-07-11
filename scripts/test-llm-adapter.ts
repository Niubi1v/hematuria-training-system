import fs from "node:fs";
import { handlePatientReplyRequest } from "@/src/server/patientReplyService";
import { filterPatientReply } from "@/src/server/responseFilter";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function assertNotContains(text: string, words: string[], context: string) {
  const hits = words.filter((word) => text.includes(word));
  assert(hits.length === 0, `${context} leaked forbidden words: ${hits.join(", ")}\n${text}`);
}

async function ask(caseId: string, studentQuestion: string) {
  return handlePatientReplyRequest({ caseId, studentQuestion, mode: "rule" });
}

async function main() {
  const smoking = await ask("HX-ADD-001", "吸烟吗？");
  assert(/吸烟|包年|不吸烟/.test(smoking.replyText), `smoking answer should mention smoking: ${smoking.replyText}`);
  assertNotContains(smoking.replyText, ["乙肝", "糖尿病", "饮酒", "输血", "子女", "高血压"], "smoking");

  const drinking = await ask("HX-ADD-001", "喝酒吗？");
  assert(/饮酒|喝酒/.test(drinking.replyText), `drinking answer should mention drinking: ${drinking.replyText}`);
  assertNotContains(drinking.replyText, ["吸烟", "包年", "乙肝", "高血压", "糖尿病"], "drinking");

  const hypertension = await ask("HX-ADD-001", "有高血压吗？");
  assert(/高血压|没有/.test(hypertension.replyText), `hypertension answer should mention hypertension only: ${hypertension.replyText}`);
  assertNotContains(hypertension.replyText, ["乙肝", "糖尿病", "结核", "吸烟", "饮酒", "输血", "子女"], "hypertension");

  const clot = await ask("P001", "有血块吗？");
  assertNotContains(clot.replyText, ["未主动诉", "未诉", "需追问", "鲜红色", "全程血尿", "无痛"], "clot");

  const color = await ask("P004", "尿鲜红色吗？");
  assert(/红|颜色|茶色|酱油|洗肉水/.test(color.replyText), `color answer should mention color: ${color.replyText}`);
  assertNotContains(color.replyText, ["CT", "占位", "癌栓", "淋巴结", "诊断", "肿瘤"], "color");

  const ct = await ask("P004", "做过CT吗，结果怎么样？");
  assert(ct.safetyFlags.includes("blocked_report_request"), "CT question should be blocked as report request");
  assertNotContains(ct.replyText, ["占位", "癌栓", "淋巴结", "骨转移", "CT提示", "诊断"], "CT report");

  const badFilter = filterPatientReply("- 根据原始病史：CT提示占位，考虑肿瘤。");
  assert(!badFilter.ok && badFilter.hits.length >= 2, "responseFilter should block teacher/report leaks");

  const searchableFiles = [
    ".env.example",
    "src/server/llmClient.ts",
    "src/server/patientReplyService.ts",
    "api/patient-reply.js",
    "src/components/ClinicalTrainingClient.tsx"
  ];
  const combined = searchableFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  assert(!/sk-[A-Za-z0-9_-]{12,}/.test(combined), "source should not contain secret keys");
  assert(!/LLM_API_KEY\s*=\s*(?!your_)[^\s#]+/.test(combined), "source should not contain real LLM_API_KEY values");

  const deepSeekClients = [
    "server/llmClient.runtime.js",
    "server/llmClient.ts",
    "src/server/llmClient.ts",
    "api/agent-chat.js",
    "api/patient-reply.js"
  ];
  for (const file of deepSeekClients) {
    const source = fs.readFileSync(file, "utf8");
    assert(source.includes("LLM_THINKING_MODE"), `${file} must configure DeepSeek thinking mode`);
    assert(source.includes("thinking:"), `${file} must send the DeepSeek thinking option`);
    assert(source.includes('"disabled"'), `${file} must default patient-facing calls to disabled thinking`);
  }

  const dynamicSessionSource = fs.readFileSync("server/patientSession.js", "utf8");
  assert(
    !dynamicSessionSource.includes("completedPatientFacingProfile: session.completedPatientFacingProfile"),
    "dynamic Patient Agent must not send the whole patient profile to the per-question LLM call"
  );
  assert(dynamicSessionSource.includes("currentAllowedAnswer:"), "dynamic Patient Agent must send only the current allowed answer");
  assert(dynamicSessionSource.includes("preservesAllowedAnswer"), "dynamic Patient Agent must reject factual drift");
  assert(dynamicSessionSource.includes("parsed.rawPatientFacingProfile"), "dynamic profile completion must unwrap DeepSeek profile envelopes");
  assert(dynamicSessionSource.includes('fallbackReason: "diagnosis_boundary"'), "diagnosis requests must be blocked before slot matching");
  assert(dynamicSessionSource.includes("authoritativeProfile"), "serverless Patient Agent must rebuild authoritative patient facts per request");

  console.log("LLM adapter and API safety tests passed.");
}

void main();
