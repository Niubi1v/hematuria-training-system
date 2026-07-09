import { allCases, getCaseById } from "@/src/lib/cases";
import type { ChatMessage } from "@/src/lib/types";
import { callLLM, getLLMProviderConfig } from "./llmClient";
import { handlePatientReplyRequest } from "./patientReplyService";

export type AgentId =
  | "standardized_patient"
  | "investigation"
  | "diagnostic_reasoning"
  | "mdt_coordinator"
  | "clinical_decision_support"
  | "perioperative_management"
  | "assessment_debriefing";

export type AgentChatRequest = {
  caseId: string;
  agentId: AgentId;
  stage?: string;
  mode?: "training" | "osce" | "rule" | "debug";
  language?: "zh" | "en";
  studentInput: string;
  conversationHistory?: Array<Pick<ChatMessage, "role" | "text">>;
  unlockedData?: Record<string, unknown>;
  studentActions?: unknown[];
  askedQuestions?: string[];
  askedSlotIds?: string[];
};

export type AgentChatResponse = {
  agentId: AgentId;
  replyText: string;
  usedModel: string;
  provider: string;
  visibleToStudent: boolean;
  revealedDataKeys: string[];
  blockedDataKeys: string[];
  safetyFlags: string[];
  isFallback: boolean;
};

const blockedTeacherKeys = ["diagnosis", "imaging", "pathology", "treatment", "teacherOnlyData", "case_card", "scoring"];

function providerLabel() {
  const config = getLLMProviderConfig();
  return {
    provider: config.provider || "custom",
    model: config.model || "local-rule"
  };
}

function fallbackFor(agentId: AgentId, language = "zh") {
  if (language === "en") {
    return "The AI agent is temporarily unavailable. Please submit your current answer; the system will use rule-based feedback after submission.";
  }
  if (agentId === "investigation") return "AI暂不可用。请按当前已开立项目查看系统返回的报告，不会提前显示未开项目结果。";
  return "AI暂不可用。请先提交当前阶段答案，系统会在提交后按规则生成反馈。";
}

function agentSystemPrompt(agentId: AgentId, language = "zh") {
  const outputLanguage = language === "en" ? "English" : "中文";
  return `
你是血尿多智能体临床思维训练系统中的 ${agentId}。
只允许使用 userPayload 中 unlockedData、studentInput、studentActions、conversationHistory 里已经解锁的信息。
不得猜测或泄露未解锁的最终诊断、标准答案、评分点、病理、影像细节或治疗路径。
如果信息不足，要求学生补充当前阶段所需内容。
输出语言：${outputLanguage}。
输出简洁，最多 5 条要点。
`.trim();
}

export async function handleAgentChatRequest(input: AgentChatRequest): Promise<AgentChatResponse> {
  const caseData = getCaseById(input.caseId) || allCases.find((item) => item.id === input.caseId);
  if (!caseData) throw new Error(`Unknown caseId: ${input.caseId}`);
  if (!input.studentInput?.trim()) throw new Error("studentInput is required");

  const labels = providerLabel();
  const agentId = input.agentId || "standardized_patient";

  if (agentId === "standardized_patient") {
    const patient = await handlePatientReplyRequest({
      caseId: input.caseId,
      stage: input.stage || "history",
      studentQuestion: input.studentInput,
      conversationHistory: input.conversationHistory,
      askedSlotIds: input.askedSlotIds,
      mode: input.mode === "rule" ? "rule" : "ai"
    });
    return {
      agentId,
      replyText: patient.replyText,
      usedModel: patient.model,
      provider: patient.provider,
      visibleToStudent: true,
      revealedDataKeys: patient.revealedFields.length ? patient.revealedFields : patient.matchedSlotIds,
      blockedDataKeys: patient.blockedFields.length ? patient.blockedFields : blockedTeacherKeys,
      safetyFlags: patient.safetyFlags,
      isFallback: patient.isFallback
    };
  }

  const config = getLLMProviderConfig();
  if (!config.enabled || input.mode === "rule") {
    return {
      agentId,
      replyText: fallbackFor(agentId, input.language),
      usedModel: labels.model,
      provider: labels.provider,
      visibleToStudent: true,
      revealedDataKeys: Object.keys(input.unlockedData || {}),
      blockedDataKeys: blockedTeacherKeys,
      safetyFlags: ["llm_unavailable_fallback"],
      isFallback: true
    };
  }

  try {
    const result = await callLLM({
      systemPrompt: agentSystemPrompt(agentId, input.language),
      userPayload: {
        caseId: caseData.id,
        agentId,
        stage: input.stage,
        mode: input.mode,
        language: input.language || "zh",
        studentInput: input.studentInput,
        conversationHistory: (input.conversationHistory || []).slice(-8),
        unlockedData: input.unlockedData || {},
        studentActions: input.studentActions || [],
        askedQuestions: input.askedQuestions || []
      },
      maxTokens: Math.min(config.maxTokens || 300, 500)
    });
    return {
      agentId,
      replyText: result.text,
      usedModel: result.model,
      provider: result.provider,
      visibleToStudent: true,
      revealedDataKeys: Object.keys(input.unlockedData || {}),
      blockedDataKeys: blockedTeacherKeys,
      safetyFlags: [],
      isFallback: false
    };
  } catch {
    return {
      agentId,
      replyText: fallbackFor(agentId, input.language),
      usedModel: labels.model,
      provider: labels.provider,
      visibleToStudent: true,
      revealedDataKeys: Object.keys(input.unlockedData || {}),
      blockedDataKeys: blockedTeacherKeys,
      safetyFlags: ["llm_error_fallback"],
      isFallback: true
    };
  }
}
