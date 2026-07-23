const cases = require("../data/cases.json");
const { generatePatientAnswer, probePatientProvider } = require("../server/patientSession.js");
const { applyAgentCors, clientKey, parseJsonBody, positiveInteger, setRateLimitHeaders, takeRateLimit } = require("../server/requestSecurity.js");
const { setServerTiming } = require("../server/performanceTiming.js");
const { readLLMResponse } = require("../server/llmClient.runtime.js");
const { verifySessionCapability } = require("../server/sessionCapability.js");
const { normalizeAttemptMode } = require("../server/trainingState.js");
const { executeIdempotentAgentRequest } = require("../server/agentRequestStore.js");

const blockedTeacherKeys = ["diagnosis", "imaging", "pathology", "treatment", "teacherOnlyData", "case_card", "scoring"];
const PUBLIC_AGENT_ID = "standardized_patient";
const PUBLIC_REQUEST_FIELDS = new Set([
  "caseId", "agentId", "sessionId", "attemptId", "sessionMode", "mode", "stage", "language",
  "studentInput", "conversationHistory", "askedSlotIds", "askedQuestions", "probe", "debug"
]);
const MAX_STUDENT_INPUT_CHARS = 2000;
const MAX_HISTORY_ITEMS = 8;
const MAX_ASKED_ITEMS = 100;
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

function requestHeader(req, name) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function validateString(value, maxChars, errorCode) {
  if (value !== undefined && (typeof value !== "string" || value.length > maxChars)) throw new Error(errorCode);
}

function validateStringList(value, maxItems, maxChars, errorCode) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > maxItems || value.some((item) => typeof item !== "string" || item.length > maxChars)) {
    throw new Error(errorCode);
  }
}

function validatePatientAgentRequest(req, body) {
  const contentType = requestHeader(req, "content-type").split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") throw new Error("content_type_not_supported");
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_json_body");
  if (Object.keys(body).some((field) => !PUBLIC_REQUEST_FIELDS.has(field))) throw new Error("unexpected_request_field");
  if (body.agentId !== undefined && body.agentId !== PUBLIC_AGENT_ID) throw new Error("agent_not_allowed");
  if (body.stage !== undefined && body.stage !== "history") throw new Error("stage_not_allowed");
  if (body.language !== undefined && body.language !== "zh" && body.language !== "en") throw new Error("invalid_language");
  if (body.probe !== undefined && typeof body.probe !== "boolean") throw new Error("invalid_probe");
  if (body.debug !== undefined && typeof body.debug !== "boolean") throw new Error("invalid_debug");
  validateString(body.caseId, 64, "invalid_case_id");
  validateString(body.attemptId, 200, "invalid_attempt_id");
  validateString(body.sessionId, 2048, "invalid_session_id");
  validateString(body.sessionMode, 32, "invalid_session_mode");
  validateString(body.mode, 32, "invalid_agent_mode");
  validateString(body.studentInput, MAX_STUDENT_INPUT_CHARS, "student_input_too_long");
  if (body.conversationHistory !== undefined) {
    if (!Array.isArray(body.conversationHistory) || body.conversationHistory.length > MAX_HISTORY_ITEMS) throw new Error("conversation_history_invalid");
    for (const item of body.conversationHistory) {
      if (!item || typeof item !== "object" || Array.isArray(item)
        || Object.keys(item).some((field) => field !== "role" && field !== "text")
        || (item.role !== "student" && item.role !== "patient")
        || typeof item.text !== "string" || item.text.length > MAX_STUDENT_INPUT_CHARS) {
        throw new Error("conversation_history_invalid");
      }
    }
  }
  validateStringList(body.askedSlotIds, MAX_ASKED_ITEMS, 100, "asked_slots_invalid");
  validateStringList(body.askedQuestions, MAX_ASKED_ITEMS, MAX_STUDENT_INPUT_CHARS, "asked_questions_invalid");
}

async function buildAgentResponse(body, agentId, caseData, startedAt) {
  if (agentId === "standardized_patient") {
    if (body.probe) {
      const probe = await probePatientProvider();
      const publicProbe = { ...probe };
      delete publicProbe.providerDurationMs;
      delete publicProbe.providerFirstTokenMs;
      return {
        statusCode: 200,
        timings: { app: Date.now() - startedAt, provider: probe.providerDurationMs, firsttoken: probe.providerFirstTokenMs },
        payload: { agentId, replyText: "", matchedSlotIds: [], matchedFacts: [], safetyFlags: [], answerSource: probe.isFallback ? "rule" : probe.provider, confidence: 1, ...publicProbe }
      };
    }
    const patient = await generatePatientAnswer({
      sessionId: body.sessionId,
      caseId: body.caseId,
      studentInput: body.studentInput,
      conversationHistory: body.conversationHistory || [],
      language: body.language || "zh"
    });
    const generationSource = patient.isSafeMock
      ? "safe_mock"
      : patient.isFallback
        ? (safetyBoundaryFallback(patient) ? "safety_boundary" : "rule_fallback")
        : patient.cacheHit ? "ai_cache" : "live_ai";
    return {
      statusCode: 200,
      timings: { app: Date.now() - startedAt, provider: patient.providerDurationMs, firsttoken: patient.providerFirstTokenMs },
      payload: {
        agentId,
        replyText: patient.replyText,
        usedModel: patient.model,
        provider: patient.provider,
        visibleToStudent: true,
        revealedDataKeys: [],
        blockedDataKeys: blockedTeacherKeys,
        safetyFlags: patient.safetyFlags || [],
        isFallback: Boolean(patient.isFallback),
        isSafeMock: Boolean(patient.isSafeMock),
        generationSource,
        matchedSlotIds: patient.matchedSlotIds || [],
        matchedFacts: patient.matchedFacts || [],
        answerSource: patient.answerSource || (patient.isFallback ? "rule" : patient.provider),
        factSource: patient.answerSource || "unknown",
        confidence: patient.confidence ?? (patient.isFallback ? 0.85 : 0.95),
        fallbackReason: patient.fallbackReason || (patient.isFallback ? "ai_unavailable_or_rule_mode" : ""),
        ...(body.debug ? { debug: { responseAccepted: Boolean(patient.filter?.ok), rewriteTriggered: Boolean(patient.rewriteTriggered), cacheHit: Boolean(patient.cacheHit), deploymentCommit: process.env.VERCEL_GIT_COMMIT_SHA || "local" } } : {})
      }
    };
  }

  const config = getProviderConfig();
  if (!config.enabled || body.mode === "rule") {
    return {
      statusCode: 200,
      timings: { app: Date.now() - startedAt },
      payload: {
        agentId,
        replyText: fallbackFor(agentId, body.language),
        usedModel: config.model,
        provider: config.provider,
        visibleToStudent: true,
        revealedDataKeys: [],
        blockedDataKeys: blockedTeacherKeys,
        safetyFlags: ["llm_unavailable_fallback"],
        isFallback: true
      }
    };
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
        unlockedData: {},
        studentActions: body.studentActions || [],
        askedQuestions: body.askedQuestions || []
      },
      maxTokens: Math.min(config.maxTokens || 300, 500)
    });
    return {
      statusCode: 200,
      timings: { app: Date.now() - startedAt, provider: llm.durationMs, firsttoken: llm.firstTokenMs },
      payload: {
        agentId,
        replyText: llm.text,
        usedModel: llm.model,
        provider: llm.provider,
        visibleToStudent: true,
        revealedDataKeys: [],
        blockedDataKeys: blockedTeacherKeys,
        safetyFlags: [],
        isFallback: false,
        isSafeMock: Boolean(llm.safeMock),
        generationSource: llm.safeMock ? "safe_mock" : "live_ai"
      }
    };
  } catch {
    return {
      statusCode: 200,
      timings: { app: Date.now() - startedAt },
      payload: {
        agentId,
        replyText: fallbackFor(agentId, body.language),
        usedModel: config.model,
        provider: config.provider,
        visibleToStudent: true,
        revealedDataKeys: [],
        blockedDataKeys: blockedTeacherKeys,
        safetyFlags: ["llm_error_fallback"],
        isFallback: true
      }
    };
  }
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
    const body = parseJsonBody(req, 64 * 1024);
    validatePatientAgentRequest(req, body);
    const agentId = PUBLIC_AGENT_ID;
    const caseData = cases.find((item) => String(item.id).toLowerCase() === String(body.caseId).toLowerCase());
    if (!caseData) return res.status(400).json({ error: "unknown_case" });
    if (!body.probe && !String(body.studentInput || "").trim()) return res.status(400).json({ error: "studentInput is required" });
    if (!body.sessionId || !body.attemptId) return res.status(401).json({ error: "session_capability_required" });
    verifySessionCapability(body.sessionId, {
      attemptId: body.attemptId,
      caseId: caseData.id,
      language: body.language || "zh",
      mode: normalizeAttemptMode(body.sessionMode || body.mode)
    });

    const rawIdempotencyKey = requestHeader(req, "x-idempotency-key");
    if (rawIdempotencyKey.length > 200) throw new Error("idempotency_key_too_long");
    const idempotencyKey = rawIdempotencyKey;
    const stored = await executeIdempotentAgentRequest({ sessionId: body.sessionId, idempotencyKey, body, clientId: clientKey(req) }, () => buildAgentResponse(body, agentId, caseData, startedAt));
    setServerTiming(res, stored.timings || { app: Date.now() - startedAt });
    return res.status(stored.statusCode || 200).json(stored.payload);
  } catch (error) {
    const code = error instanceof Error ? error.message : "agent_api_failed";
    if (code === "agent_concurrency_limited") res.setHeader("Retry-After", "1");
    if (code === "agent_quota_exceeded") res.setHeader("Retry-After", "60");
    const status = /request_body_too_large/.test(code) ? 413
      : /content_type_not_supported/.test(code) ? 415
        : /student_input_too_long|conversation_history_invalid|asked_(?:slots|questions)_invalid/.test(code) ? 422
      : /invalid_json_body|unexpected_request_field|invalid_(?:language|probe|debug|case_id|attempt_id|session_id|session_mode|agent_mode)|idempotency_key_too_long/.test(code) ? 400
        : /agent_not_allowed|stage_not_allowed/.test(code) ? 403
          : /agent_concurrency_limited/.test(code) ? 429
            : /agent_quota_exceeded/.test(code) ? 429
        : /session_.*(?:mismatch|required)|invalid_session|expired_session/.test(code) ? 401
      : /idempotency_key_required/.test(code) ? 400
        : /idempotency_key_reused/.test(code) ? 409
          : /agent_request_in_progress/.test(code) ? 425
            : /secret|store_unavailable/.test(code) ? 503 : 500;
    return res.status(status).json({ error: status === 500 ? "agent_api_failed" : code });
  }
};
