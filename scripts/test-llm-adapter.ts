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
  const smoking = await ask("P008", "吸烟吗？");
  assert(/吸烟|抽烟|烟/.test(smoking.replyText), `smoking answer should mention smoking: ${smoking.replyText}`);
  assert(/20|二十|半包/.test(smoking.replyText), `smoking answer should include duration or amount: ${smoking.replyText}`);
  assertNotContains(smoking.replyText, ["乙肝", "高血压", "糖尿病", "结核", "药物过敏", "饮酒", "喝酒", "输血", "子女"], "smoking");

  const drinking = await ask("P008", "喝酒吗？");
  assert(/喝酒|饮酒|应酬|酒/.test(drinking.replyText), `drinking answer should mention drinking: ${drinking.replyText}`);
  assertNotContains(drinking.replyText, ["吸烟", "抽烟", "每天半包", "乙肝", "高血压", "糖尿病", "结核"], "drinking");

  const hypertension = await ask("P008", "有高血压吗？");
  assert(/高血压|没有/.test(hypertension.replyText), `hypertension answer should mention hypertension only: ${hypertension.replyText}`);
  assertNotContains(hypertension.replyText, ["乙肝", "糖尿病", "结核", "药物过敏", "吸烟", "饮酒"], "hypertension");

  const clot = await ask("P001", "有血块吗？");
  assertNotContains(clot.replyText, ["未主动诉", "未诉", "需追问", "鲜红色", "全程血尿", "无痛"], "clot");

  const color = await ask("P004", "尿鲜红色吗？");
  assert(/红|颜色|洗肉水|茶色|酱油/.test(color.replyText), `color answer should mention color: ${color.replyText}`);
  assertNotContains(color.replyText, ["CT", "占位", "癌栓", "诊断", "肿瘤"], "color");

  const badFilter = filterPatientReply("- 根据原始病史，CT提示占位，考虑肿瘤。");
  assert(!badFilter.ok && badFilter.hits.length >= 2, "responseFilter should block teacher/report leaks");

  const searchableFiles = [
    ".env.example",
    "src/server/llmClient.ts",
    "src/server/patientReplyService.ts",
    "src/components/ClinicalTrainingClient.tsx"
  ];
  const combined = searchableFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  assert(!/sk-[A-Za-z0-9_-]{12,}/.test(combined), "source should not contain OpenAI-like secret keys");
  assert(!/LLM_API_KEY\s*=\s*(?!your_api_key_here)[^\s]+/.test(combined), "source should not contain real LLM_API_KEY values");

  console.log("LLM adapter and API safety tests passed.");
}

void main();
