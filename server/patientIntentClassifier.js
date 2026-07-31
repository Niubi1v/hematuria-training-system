const crypto = require("node:crypto");
const {
  callLLM,
  getLLMProviderConfig,
  isLocalProvider,
  providerCredentialsAvailable
} = require("./llmClient.runtime.js");
const { normalizeIntentQuestion, patientFactOntology } = require("../src/lib/patientIntentCatalog.js");

const CLASSIFIER_DEFINITIONS = Object.freeze(patientFactOntology
  .filter((definition) => definition.domain !== "safe_missing"));
const INTENT_WHITELIST = Object.freeze(CLASSIFIER_DEFINITIONS
  .map((definition) => definition.key));
const INTENT_SET = new Set(INTENT_WHITELIST);
const INTENT_TO_SLOT = new Map(
  CLASSIFIER_DEFINITIONS.map((definition) => [definition.key, definition.sourceSlotId || null])
);
const SLOT_WHITELIST = Object.freeze([...new Set(
  CLASSIFIER_DEFINITIONS.map((definition) => definition.sourceSlotId).filter(Boolean)
)]);
const SLOT_SET = new Set(SLOT_WHITELIST);
const CURRENT_ENTITY_WHITELIST = Object.freeze([...new Set([
  ...INTENT_WHITELIST,
  "hematuria",
  "health_check_finding",
  "urination",
  "pain",
  "infection_symptoms",
  "hypertension",
  "antihypertensive_medication",
  "medication",
  "smoking",
  "alcohol",
  "occupation",
  "past_medical_history",
  "family_history",
  "gynecologic_history"
])]);
const CURRENT_ENTITY_SET = new Set(CURRENT_ENTITY_WHITELIST);
const NATURALIZATION_STYLE_WHITELIST = Object.freeze([
  "direct",
  "contextual",
  "compound",
  "clarification"
]);
const NATURALIZATION_STYLE_SET = new Set(NATURALIZATION_STYLE_WHITELIST);
const PATIENT_METADATA_JSON_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "intent",
    "currentTopic",
    "currentEntity",
    "requestedSlot",
    "contextReference",
    "clauses",
    "naturalizationStyle"
  ],
  properties: {
    intent: { type: ["string", "null"], enum: [...INTENT_WHITELIST, null] },
    currentTopic: { type: ["string", "null"], enum: [...INTENT_WHITELIST, null] },
    currentEntity: { type: ["string", "null"], enum: [...CURRENT_ENTITY_WHITELIST, null] },
    requestedSlot: { type: ["string", "null"], enum: [...SLOT_WHITELIST, null] },
    contextReference: {
      type: "object",
      additionalProperties: false,
      required: ["inherited", "sourceIntent"],
      properties: {
        inherited: { type: "boolean" },
        sourceIntent: { type: ["string", "null"], enum: [...INTENT_WHITELIST, null] }
      }
    },
    clauses: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["intent", "requestedSlot"],
        properties: {
          intent: { type: ["string", "null"], enum: [...INTENT_WHITELIST, null] },
          requestedSlot: { type: ["string", "null"], enum: [...SLOT_WHITELIST, null] }
        }
      }
    },
    naturalizationStyle: { type: "string", enum: NATURALIZATION_STYLE_WHITELIST }
  }
});
const PATIENT_METADATA_RESPONSE_FORMAT = Object.freeze({
  type: "json_schema",
  json_schema: {
    name: "patient_request_metadata",
    strict: true,
    schema: PATIENT_METADATA_JSON_SCHEMA
  }
});
const ACCEPTANCE_THRESHOLD = 0.92;
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX = 500;
const WINDOW_MS = 60 * 1000;
const WINDOW_LIMIT = 30;
const cache = globalThis.__hematuriaPatientIntentClassifierCache || new Map();
const inflight = globalThis.__hematuriaPatientIntentClassifierInflight || new Map();
const requestTimes = globalThis.__hematuriaPatientIntentClassifierRequests || [];
globalThis.__hematuriaPatientIntentClassifierCache = cache;
globalThis.__hematuriaPatientIntentClassifierInflight = inflight;
globalThis.__hematuriaPatientIntentClassifierRequests = requestTimes;

function patientThinkingConfig(env = process.env) {
  if (isLocalProvider(env.LLM_PROVIDER)) {
    return { mode: "disabled", thinkingMode: "disabled", reasoningEffort: undefined };
  }
  const requested = String(env.PATIENT_DEEPSEEK_THINKING || "disabled").toLowerCase();
  const mode = ["disabled", "high", "max"].includes(requested) ? requested : "disabled";
  return mode === "disabled"
    ? { mode, thinkingMode: "disabled", reasoningEffort: undefined }
    : { mode, thinkingMode: "enabled", reasoningEffort: mode };
}

function semanticClassifierEnabled(env = process.env) {
  const config = getLLMProviderConfig(env);
  const explicitlyEnabled = env.PATIENT_SEMANTIC_CLASSIFIER_ENABLED === "true";
  const localDefaultEnabled = isLocalProvider(config.provider)
    && env.PATIENT_SEMANTIC_CLASSIFIER_ENABLED !== "false";
  return (explicitlyEnabled || localDefaultEnabled)
    && Boolean(
      config.enabled
      && providerCredentialsAvailable(config)
      && config.baseUrl
      && config.model
    );
}

function mightAskCanonicalFact(question, language = "zh") {
  const normalized = normalizeIntentQuestion(question);
  if (!normalized || normalized.length > 240) return false;
  if (language === "en") {
    return /\b(?:urine|urination|urinate|pee|passing urine|blood|red|pain|hurt|burn|fever|temperature|swelling|stream|flow|bladder|night|clot|flank|back|medicine|medication|drug|history|disease|smoke|alcohol|drink)\b/i.test(normalized);
  }
  return /尿|小便|排尿|撒尿|解手|血|红|痛|疼|烧|发热|发烧|肿|腰|血块|夜里|起夜|憋不住|药|病|既往|以前|抽烟|吸烟|喝酒|饮酒/.test(normalized);
}

function classificationId(question, language, recentUserQuestions = []) {
  return crypto.createHash("sha256")
    .update(`${language}:${normalizeIntentQuestion(question)}:${recentUserQuestions.map(normalizeIntentQuestion).join("|")}`)
    .digest("hex")
    .slice(0, 20);
}

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value).sort().join(",") === [...expectedKeys].sort().join(",");
}

function parseClassifierResponse(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text || ""));
  } catch {
    return null;
  }
  if (!hasExactKeys(parsed, PATIENT_METADATA_JSON_SCHEMA.required)) return null;
  if (parsed.intent !== null && !INTENT_SET.has(parsed.intent)) return null;
  if (parsed.currentTopic !== null && !INTENT_SET.has(parsed.currentTopic)) return null;
  if (parsed.currentEntity !== null && !CURRENT_ENTITY_SET.has(parsed.currentEntity)) return null;
  if (parsed.requestedSlot !== null && !SLOT_SET.has(parsed.requestedSlot)) return null;
  if (!NATURALIZATION_STYLE_SET.has(parsed.naturalizationStyle)) return null;
  const expectedRequestedSlot = parsed.intent === null ? null : INTENT_TO_SLOT.get(parsed.intent);
  if (parsed.requestedSlot !== expectedRequestedSlot) return null;
  if (!Array.isArray(parsed.clauses) || !parsed.clauses.length || parsed.clauses.length > 8) return null;
  const clauses = [];
  const seenIntents = new Set();
  for (const clause of parsed.clauses) {
    if (!hasExactKeys(clause, ["intent", "requestedSlot"])) return null;
    if (clause.intent !== null && !INTENT_SET.has(clause.intent)) return null;
    const expectedSlot = clause.intent === null ? null : INTENT_TO_SLOT.get(clause.intent);
    if (clause.requestedSlot !== expectedSlot) return null;
    if (clause.intent && seenIntents.has(clause.intent)) return null;
    if (clause.intent) seenIntents.add(clause.intent);
    clauses.push({
      intent: clause.intent,
      requestedSlot: clause.requestedSlot
    });
  }
  const firstResolvedIntent = clauses.find((clause) => clause.intent)?.intent || null;
  if (parsed.intent !== firstResolvedIntent) return null;
  if (!hasExactKeys(parsed.contextReference, ["inherited", "sourceIntent"])) return null;
  if (typeof parsed.contextReference.inherited !== "boolean") return null;
  if (parsed.contextReference.sourceIntent !== null && !INTENT_SET.has(parsed.contextReference.sourceIntent)) return null;
  if (parsed.contextReference.inherited !== Boolean(parsed.contextReference.sourceIntent)) return null;
  return {
    intent: parsed.intent,
    currentTopic: parsed.currentTopic,
    currentEntity: parsed.currentEntity,
    requestedSlot: parsed.requestedSlot,
    clauses,
    contextReference: {
      inherited: parsed.contextReference.inherited,
      sourceIntent: parsed.contextReference.sourceIntent
    },
    naturalizationStyle: parsed.naturalizationStyle
  };
}

function parseLegacyClassifierResponse(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text || ""));
  } catch {
    return null;
  }
  if (!hasExactKeys(parsed, ["intent", "topic", "clauses", "contextReference"])) return null;
  if (parsed.intent !== null && !INTENT_SET.has(parsed.intent)) return null;
  if (parsed.topic !== null && !INTENT_SET.has(parsed.topic)) return null;
  if (!Array.isArray(parsed.clauses) || !parsed.clauses.length || parsed.clauses.length > 8) return null;
  const clauses = [];
  for (const clause of parsed.clauses) {
    if (!hasExactKeys(clause, ["text", "intent", "requestedSlot", "confidence", "needsClarification"])) {
      return null;
    }
    if (typeof clause.text !== "string" || !clause.text.trim() || clause.text.length > 240) return null;
    if (clause.intent !== null && !INTENT_SET.has(clause.intent)) return null;
    const expectedSlot = clause.intent === null ? null : INTENT_TO_SLOT.get(clause.intent);
    if (clause.requestedSlot !== expectedSlot) return null;
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
      requestedSlot: clause.requestedSlot,
      confidence: clause.confidence,
      needsClarification: clause.needsClarification
    });
  }
  if (!hasExactKeys(parsed.contextReference, ["inherited", "sourceIntent"])) return null;
  if (typeof parsed.contextReference.inherited !== "boolean") return null;
  if (parsed.contextReference.sourceIntent !== null && !INTENT_SET.has(parsed.contextReference.sourceIntent)) {
    return null;
  }
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

function governedMetadataResponseFormat(governedCandidates, requiredContextReference) {
  const requestedSlots = [...new Set(
    governedCandidates.map((intent) => INTENT_TO_SLOT.get(intent)).filter(Boolean)
  )];
  const schema = {
    ...PATIENT_METADATA_JSON_SCHEMA,
    properties: {
      ...PATIENT_METADATA_JSON_SCHEMA.properties,
      intent: { type: ["string", "null"], enum: [...governedCandidates, null] },
      currentTopic: { type: ["string", "null"], enum: [...governedCandidates, null] },
      currentEntity: { type: ["string", "null"], enum: [...governedCandidates, null] },
      requestedSlot: { type: ["string", "null"], enum: [...requestedSlots, null] },
      contextReference: {
        type: "object",
        additionalProperties: false,
        required: ["inherited", "sourceIntent"],
        properties: {
          inherited: { type: "boolean", enum: [requiredContextReference.inherited] },
          sourceIntent: {
            type: ["string", "null"],
            enum: [requiredContextReference.sourceIntent]
          }
        }
      },
      clauses: {
        ...PATIENT_METADATA_JSON_SCHEMA.properties.clauses,
        items: {
          ...PATIENT_METADATA_JSON_SCHEMA.properties.clauses.items,
          properties: {
            intent: { type: ["string", "null"], enum: [...governedCandidates, null] },
            requestedSlot: { type: ["string", "null"], enum: [...requestedSlots, null] }
          }
        }
      }
    }
  };
  return {
    type: "json_schema",
    json_schema: {
      name: "patient_request_metadata",
      strict: true,
      schema
    }
  };
}

function classifierResponseFormat(
  config = getLLMProviderConfig(),
  governedCandidates = [],
  requiredContextReference = { inherited: false, sourceIntent: null }
) {
  if (!isLocalProvider(config.provider)) return { type: "json_object" };
  return governedCandidates.length
    ? governedMetadataResponseFormat(governedCandidates, requiredContextReference)
    : PATIENT_METADATA_RESPONSE_FORMAT;
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
  conversationState = null,
  governedIntentCandidates = [],
  callProvider = callLLM,
  enabled = semanticClassifierEnabled(),
  forceMetadata = false
}) {
  const providerConfig = getLLMProviderConfig();
  const localStructuredMode = isLocalProvider(providerConfig.provider);
  const recentUserQuestions = (Array.isArray(conversationHistory) ? conversationHistory : [])
    .filter((entry) => ["student", "user"].includes(String(entry?.role || "").toLowerCase()))
    .slice(-6)
    .map((entry) => String(entry?.text || "").slice(0, 240))
    .filter(Boolean);
  const stateTopic = String(conversationState?.currentTopic || "");
  const stateEntity = String(conversationState?.currentEntity || "");
  const stateSlot = String(conversationState?.requestedSlot || "");
  const stateLastIntent = String(conversationState?.lastResolvedFact?.intent || "");
  const safeConversationState = conversationState && typeof conversationState === "object"
    ? {
        currentTopic: INTENT_SET.has(stateTopic) ? stateTopic : null,
        currentEntity: CURRENT_ENTITY_SET.has(stateEntity) ? stateEntity : null,
        requestedSlot: SLOT_SET.has(stateSlot) ? stateSlot : null,
        lastResolvedFact: INTENT_SET.has(stateLastIntent) ? stateLastIntent : null
      }
    : null;
  const legacyConversationState = conversationState && typeof conversationState === "object"
    ? {
        currentTopic: String(conversationState.currentTopic || "").slice(0, 80),
        currentEntity: String(conversationState.currentEntity || "").slice(0, 80),
        requestedSlot: String(conversationState.requestedSlot || "").slice(0, 80),
        lastResolvedFact: String(conversationState.lastResolvedFact?.intent || "").slice(0, 80)
      }
    : null;
  const safeGovernedCandidates = [...new Set(
    (Array.isArray(governedIntentCandidates) ? governedIntentCandidates : [])
      .map((intent) => String(intent || ""))
      .filter((intent) => INTENT_SET.has(intent))
  )].slice(0, 8);
  const contextualEllipsis = (recentUserQuestions.length > 0 || Boolean(safeConversationState?.currentTopic)) && (
    language === "en"
      ? /^(?:what about that|how long|when did it start|did you have that before|does that hurt)\??$/i.test(String(question).trim())
      : /^(?:那)?(?:多少天|多久了|疼吗|以前有过吗|从什么时候开始|一直这样吗)[？?]?$/.test(String(question).trim())
  );
  const expectedInheritedIntent = safeConversationState?.lastResolvedFact
    || safeConversationState?.currentTopic
    || null;
  const requiredContextReference = safeGovernedCandidates.length > 0
    && contextualEllipsis
    && expectedInheritedIntent
    ? { inherited: true, sourceIntent: expectedInheritedIntent }
    : { inherited: false, sourceIntent: null };
  if (!enabled || (!forceMetadata && !mightAskCanonicalFact(question, language) && !contextualEllipsis)) {
    return {
      accepted: false,
      reason: enabled ? "not_a_canonical_fact_question" : "classifier_disabled",
      providerCalls: 0
    };
  }
  const key = crypto.createHash("sha256")
    .update(`${providerConfig.provider}:${providerConfig.model}:${providerConfig.baseUrl}:${localStructuredMode ? "local-metadata-v1" : "legacy-semantic"}:${language}:${normalizeIntentQuestion(question)}:${recentUserQuestions.map(normalizeIntentQuestion).join("|")}:${JSON.stringify(localStructuredMode ? safeConversationState : legacyConversationState)}:${safeGovernedCandidates.join("|")}`)
    .digest("hex");
  const now = Date.now();
  prune(now);
  const cached = cache.get(key);
  if (cached) return { ...cached.value, cacheHit: true, providerCalls: 0 };
  if (inflight.has(key)) return inflight.get(key);
  if (requestTimes.length >= WINDOW_LIMIT) return { accepted: false, reason: "classifier_rate_limited", providerCalls: 0 };

  const task = (async () => {
    requestTimes.push(Date.now());
    try {
      const thinking = patientThinkingConfig();
      const result = await callProvider(localStructuredMode
        ? {
            systemPrompt: `Classify request metadata only. Never answer the question and never generate or decide a patient fact, medicine name, dose, examination, result, diagnosis, treatment, score, or final response. Return one JSON object that conforms exactly to the supplied schema: no markdown, reasoning, or extra keys. Each clause must contain only intent and requestedSlot in source order. requestedSlot must be the ontology slot mapped to intent, or null when intent is null. intent must equal the first non-null clause intent. currentTopic and currentEntity are routing metadata only. contextReference must exactly match requiredContextReference. naturalizationStyle is only a style enum and never answer text. If governedCandidateMappings is non-empty, copy every intent and requestedSlot from those mappings exactly once and use no other values; they are routing candidates, not facts. Set currentTopic and currentEntity to the first mapped intent. If governedCandidateMappings is empty and any clause is ambiguous, use null intent and requestedSlot for that clause. Allowed intent-to-slot mappings: ${CLASSIFIER_DEFINITIONS.map((definition) => `${definition.key}:${definition.sourceSlotId || "null"}`).join(", ")}.`,
            userPayload: {
              classificationId: classificationId(question, language, recentUserQuestions),
              language,
              question: String(question),
              recentUserQuestions,
              conversationState: safeConversationState,
              governedIntentCandidates: safeGovernedCandidates,
              governedCandidateMappings: safeGovernedCandidates.map((intent) => ({
                intent,
                requestedSlot: INTENT_TO_SLOT.get(intent) || null
              })),
              requiredContextReference,
              allowedIntents: safeGovernedCandidates.length ? safeGovernedCandidates : INTENT_WHITELIST,
              allowedEntities: safeGovernedCandidates.length ? safeGovernedCandidates : CURRENT_ENTITY_WHITELIST,
              allowedNaturalizationStyles: NATURALIZATION_STYLE_WHITELIST,
              schemaVersion: "patient-request-metadata-v1"
            },
            temperature: 0,
            maxTokens: 320,
            maxRetries: 0,
            timeoutMs: Math.max(
              1000,
              Math.min(
                Number(process.env.PATIENT_LOCAL_TIMEOUT_MS || process.env.LLM_REQUEST_TIMEOUT_MS) || 60000,
                90000
              )
            ),
            thinkingMode: thinking.thinkingMode,
            reasoningEffort: thinking.reasoningEffort,
            responseFormat: classifierResponseFormat(
              providerConfig,
              safeGovernedCandidates,
              requiredContextReference
            )
          }
        : {
            systemPrompt: `Classify a patient question without answering it. Return strict JSON with exactly the top-level keys intent, topic, clauses, contextReference. intent and topic must be an allowed intent or null. clauses must preserve every clause in source order and each item must have exactly text, intent, requestedSlot, confidence, needsClarification. requestedSlot must be the ontology slot mapped to the selected intent, or null when intent is null. contextReference must have exactly inherited and sourceIntent. Never generate, infer, or modify patient facts, diagnoses, scores, or final answers. Allowed intent-to-slot mappings: ${CLASSIFIER_DEFINITIONS.map((definition) => `${definition.key}:${definition.sourceSlotId || "null"}`).join(", ")}. If any clause is ambiguous, use a null intent and requestedSlot, or needsClarification true with confidence below ${ACCEPTANCE_THRESHOLD}.`,
            userPayload: {
              classificationId: classificationId(question, language, recentUserQuestions),
              language,
              question: String(question),
              recentUserQuestions,
              conversationState: legacyConversationState,
              allowedIntents: INTENT_WHITELIST,
              outputContract: {
                intent: "allowed intent or null",
                topic: "allowed intent or null",
                clauses: [{
                  text: "source clause",
                  intent: "allowed intent or null",
                  requestedSlot: "ontology slot or null",
                  confidence: "0..1",
                  needsClarification: "boolean"
                }],
                contextReference: { inherited: "boolean", sourceIntent: "allowed intent or null" }
              }
            },
            maxTokens: 300,
            maxRetries: 0,
            timeoutMs: Math.max(
              30000,
              Math.min(Number(process.env.PATIENT_DEEPSEEK_TIMEOUT_MS) || 30000, 90000)
            ),
            thinkingMode: thinking.thinkingMode,
            reasoningEffort: thinking.reasoningEffort,
            responseFormat: { type: "json_object" }
          });
      if (!localStructuredMode) {
        const parsed = parseLegacyClassifierResponse(result?.text);
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
              routingAuthorized: true,
              intent: parsed.intent || acceptedClauses[0].intent,
              intents: [...new Set(acceptedClauses.map((clause) => clause.intent))],
              topic: parsed.topic,
              clauses: parsed.clauses,
              contextReference: parsed.contextReference,
              providerHttpSuccess: true,
              thinkingMode: thinking.mode,
              provider: result?.provider || providerConfig.provider,
              model: result?.model || providerConfig.model,
              durationMs: Number(result?.durationMs || 0),
              confidence,
              reason: "semantic_whitelist_match",
              providerCalls: 1
            }
          : {
              accepted: false,
              routingAuthorized: false,
              confidence,
              needsClarification: true,
              topic: parsed?.topic || null,
              clauses: parsed?.clauses || [],
              contextReference: parsed?.contextReference || null,
              providerHttpSuccess: true,
              thinkingMode: thinking.mode,
              provider: result?.provider || providerConfig.provider,
              model: result?.model || providerConfig.model,
              durationMs: Number(result?.durationMs || 0),
              reason: parsed ? "semantic_low_confidence" : "semantic_response_invalid",
              providerCalls: 1
            };
        cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
        prune();
        return value;
      }
      const parsed = parseClassifierResponse(result?.text);
      const contextReferenceMatches = Boolean(
        parsed
        && parsed.contextReference.inherited === requiredContextReference.inherited
        && parsed.contextReference.sourceIntent === requiredContextReference.sourceIntent
      );
      const acceptedClauses = parsed?.clauses.filter((clause) => clause.intent) || [];
      const parsedIntentSet = [...new Set(acceptedClauses.map((clause) => clause.intent))].sort();
      const governedIntentSet = [...safeGovernedCandidates].sort();
      const governedCandidatesMatch = governedIntentSet.length === 0
        || (
          governedIntentSet.length === parsedIntentSet.length
          && governedIntentSet.every((intent, index) => intent === parsedIntentSet[index])
        );
      const accepted = Boolean(
        parsed
        && contextReferenceMatches
        && acceptedClauses.length === parsed.clauses.length
        && acceptedClauses.length > 0
        && governedCandidatesMatch
      );
      // A schema-valid local classification is routing metadata only. It has
      // no independent authority to unlock a patient fact; patientSession
      // applies it only when it exactly agrees with an already governed route.
      const confidence = 0;
      const value = accepted
        ? {
            accepted: true,
            routingAuthorized: false,
            intent: parsed.intent || acceptedClauses[0].intent,
            intents: [...new Set(acceptedClauses.map((clause) => clause.intent))],
            currentTopic: parsed.currentTopic,
            currentEntity: parsed.currentEntity,
            requestedSlot: parsed.requestedSlot,
            clauses: parsed.clauses,
            contextReference: parsed.contextReference,
            naturalizationStyle: parsed.naturalizationStyle,
            metadataValid: true,
            providerHttpSuccess: true,
            thinkingMode: thinking.mode,
            provider: result?.provider || providerConfig.provider,
            model: result?.model || providerConfig.model,
            durationMs: Number(result?.durationMs || 0),
            confidence,
            reason: "metadata_schema_valid_non_authoritative",
            providerCalls: 1
          }
        : {
            accepted: false,
            routingAuthorized: false,
            confidence,
            needsClarification: true,
            currentTopic: parsed?.currentTopic || null,
            currentEntity: parsed?.currentEntity || null,
            requestedSlot: parsed?.requestedSlot || null,
            clauses: parsed?.clauses || [],
            contextReference: parsed?.contextReference || null,
            naturalizationStyle: parsed?.naturalizationStyle || null,
            metadataValid: Boolean(parsed),
            providerHttpSuccess: true,
            thinkingMode: thinking.mode,
            provider: result?.provider || providerConfig.provider,
            model: result?.model || providerConfig.model,
            durationMs: Number(result?.durationMs || 0),
            reason: parsed && !contextReferenceMatches
              ? "local_context_reference_mismatch"
              : parsed && !governedCandidatesMatch
                ? "local_metadata_conflict_with_governed_candidates"
                : parsed ? "semantic_needs_clarification" : "semantic_response_invalid",
            providerCalls: 1
          };
      cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
      prune();
      return value;
    } catch (error) {
      const status = Number(error?.status || 0);
      const timedOut = error?.name === "AbortError" || /abort|timeout/i.test(String(error?.message || ""));
      return {
        accepted: false,
        reason: timedOut
          ? "semantic_provider_timeout"
          : status > 0 ? "semantic_provider_http_error" : "semantic_provider_unavailable",
        providerHttpSuccess: false,
        providerCalls: 1
      };
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, task);
  return task;
}

module.exports = {
  ACCEPTANCE_THRESHOLD,
  CURRENT_ENTITY_WHITELIST,
  INTENT_WHITELIST,
  NATURALIZATION_STYLE_WHITELIST,
  PATIENT_METADATA_JSON_SCHEMA,
  PATIENT_METADATA_RESPONSE_FORMAT,
  SLOT_WHITELIST,
  classifyPatientIntent,
  classifierResponseFormat,
  mightAskCanonicalFact,
  parseClassifierResponse,
  parseLegacyClassifierResponse,
  patientThinkingConfig,
  resetPatientIntentClassifierState,
  semanticClassifierEnabled
};
