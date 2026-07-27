const crypto = require("node:crypto");
const { callLLM, getLLMProviderConfig } = require("./llmClient.runtime.js");
const { normalizeIntentQuestion, patientFactOntology } = require("../src/lib/patientIntentCatalog.js");

const INTENT_WHITELIST = Object.freeze(patientFactOntology
  .filter((definition) => definition.classifierEligible)
  .map((definition) => definition.key));
const INTENT_SET = new Set(INTENT_WHITELIST);
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX = 500;
const WINDOW_MS = 60 * 1000;
const WINDOW_LIMIT = 30;
const ACCEPTANCE_THRESHOLD = 0.92;
const cache = globalThis.__hematuriaPatientIntentClassifierCache || new Map();
const inflight = globalThis.__hematuriaPatientIntentClassifierInflight || new Map();
const requestTimes = globalThis.__hematuriaPatientIntentClassifierRequests || [];
globalThis.__hematuriaPatientIntentClassifierCache = cache;
globalThis.__hematuriaPatientIntentClassifierInflight = inflight;
globalThis.__hematuriaPatientIntentClassifierRequests = requestTimes;

function semanticClassifierEnabled(env = process.env) {
  const config = getLLMProviderConfig();
  return env.PATIENT_SEMANTIC_CLASSIFIER_ENABLED === "true"
    && Boolean(config.enabled && config.apiKey && config.baseUrl && config.model);
}

function mightAskCanonicalFact(question, language = "zh") {
  const normalized = normalizeIntentQuestion(question);
  if (!normalized || normalized.length > 240) return false;
  if (language === "en") {
    return /\b(?:urine|urination|urinate|pee|passing urine|blood|red|pain|hurt|burn|fever|temperature|swelling|stream|flow|bladder|night|clot|flank|back)\b/i.test(normalized);
  }
  return /尿|小便|排尿|撒尿|解手|血|红|痛|疼|烧|发热|发烧|肿|腰|血块|夜里|起夜|憋不住/.test(normalized);
}

function classificationId(question, language, recentUserQuestions = []) {
  return crypto.createHash("sha256")
    .update(`${language}:${normalizeIntentQuestion(question)}:${recentUserQuestions.map(normalizeIntentQuestion).join("|")}`)
    .digest("hex")
    .slice(0, 20);
}

function parseClassifierResponse(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text || ""));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const keys = Object.keys(parsed).sort();
  if (keys.join(",") !== "clauses,contextReference,intent,topic") return null;
  if (parsed.intent !== null && !INTENT_SET.has(parsed.intent)) return null;
  if (parsed.topic !== null && !INTENT_SET.has(parsed.topic)) return null;
  if (!Array.isArray(parsed.clauses) || !parsed.clauses.length || parsed.clauses.length > 8) return null;
  const clauses = [];
  for (const clause of parsed.clauses) {
    if (!clause || typeof clause !== "object" || Array.isArray(clause)) return null;
    if (Object.keys(clause).sort().join(",") !== "confidence,intent,needsClarification,text") return null;
    if (typeof clause.text !== "string" || !clause.text.trim() || clause.text.length > 240) return null;
    if (clause.intent !== null && !INTENT_SET.has(clause.intent)) return null;
    if (
      typeof clause.confidence !== "number"
      || !Number.isFinite(clause.confidence)
      || clause.confidence < 0
      || clause.confidence > 1
      || typeof clause.needsClarification !== "boolean"
    ) return null;
    clauses.push({
      text: clause.text.trim(),
      intent: clause.intent,
      confidence: clause.confidence,
      needsClarification: clause.needsClarification
    });
  }
  if (!parsed.contextReference || typeof parsed.contextReference !== "object" || Array.isArray(parsed.contextReference)) return null;
  if (Object.keys(parsed.contextReference).sort().join(",") !== "inherited,sourceIntent") return null;
  if (typeof parsed.contextReference.inherited !== "boolean") return null;
  if (parsed.contextReference.sourceIntent !== null && !INTENT_SET.has(parsed.contextReference.sourceIntent)) return null;
  return {
    intent: parsed.intent,
    topic: parsed.topic,
    clauses,
    contextReference: {
      inherited: parsed.contextReference.inherited,
      sourceIntent: parsed.contextReference.sourceIntent
    }
  };
}

function prune(now = Date.now()) {
  for (const [key, entry] of cache.entries()) {
    if (!entry || entry.expiresAt <= now) cache.delete(key);
  }
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  while (requestTimes.length && requestTimes[0] <= now - WINDOW_MS) requestTimes.shift();
}

function resetPatientIntentClassifierState() {
  cache.clear();
  inflight.clear();
  requestTimes.splice(0, requestTimes.length);
}

async function classifyPatientIntent({
  question,
  language = "zh",
  conversationHistory = [],
  callProvider = callLLM,
  enabled = semanticClassifierEnabled()
}) {
  const recentUserQuestions = (Array.isArray(conversationHistory) ? conversationHistory : [])
    .filter((entry) => ["student", "user"].includes(String(entry?.role || "").toLowerCase()))
    .slice(-6)
    .map((entry) => String(entry?.text || ""))
    .filter(Boolean);
  const contextualEllipsis = recentUserQuestions.length > 0 && (
    language === "en"
      ? /^(?:what about that|how long|when did it start|did you have that before|does that hurt)\??$/i.test(String(question).trim())
      : /^(?:那)?(?:多少天|多久了|疼吗|以前有过吗|从什么时候开始|一直这样吗)[？?]?$/.test(String(question).trim())
  );
  if (!enabled || (!mightAskCanonicalFact(question, language) && !contextualEllipsis)) {
    return {
      accepted: false,
      reason: enabled ? "not_a_canonical_fact_question" : "classifier_disabled",
      providerCalls: 0
    };
  }
  const key = `${language}:${normalizeIntentQuestion(question)}:${recentUserQuestions.map(normalizeIntentQuestion).join("|")}`;
  const now = Date.now();
  prune(now);
  const cached = cache.get(key);
  if (cached) return { ...cached.value, cacheHit: true, providerCalls: 0 };
  if (inflight.has(key)) return inflight.get(key);
  if (requestTimes.length >= WINDOW_LIMIT) return { accepted: false, reason: "classifier_rate_limited", providerCalls: 0 };

  const task = (async () => {
    requestTimes.push(Date.now());
    try {
      const result = await callProvider({
        systemPrompt: `Classify a patient question without answering it. Return strict JSON with exactly the top-level keys intent, topic, clauses, contextReference. intent and topic must be an allowed intent or null. clauses must preserve every clause in source order and each item must have exactly text, intent, confidence, needsClarification. contextReference must have exactly inherited and sourceIntent. Never generate, infer, or modify patient facts, diagnoses, scores, or final answers. Allowed intents: ${INTENT_WHITELIST.join(", ")}. If any clause is ambiguous, use a null intent or needsClarification true with confidence below ${ACCEPTANCE_THRESHOLD}.`,
        userPayload: {
          classificationId: classificationId(question, language, recentUserQuestions),
          language,
          question: String(question),
          recentUserQuestions,
          allowedIntents: INTENT_WHITELIST,
          outputContract: {
            intent: "allowed intent or null",
            topic: "allowed intent or null",
            clauses: [{ text: "source clause", intent: "allowed intent or null", confidence: "0..1", needsClarification: "boolean" }],
            contextReference: { inherited: "boolean", sourceIntent: "allowed intent or null" }
          }
        },
        maxTokens: 300,
        maxRetries: 0,
        timeoutMs: 8000,
        thinkingMode: "enabled",
        reasoningEffort: "high",
        responseFormat: { type: "json_object" }
      });
      const parsed = parseClassifierResponse(result?.text);
      const acceptedClauses = parsed?.clauses.filter(
        (clause) => clause.intent && !clause.needsClarification && clause.confidence >= ACCEPTANCE_THRESHOLD
      ) || [];
      const accepted = Boolean(
        parsed
        && acceptedClauses.length === parsed.clauses.length
        && acceptedClauses.length > 0
      );
      const confidence = acceptedClauses.length
        ? Math.min(...acceptedClauses.map((clause) => clause.confidence))
        : Math.max(0, ...(parsed?.clauses || []).map((clause) => clause.confidence));
      const value = accepted
        ? {
            accepted: true,
            intent: parsed.intent || acceptedClauses[0].intent,
            intents: [...new Set(acceptedClauses.map((clause) => clause.intent))],
            topic: parsed.topic,
            clauses: parsed.clauses,
            contextReference: parsed.contextReference,
            confidence,
            reason: "semantic_whitelist_match",
            providerCalls: 1
          }
        : {
            accepted: false,
            confidence,
            needsClarification: true,
            topic: parsed?.topic || null,
            clauses: parsed?.clauses || [],
            contextReference: parsed?.contextReference || null,
            reason: parsed ? "semantic_low_confidence" : "semantic_response_invalid",
            providerCalls: 1
          };
      cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
      prune();
      return value;
    } catch {
      return { accepted: false, reason: "semantic_provider_unavailable", providerCalls: 1 };
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, task);
  return task;
}

module.exports = {
  ACCEPTANCE_THRESHOLD,
  INTENT_WHITELIST,
  classifyPatientIntent,
  mightAskCanonicalFact,
  parseClassifierResponse,
  resetPatientIntentClassifierState,
  semanticClassifierEnabled
};
