const cases = require("../data/cases.json");
const { generatePatientAnswer } = require("./lib/patientSession.js");

const blockedTeacherKeys = ["diagnosis", "imaging", "pathology", "treatment", "teacherOnlyData", "case_card", "scoring"];
const agentIds = new Set([
  "standardized_patient",
  "investigation",
  "diagnostic_reasoning",
  "mdt_coordinator",
  "clinical_decision_support",
  "perioperative_management",
  "assessment_debriefing"
]);

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.AGENT_API_ALLOWED_ORIGIN || process.env.PATIENT_AGENT_ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function getProviderConfig() {
  return {
    provider: process.env.LLM_PROVIDER || "custom",
    apiKey: process.env.LLM_API_KEY,
    baseUrl: process.env.LLM_API_BASE_URL,
    model: process.env.LLM_MODEL || "local-rule",
    endpointType: process.env.LLM_ENDPOINT_TYPE || "chat_completions",
    temperature: Number(process.env.LLM_TEMPERATURE || 0.2),
    maxTokens: Number(process.env.LLM_MAX_TOKENS || 300),
    timeoutMs: Number(process.env.LLM_REQUEST_TIMEOUT_MS || 15000),
    enabled: process.env.LLM_ENABLE_AI_AGENTS === "true" || process.env.LLM_ENABLE_AI_PATIENT === "true"
  };
}

function joinUrl(baseUrl, endpointType) {
  const trimmed = String(baseUrl || "").replace(/\/+$/, "");
  if (endpointType === "chat_completions" && !trimmed.endsWith("/chat/completions")) return `${trimmed}/chat/completions`;
  return trimmed;
}

function readLLMText(payload) {
  return payload?.choices?.[0]?.message?.content || payload?.choices?.[0]?.text || payload?.output_text || payload?.content || "";
}

async function callLLM({ systemPrompt, userPayload, maxTokens }) {
  const config = getProviderConfig();
  if (!config.enabled) throw new Error("LLM agent mode is disabled");
  if (!config.apiKey) throw new Error("Missing LLM_API_KEY");
  if (!config.baseUrl) throw new Error("Missing LLM_API_BASE_URL");
  if (!config.model) throw new Error("Missing LLM_MODEL");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(joinUrl(config.baseUrl, config.endpointType), {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        temperature: config.temperature,
        max_tokens: maxTokens || config.maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload) }
        ]
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`LLM provider returned ${response.status}: ${body.slice(0, 200)}`);
    }
    const json = await response.json();
    const text = readLLMText(json).trim();
    if (!text) throw new Error("Empty LLM response");
    return { text, provider: config.provider, model: config.model };
  } finally {
    clearTimeout(timeout);
  }
}

function agentPrompt(agentId, language) {
  const outputLanguage = language === "en" ? "English" : "中文";
  return `
You are ${agentId} in a hematuria clinical reasoning training system.
Use only the stage-unlocked data in userPayload. Do not reveal hidden diagnosis, standard answer, score key, pathology, imaging details, or treatment plan unless the userPayload explicitly contains them as unlocked data.
If information is insufficient, ask the student to complete the current stage.
Output language: ${outputLanguage}.
Keep the reply concise, at most 5 bullet points.
`.trim();
}

function fallbackFor(agentId, language) {
  if (language === "en") return "The AI agent is temporarily unavailable. Continue this stage and submit for rule-based feedback.";
  if (agentId === "investigation") return "AI暂不可用。请按当前已开立项目查看系统返回的报告，未开项目不会提前显示结果。";
  return "AI暂不可用。请先完成当前阶段作答，提交后系统会按规则生成反馈。";
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const agentId = agentIds.has(body.agentId) ? body.agentId : "standardized_patient";
    const caseData = cases.find((item) => String(item.id).toLowerCase() === String(body.caseId).toLowerCase());
    if (!caseData) return res.status(400).json({ error: `Unknown caseId: ${body.caseId}` });
    if (!String(body.studentInput || "").trim()) return res.status(400).json({ error: "studentInput is required" });

    if (agentId === "standardized_patient") {
      const patient = await generatePatientAnswer({
        sessionId: body.sessionId,
        caseId: body.caseId,
        studentInput: body.studentInput,
        conversationHistory: body.conversationHistory || [],
        language: body.language || "zh",
        completedPatientFacingProfile: body.completedPatientFacingProfile || body.sessionProfile
      });
      return res.status(200).json({
        agentId,
        replyText: patient.replyText,
        usedModel: patient.model,
        provider: patient.provider,
        visibleToStudent: true,
        revealedDataKeys: [],
        blockedDataKeys: blockedTeacherKeys,
        safetyFlags: patient.safetyFlags || [],
        isFallback: Boolean(patient.isFallback),
        matchedSlotIds: patient.matchedSlotIds || [],
        matchedFacts: patient.matchedFacts || [],
        answerSource: patient.answerSource || (patient.isFallback ? "rule" : patient.provider),
        confidence: patient.confidence ?? (patient.isFallback ? 0.85 : 0.95),
        fallbackReason: patient.fallbackReason || (patient.isFallback ? patient.error || "ai_unavailable_or_rule_mode" : ""),
        ...(body.debug ? { debug: { responseFilter: patient.filter, rewriteTriggered: patient.rewriteTriggered, cacheHit: Boolean(patient.cacheHit), error: patient.error || "" } } : {})
      });
    }

    const config = getProviderConfig();
    if (!config.enabled || body.mode === "rule") {
      return res.status(200).json({
        agentId,
        replyText: fallbackFor(agentId, body.language),
        usedModel: config.model,
        provider: config.provider,
        visibleToStudent: true,
        revealedDataKeys: Object.keys(body.unlockedData || {}),
        blockedDataKeys: blockedTeacherKeys,
        safetyFlags: ["llm_unavailable_fallback"],
        isFallback: true
      });
    }

    try {
      const llm = await callLLM({
        systemPrompt: agentPrompt(agentId, body.language),
        userPayload: {
          caseId: caseData.id,
          agentId,
          stage: body.stage,
          mode: body.mode,
          language: body.language || "zh",
          studentInput: body.studentInput,
          conversationHistory: (body.conversationHistory || []).slice(-8),
          unlockedData: body.unlockedData || {},
          studentActions: body.studentActions || [],
          askedQuestions: body.askedQuestions || []
        },
        maxTokens: Math.min(config.maxTokens || 300, 500)
      });
      return res.status(200).json({
        agentId,
        replyText: llm.text,
        usedModel: llm.model,
        provider: llm.provider,
        visibleToStudent: true,
        revealedDataKeys: Object.keys(body.unlockedData || {}),
        blockedDataKeys: blockedTeacherKeys,
        safetyFlags: [],
        isFallback: false
      });
    } catch {
      return res.status(200).json({
        agentId,
        replyText: fallbackFor(agentId, body.language),
        usedModel: config.model,
        provider: config.provider,
        visibleToStudent: true,
        revealedDataKeys: Object.keys(body.unlockedData || {}),
        blockedDataKeys: blockedTeacherKeys,
        safetyFlags: ["llm_error_fallback"],
        isFallback: true
      });
    }
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "Agent API failed" });
  }
};
