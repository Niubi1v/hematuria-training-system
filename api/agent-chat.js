const cases = require("../data/cases.json");
const { generatePatientAnswer, probePatientProvider } = require("../server/patientSession.js");
const { applyAgentCors, positiveInteger, setRateLimitHeaders, takeRateLimit } = require("../server/requestSecurity.js");
const { setServerTiming } = require("../server/performanceTiming.js");
const { readLLMResponse } = require("../server/llmClient.runtime.js");

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
const requestWindows = globalThis.__hematuriaAgentChatRequestWindows || new Map();
globalThis.__hematuriaAgentChatRequestWindows = requestWindows;
const safetyFallbackReasons = new Set([
  "diagnosis_boundary",
  "report_boundary",
  "compound_question_preserves_all_facts",
  "ai_response_blocked",
  "medical_bilingual_conflict_pending_review",
  "safety_filter"
]);

function safetyBoundaryFallback(patient) {
  const reason = String(patient.fallbackReason || "").toLowerCase();
  return safetyFallbackReasons.has(reason)
    || (patient.safetyFlags || []).some((flag) => flag.startsWith("blocked_") || flag === "ai_response_blocked");
}

function getProviderConfig() {
  const endpointType = process.env.LLM_ENDPOINT_TYPE || "chat_completions";
  return {
    provider: process.env.LLM_PROVIDER || "custom",
    apiKey: process.env.LLM_API_KEY,
    baseUrl: process.env.LLM_API_BASE_URL,
    model: process.env.LLM_MODEL || "local-rule",
    endpointType,
    streaming: process.env.LLM_STREAMING_ENABLED === undefined
      ? endpointType === "chat_completions"
      : process.env.LLM_STREAMING_ENABLED === "true",
    temperature: Number(process.env.LLM_TEMPERATURE || 0.2),
    maxTokens: Number(process.env.LLM_MAX_TOKENS || 300),
    timeoutMs: Number(process.env.LLM_REQUEST_TIMEOUT_MS || 15000),
    thinkingMode: process.env.LLM_THINKING_MODE || "disabled",
    enabled: process.env.LLM_ENABLE_AI_AGENTS === "true" || process.env.LLM_ENABLE_AI_PATIENT === "true"
  };
}

function deepSeekThinking(config) {
  const isDeepSeek = config.provider.toLowerCase() === "deepseek" || String(config.baseUrl || "").toLowerCase().includes("deepseek.com");
  return isDeepSeek ? { thinking: { type: config.thinkingMode } } : {};
}

function joinUrl(baseUrl, endpointType) {
  const trimmed = String(baseUrl || "").replace(/\/+$/, "");
  if (endpointType === "chat_completions" && !trimmed.endsWith("/chat/completions")) return `${trimmed}/chat/completions`;
  return trimmed;
}

async function callLLM({ systemPrompt, userPayload, maxTokens }) {
  const startedAt = Date.now();
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
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", Accept: config.streaming ? "text/event-stream" : "application/json" },
      body: JSON.stringify({
        model: config.model,
        ...deepSeekThinking(config),
        temperature: config.temperature,
        max_tokens: maxTokens || config.maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload) }
        ],
        stream: config.streaming
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`LLM provider returned ${response.status}: ${body.slice(0, 200)}`);
    }
    const { text, firstTokenMs } = await readLLMResponse(response, { streaming: config.streaming, startedAt });
    if (!text) throw new Error("Empty LLM response");
    return { text, provider: config.provider, model: config.model, durationMs: Date.now() - startedAt, firstTokenMs };
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
  const startedAt = Date.now();
  const origin = applyAgentCors(req, res);
  if (!origin.allowed) return res.status(403).json({ error: "origin_not_allowed" });
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const rate = takeRateLimit(req, {
    store: requestWindows,
    limit: positiveInteger(process.env.AGENT_CHAT_RATE_LIMIT_PER_MINUTE || process.env.AGENT_API_RATE_LIMIT_PER_MINUTE, 30, 10000),
    windowMs: positiveInteger(process.env.AGENT_API_RATE_LIMIT_WINDOW_MS, 60_000)
  });
  setRateLimitHeaders(res, rate);
  if (rate.limited) return res.status(429).json({ error: "rate_limited" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const agentId = agentIds.has(body.agentId) ? body.agentId : "standardized_patient";
    const caseData = cases.find((item) => String(item.id).toLowerCase() === String(body.caseId).toLowerCase());
    if (!caseData) return res.status(400).json({ error: "unknown_case" });
    if (!body.probe && !String(body.studentInput || "").trim()) return res.status(400).json({ error: "studentInput is required" });

    if (agentId === "standardized_patient") {
      if (body.probe) {
        const probe = await probePatientProvider();
        setServerTiming(res, { app: Date.now() - startedAt, provider: probe.providerDurationMs, firsttoken: probe.providerFirstTokenMs });
        const publicProbe = { ...probe };
        delete publicProbe.providerDurationMs;
        delete publicProbe.providerFirstTokenMs;
        return res.status(200).json({ agentId, replyText: "", matchedSlotIds: [], matchedFacts: [], safetyFlags: [], answerSource: probe.isFallback ? "rule" : probe.provider, confidence: 1, ...publicProbe });
      }
      const patient = await generatePatientAnswer({
        sessionId: body.sessionId,
        caseId: body.caseId,
        studentInput: body.studentInput,
        conversationHistory: body.conversationHistory || [],
        language: body.language || "zh"
      });
      const generationSource = patient.isFallback
        ? (safetyBoundaryFallback(patient) ? "safety_boundary" : "rule_fallback")
        : patient.cacheHit ? "ai_cache" : "live_ai";
      setServerTiming(res, { app: Date.now() - startedAt, provider: patient.providerDurationMs, firsttoken: patient.providerFirstTokenMs });
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
        generationSource,
        matchedSlotIds: patient.matchedSlotIds || [],
        matchedFacts: patient.matchedFacts || [],
        answerSource: patient.answerSource || (patient.isFallback ? "rule" : patient.provider),
        factSource: patient.answerSource || "unknown",
        confidence: patient.confidence ?? (patient.isFallback ? 0.85 : 0.95),
        fallbackReason: patient.fallbackReason || (patient.isFallback ? "ai_unavailable_or_rule_mode" : ""),
        ...(body.debug ? { debug: { responseAccepted: Boolean(patient.filter?.ok), rewriteTriggered: Boolean(patient.rewriteTriggered), cacheHit: Boolean(patient.cacheHit), deploymentCommit: process.env.VERCEL_GIT_COMMIT_SHA || "local" } } : {})
      });
    }

    const config = getProviderConfig();
    if (!config.enabled || body.mode === "rule") {
      setServerTiming(res, { app: Date.now() - startedAt });
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
      setServerTiming(res, { app: Date.now() - startedAt, provider: llm.durationMs, firsttoken: llm.firstTokenMs });
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
      setServerTiming(res, { app: Date.now() - startedAt });
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
  } catch {
    return res.status(500).json({ error: "agent_api_failed" });
  }
};
