"use strict";

const { FACT_STATES } = require("../src/lib/patientFactState.js");

const RESPONSE_ERROR_CATEGORIES = Object.freeze([
  "tangential",
  "oversharing",
  "role_breaking",
  "off_script",
  "wrong_unknown",
  "context_lost",
  "polarity_error"
]);

const knownFactStates = new Set([
  FACT_STATES.KNOWN_TRUE,
  FACT_STATES.KNOWN_FALSE,
  FACT_STATES.EXACT_VALUE,
  FACT_STATES.APPROXIMATE_VALUE
]);

const withheldFactStates = new Set([
  FACT_STATES.MISSING,
  FACT_STATES.NEEDS_REVIEW,
  FACT_STATES.MEDICAL_CONFLICT
]);

function compact(value) {
  return String(value || "").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function profileValue(profile, path) {
  const node = String(path || "").split(".").reduce((current, key) => current?.[key], profile);
  return typeof node?.value === "string" ? node.value : "";
}

function personaStyleFromProfile(profile, language = "zh") {
  const emotion = profileValue(profile, "patient_persona.emotion");
  const literacy = profileValue(profile, "patient_persona.health_literacy");
  const memory = profileValue(profile, "patient_persona.memory_reliability");
  const cooperation = profileValue(profile, "patient_persona.cooperation_style");
  return Object.freeze({
    tone: /担心|紧张|anxious|worried/i.test(emotion) ? "mildly_anxious_cooperative" : "calm_cooperative",
    languageLevel: /有限|plain|limited/i.test(literacy) ? "plain_language" : "everyday_language",
    responseLength: "concise",
    memoryClarity: /细节|detail|说不清|unclear/i.test(memory) ? "salient_symptoms_clear_details_limited" : "ordinary",
    cooperation: /问到|具体|asked|specific/i.test(cooperation) ? "answer_when_asked" : "cooperative",
    language: language === "en" ? "en" : "zh"
  });
}

function disclosureGranularity(plans) {
  const states = new Set(plans.map((plan) => String(plan?.factState || "")).filter(Boolean));
  if (!states.size) return "none";
  if (states.size > 1) return "mixed";
  const state = [...states][0];
  if (state === FACT_STATES.APPROXIMATE_VALUE) return "approximate";
  if (state === FACT_STATES.PARTIALLY_KNOWN) return "partial";
  if (withheldFactStates.has(state) || state === FACT_STATES.PATIENT_NOT_AWARE) return "unknown_or_withheld";
  return "exact_or_polar";
}

// Internal-only control context. It contains no raw case record and is never
// serialized by the patient API. Case Truth is the existing governed plan;
// Disclosure Policy decides how that plan may be released; Persona Style is
// deliberately fact-free and may alter wording only.
function createPatientControlContext({ result, runtimeProfile, language = "zh" }) {
  const plans = Array.isArray(result?.answerPlans) ? result.answerPlans : [];
  return Object.freeze({
    caseTruth: Object.freeze({
      plans,
      source: "existing_ontology_and_answer_planner"
    }),
    disclosurePolicy: Object.freeze({
      mode: "question_triggered",
      granularity: disclosureGranularity(plans),
      withheldPlanCount: plans.filter((plan) => withheldFactStates.has(plan?.factState)).length,
      patientKnowledgeLimited: plans.some((plan) => [FACT_STATES.PARTIALLY_KNOWN, FACT_STATES.PATIENT_NOT_AWARE].includes(plan?.factState))
    }),
    personaStyle: personaStyleFromProfile(runtimeProfile, language)
  });
}

function containsUnknownReply(text, language) {
  return language === "en"
    ? /\b(?:do not know|don't know|not sure|cannot recall|can't recall|no reliable information)\b/i.test(String(text || ""))
    : /(?:不清楚|不知道|不太确定|记不清|没有可靠的信息|说不清)/.test(String(text || ""));
}

function hasPolarityError(reply, plans, language) {
  const text = String(reply || "");
  return plans.some((plan) => {
    if (plan?.factState === FACT_STATES.KNOWN_TRUE) {
      return language === "en"
        ? /\b(?:no|not|never|do not|don't)\b/i.test(text) && !/\b(?:yes|i do|i have)\b/i.test(text)
        : /(?:没有|不是|不会|从不)/.test(text) && !/(?:有|是|会)/.test(text.replace(/没有|不是|不会/g, ""));
    }
    if (plan?.factState === FACT_STATES.KNOWN_FALSE) {
      return language === "en"
        ? /\b(?:yes|i do|i have)\b/i.test(text) && !/\b(?:no|not|never|do not|don't)\b/i.test(text)
        : /(?:^|[，。；])有/.test(text) && !/(?:没有|不是|不会)/.test(text);
    }
    return false;
  });
}

function classifyPatientResponseErrors({ result, contextResolution, language = "zh", filter, preservesAnswer = true }) {
  const errors = new Set();
  const plans = Array.isArray(result?.answerPlans) ? result.answerPlans : [];
  const reply = String(result?.replyText || "");
  const allowed = String(result?.allowedAnswer || plans.map((plan) => plan?.renderedAnswer || "").filter(Boolean).join("\n"));
  const normalizedReply = compact(reply);
  const normalizedAllowed = compact(allowed);
  const safetyFlags = Array.isArray(result?.safetyFlags) ? result.safetyFlags.map(String) : [];

  if ((filter?.hits || []).length || safetyFlags.some((flag) => /blocked_(?:diagnosis|report)|role/i.test(flag))) errors.add("role_breaking");
  if (filter?.tooLong || (normalizedAllowed && normalizedReply.length > normalizedAllowed.length * 2 + 40)) errors.add("oversharing");
  if ((plans.length && !preservesAnswer) || safetyFlags.some((flag) => /ai_response_blocked|deterministic_answer_blocked/.test(flag))) errors.add("off_script");
  if (plans.length && normalizedAllowed && !normalizedReply.includes(normalizedAllowed)
    && !plans.some((plan) => normalizedReply.includes(compact(plan?.directAnswer)))) errors.add("tangential");
  if (plans.some((plan) => knownFactStates.has(plan?.factState)) && containsUnknownReply(reply, language)) errors.add("wrong_unknown");
  if (contextResolution?.inherited === true && plans.length === 0) errors.add("context_lost");
  if (hasPolarityError(reply, plans, language)) errors.add("polarity_error");

  return RESPONSE_ERROR_CATEGORIES.filter((category) => errors.has(category));
}

module.exports = {
  RESPONSE_ERROR_CATEGORIES,
  classifyPatientResponseErrors,
  createPatientControlContext,
  personaStyleFromProfile
};
