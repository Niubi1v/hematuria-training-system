import { allCases, getCaseById } from "@/src/lib/cases";
import { generatePatientReply } from "@/src/lib/patientEngine";
import type { CaseData, ChatMessage } from "@/src/lib/types";
import { callLLM, getLLMProviderConfig } from "./llmClient";
import { filterPatientReply, sanitizeRuleReply } from "./responseFilter";

export type PatientReplyRequest = {
  caseId: string;
  stage?: string;
  studentQuestion: string;
  conversationHistory?: Array<Pick<ChatMessage, "role" | "text">>;
  askedSlotIds?: string[];
  mode?: "ai" | "rule";
};

export type PatientReplyResponse = {
  replyText: string;
  matchedSlotIds: string[];
  revealedFields: string[];
  blockedFields: string[];
  safetyFlags: string[];
  provider: string;
  model: string;
  isFallback: boolean;
};

const PATIENT_AGENT_SYSTEM_PROMPT = `
你是血尿临床思维训练系统中的标准化病人。你不是医生、教师、病历摘要器或诊断助手。

必须遵守：
1. 学生问什么，只回答什么。
2. 只根据 currentAllowedAnswer 润色回答，不补充未问信息。
3. 不总结完整病史。
4. 不透露尿检、影像、膀胱镜、病理、诊断、治疗、MDT、评分点。
5. 不使用“根据原始病史”“根据病例资料”“未主动诉”“需追问”“评分点”等词。
6. 不编造 currentAllowedAnswer 之外的信息。
7. 如果不知道，就说“我不太清楚”或“我没有注意到”。
8. 用第一人称患者口吻。
9. 输出 1-2 条中文分点短句，每条不超过 80 字。
10. 如果学生问诊断，只能回答“这个我不清楚，需要医生判断。”

输出格式：
- ...
- ...
`.trim();

function buildPatientFacingPayload(caseData: CaseData, matchedSlotIds: string[], ruleText: string) {
  const profile = (caseData as unknown as { patientFacingProfile?: Record<string, string> }).patientFacingProfile || {};
  return {
    caseId: caseData.id,
    age: profile.age || caseData.age,
    sex: profile.sex || caseData.sex,
    chiefComplaint: profile.chiefComplaint || caseData.studentChiefComplaint || caseData.chiefComplaint,
    persona: profile.persona || caseData.patientPersona?.communicationNote || caseData.agentProfile?.patientPersona || "配合度较好的普通患者",
    reportBoundary: "患者可以说做过检查，但不能说出尿检、影像、膀胱镜、病理等报告细节。",
    matchedSlotIds,
    currentAllowedAnswer: ruleText
  };
}

function providerLabel() {
  const config = getLLMProviderConfig();
  return {
    provider: config.provider || "custom",
    model: config.model || "local-rule"
  };
}

function toRuleResponse(ruleReply: ReturnType<typeof generatePatientReply>, isFallback: boolean, provider = "rule", model = "local-rule"): PatientReplyResponse {
  return {
    replyText: sanitizeRuleReply(ruleReply.replyText),
    matchedSlotIds: ruleReply.matchedSlotIds,
    revealedFields: ruleReply.revealedFields,
    blockedFields: [...new Set(ruleReply.blockedTeacherFields)],
    safetyFlags: ruleReply.safetyFlags,
    provider,
    model,
    isFallback
  };
}

export async function handlePatientReplyRequest(input: PatientReplyRequest): Promise<PatientReplyResponse> {
  const caseData = getCaseById(input.caseId) || allCases.find((item) => item.id === input.caseId);
  if (!caseData) throw new Error(`Unknown caseId: ${input.caseId}`);

  const question = String(input.studentQuestion || "").trim();
  if (!question) throw new Error("studentQuestion is required");

  const ruleReply = generatePatientReply({
    caseData,
    userQuestion: question,
    stage: input.stage || "history",
    mode: input.mode || "ai"
  });

  if (input.mode === "rule" || !ruleReply.matchedSlotIds.length || ruleReply.safetyFlags.length) {
    return toRuleResponse(ruleReply, true);
  }

  const config = getLLMProviderConfig();
  const labels = providerLabel();
  if (!config.enabled) return toRuleResponse(ruleReply, true, labels.provider, labels.model);

  const payload = {
    studentQuestion: question,
    patientFacingProfile: buildPatientFacingPayload(caseData, ruleReply.matchedSlotIds, ruleReply.replyText),
    conversationHistory: (input.conversationHistory || []).slice(-4),
    askedSlotIds: input.askedSlotIds || [],
    stageGuardrails: [
      "只回答当前问题对应的 currentAllowedAnswer。",
      "不得输出检查报告、影像、病理、诊断、治疗、MDT、评分点。",
      "不得输出教师提示或病例资料来源说明。",
      "输出1-2条中文分点短句。"
    ]
  };

  try {
    const first = await callLLM({
      systemPrompt: PATIENT_AGENT_SYSTEM_PROMPT,
      userPayload: payload,
      maxTokens: Math.min(config.maxTokens || 120, 160)
    });
    const filteredFirst = filterPatientReply(first.text);
    if (filteredFirst.ok) {
      return {
        ...toRuleResponse(ruleReply, false, first.provider, first.model),
        replyText: first.text
      };
    }

    const retry = await callLLM({
      systemPrompt: `${PATIENT_AGENT_SYSTEM_PROMPT}\n\n上一次回答包含禁止内容：${filteredFirst.hits.join("、")}。请只基于 currentAllowedAnswer 重新输出。`,
      userPayload: payload,
      maxTokens: Math.min(config.maxTokens || 120, 160)
    });
    const filteredRetry = filterPatientReply(retry.text);
    if (filteredRetry.ok) {
      return {
        ...toRuleResponse(ruleReply, false, retry.provider, retry.model),
        replyText: retry.text,
        blockedFields: [...new Set([...ruleReply.blockedTeacherFields, ...filteredFirst.hits])]
      };
    }

    return {
      ...toRuleResponse(ruleReply, true, labels.provider, labels.model),
      blockedFields: [...new Set([...ruleReply.blockedTeacherFields, ...filteredFirst.hits, ...filteredRetry.hits])],
      safetyFlags: [...new Set([...ruleReply.safetyFlags, "ai_response_blocked"])]
    };
  } catch {
    return toRuleResponse(ruleReply, true, labels.provider, labels.model);
  }
}
