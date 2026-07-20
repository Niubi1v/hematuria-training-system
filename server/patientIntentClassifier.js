const crypto = require("node:crypto");
const { callLLM, getLLMProviderConfig } = require("./llmClient.runtime.js");
const { normalizeIntentQuestion, priorityIntentDefinitions } = require("../src/lib/patientIntentCatalog.js");

const INTENT_WHITELIST = Object.freeze(priorityIntentDefinitions.map((definition) => definition.key));
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

function classificationId(question, language) {
  return crypto.createHash("sha256").update(`${language}:${normalizeIntentQuestion(question)}`).digest("hex").slice(0, 20);
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
  if (keys.join(",") !== "confidence,intent,needsClarification") return null;
  if (!INTENT_SET.has(parsed.intent)) return null;
  if (typeof parsed.confidence !== "number" || !Number.isFinite(parsed.confidence) || parsed.confidence < 0 || parsed.confidence > 1) return null;
  if (typeof parsed.needsClarification !== "boolean") return null;
  return { intent: parsed.intent, confidence: parsed.confidence, needsClarification: parsed.needsClarification };
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

async function classifyPatientIntent({ question, language = "zh", callProvider = callLLM, enabled = semanticClassifierEnabled() }) {
  if (!enabled || !mightAskCanonicalFact(question, language)) return { accepted: false, reason: enabled ? "not_a_canonical_fact_question" : "classifier_disabled", providerCalls: 0 };
  const key = `${language}:${normalizeIntentQuestion(question)}`;
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
        systemPrompt: `Classify one patient question into exactly one allowed canonical intent. Return strict JSON with exactly the keys intent, confidence, needsClarification. Never answer the question and never infer a patient fact. Allowed intents: ${INTENT_WHITELIST.join(", ")}. If ambiguous, set needsClarification true and keep confidence below ${ACCEPTANCE_THRESHOLD}.`,
        userPayload: {
          classificationId: classificationId(question, language),
          language,
          question: String(question),
          allowedIntents: INTENT_WHITELIST
        },
        temperature: 0,
        maxTokens: 80,
        maxRetries: 0,
        timeoutMs: 2500
      });
      const parsed = parseClassifierResponse(result?.text);
      const accepted = Boolean(parsed && !parsed.needsClarification && parsed.confidence >= ACCEPTANCE_THRESHOLD);
      const value = accepted
        ? { accepted: true, intent: parsed.intent, confidence: parsed.confidence, needsClarification: false, reason: "semantic_whitelist_match", providerCalls: 1 }
        : { accepted: false, confidence: parsed?.confidence || 0, needsClarification: parsed?.needsClarification !== false, reason: parsed ? "semantic_low_confidence" : "semantic_response_invalid", providerCalls: 1 };
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
