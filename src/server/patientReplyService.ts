import { allCases } from "@/src/lib/cases";
import { generatePatientReply } from "@/src/lib/patientEngine";
import { callLLM, getLLMProviderConfig } from "./llmClient";
import { filterPatientReply, normalizeQuestion, sanitizeRuleReply } from "./responseFilter";

export type PatientReplyRequest = {
  caseId: string;
  stage?: string;
  studentQuestion: string;
  conversationHistory?: Array<{ role: string; text: string }>;
  askedSlotIds?: string[];
  mode?: "rule" | "ai" | "debug";
};

export type PatientReplyResponse = {
  replyText: string;
  matchedSlotIds: string[];
  revealedFields: string[];
  blockedFields: string[];
  provider: string;
  model: string;
  isFallback: boolean;
  debug?: {
    rawRuleReply: string;
    rawPatientAnswer: string;
    filterHits: string[];
    cacheKey: string;
  };
};

const PATIENT_AGENT_SYSTEM_PROMPT = `你是血尿临床思维训练系统中的模拟患者，不是医生、教师或病历摘要器。

你只能根据提供的 patientAnswer 回答学生刚刚问到的问题。

绝对规则：
1. 只回答学生当前问题对应的信息。
2. 不要补充学生没有问到的信息。
3. 不要总结完整病史。
4. 不要透露检查结果、影像结果、病理结果、诊断、治疗方案。
5. 不要使用“根据原始病史”“病例资料显示”“未主动诉”“需追问”“评分点”等词。
6. 不要使用医学术语；如必须使用，应改成患者能理解的话。
7. 不要编造 patientAnswer 中没有的信息。
8. 如果 patientAnswer 为空或不确定，回答“我不太清楚”或“我没有注意到”。
9. 回答采用患者第一人称。
10. 输出 1-2 条中文分点，每条不超过 40 字。

输出格式：
- ...
- ...`;

const aiReplyCache = new Map<string, PatientReplyResponse>();

function isSimpleRuleReply(text: string) {
  const plain = text.replace(/^-\s*/gm, "").replace(/\s+/g, "");
  return plain.length <= 12 || /^[-\s]*(有|没有|不疼|没发热|不清楚|没有注意到)[。.!！]?$/.test(plain);
}

function fallbackResponse(
  ruleReply: ReturnType<typeof generatePatientReply>,
  provider = "rule",
  model = "local-rule",
  debug?: PatientReplyResponse["debug"]
): PatientReplyResponse {
  return {
    replyText: sanitizeRuleReply(ruleReply.replyText),
    matchedSlotIds: ruleReply.matchedSlotIds,
    revealedFields: ruleReply.revealedFields,
    blockedFields: ruleReply.blockedTeacherFields,
    provider,
    model,
    isFallback: true,
    debug
  };
}

export async function handlePatientReplyRequest(input: PatientReplyRequest): Promise<PatientReplyResponse> {
  const caseData = allCases.find((item) => item.id === input.caseId);
  if (!caseData) throw new Error(`Unknown caseId: ${input.caseId}`);
  const question = input.studentQuestion?.trim();
  if (!question) throw new Error("studentQuestion is required");

  const ruleReply = generatePatientReply({ caseData, userQuestion: question, stage: input.stage });
  const ruleText = sanitizeRuleReply(ruleReply.replyText);
  const config = getLLMProviderConfig();
  const mode = input.mode || "ai";
  const cacheKey = `${input.caseId}:${ruleReply.matchedSlotIds.join(",")}:${normalizeQuestion(question)}:${config.model || "no-model"}`;

  if (mode === "rule" || !ruleReply.matchedSlotIds.length || ruleReply.safetyFlags.includes("blocked_diagnosis_request") || ruleReply.safetyFlags.includes("blocked_report_request")) {
    return fallbackResponse(ruleReply, "rule", "local-rule", mode === "debug" ? { rawRuleReply: ruleText, rawPatientAnswer: ruleText, filterHits: [], cacheKey } : undefined);
  }

  if (aiReplyCache.has(cacheKey)) {
    const cached = aiReplyCache.get(cacheKey)!;
    return mode === "debug" ? cached : { ...cached, debug: undefined };
  }

  if (!config.enabled || isSimpleRuleReply(ruleText)) {
    return fallbackResponse(ruleReply, "rule", "local-rule", mode === "debug" ? { rawRuleReply: ruleText, rawPatientAnswer: ruleText, filterHits: [], cacheKey } : undefined);
  }

  const userPayload = {
    studentQuestion: question,
    matchedSlotId: ruleReply.matchedSlotIds[0],
    patientAnswer: ruleText,
    casePersona: caseData.agentProfile?.patientPersona || caseData.patientPersona?.communicationNote || "普通患者，表达简短，按事实回答。",
    forbiddenRules: [
      "不要补充当前 patientAnswer 之外的事实",
      "不要透露检查、影像、病理、诊断、治疗和评分",
      "不要出现教师端提示词",
      "输出 1-2 条中文分点"
    ]
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await callLLM({
        systemPrompt: attempt === 0
          ? PATIENT_AGENT_SYSTEM_PROMPT
          : `${PATIENT_AGENT_SYSTEM_PROMPT}\n\n上一次输出不合格。请严格只根据 patientAnswer 输出，不要出现任何诊断、检查、治疗或教师提示。`,
        userPayload,
        temperature: config.temperature,
        maxTokens: config.maxTokens
      });
      const replyText = sanitizeRuleReply(result.text);
      const filter = filterPatientReply(replyText);
      if (!filter.ok) {
        if (attempt === 1) {
          return fallbackResponse(ruleReply, result.provider, result.model, mode === "debug" ? { rawRuleReply: ruleText, rawPatientAnswer: ruleText, filterHits: filter.hits, cacheKey } : undefined);
        }
        continue;
      }
      const response: PatientReplyResponse = {
        replyText,
        matchedSlotIds: ruleReply.matchedSlotIds,
        revealedFields: ruleReply.revealedFields,
        blockedFields: ruleReply.blockedTeacherFields,
        provider: result.provider,
        model: result.model,
        isFallback: false,
        debug: mode === "debug" ? { rawRuleReply: ruleText, rawPatientAnswer: ruleText, filterHits: filter.hits, cacheKey } : undefined
      };
      aiReplyCache.set(cacheKey, response);
      return response;
    } catch (error) {
      if (attempt === 1) {
        return fallbackResponse(ruleReply, config.provider, config.model || "unknown", mode === "debug" ? { rawRuleReply: ruleText, rawPatientAnswer: ruleText, filterHits: [error instanceof Error ? error.message : "LLM call failed"], cacheKey } : undefined);
      }
    }
  }

  return fallbackResponse(ruleReply);
}
