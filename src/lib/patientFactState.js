const FACT_STATES = Object.freeze({
  KNOWN_TRUE: "known_true",
  KNOWN_FALSE: "known_false",
  EXACT_VALUE: "exact_value",
  APPROXIMATE_VALUE: "approximate_value",
  PARTIALLY_KNOWN: "partially_known",
  PATIENT_NOT_AWARE: "patient_not_aware",
  MISSING: "missing",
  NEEDS_REVIEW: "needs_review",
  MEDICAL_CONFLICT: "medical_conflict"
});

const UNKNOWN_REASON_CODES = Object.freeze({
  FACT_MISSING: "fact_missing",
  PARTIAL_FACT: "partial_fact",
  PATIENT_NOT_AWARE: "patient_not_aware",
  NEEDS_REVIEW: "needs_review",
  MEDICAL_CONFLICT: "medical_conflict",
  INTENT_AMBIGUOUS: "intent_ambiguous",
  CLASSIFIER_UNAVAILABLE: "classifier_unavailable"
});

const approximatePattern = /(?:大约|大概|约|余|多|左右|近|数(?:天|周|月|年)|几(?:天|周|月|年)|记不清.*哪一天|about|around|approximately|roughly|over|more than|nearly|almost|a few|several)/i;
const partialPattern = /(?:具体|细节|哪一天|几次|多少|记不全|说不清|部分|大致|具体不清|exact|detail|cannot recall all|not all|partly)/i;
const unawarePattern = /(?:没(?:有)?(?:特别)?(?:注意|留意)|未注意|没仔细看|没有数|没有量|记不太清|不详|not noticed|not sure|do not know|cannot recall|did not (?:look|notice|measure|count|pay)|have not (?:noticed|counted|kept|paid))/i;

function reasonCodeForState(state) {
  if (state === FACT_STATES.PATIENT_NOT_AWARE) return UNKNOWN_REASON_CODES.PATIENT_NOT_AWARE;
  if (state === FACT_STATES.MISSING) return UNKNOWN_REASON_CODES.FACT_MISSING;
  if (state === FACT_STATES.NEEDS_REVIEW) return UNKNOWN_REASON_CODES.NEEDS_REVIEW;
  if (state === FACT_STATES.MEDICAL_CONFLICT) return UNKNOWN_REASON_CODES.MEDICAL_CONFLICT;
  if (state === FACT_STATES.PARTIALLY_KNOWN) return UNKNOWN_REASON_CODES.PARTIAL_FACT;
  return null;
}

function factStateFromBoolean(value, unknownReason = "") {
  if (value === true) return FACT_STATES.KNOWN_TRUE;
  if (value === false) return FACT_STATES.KNOWN_FALSE;
  if (/review|pending|unsafe/i.test(unknownReason)) return FACT_STATES.NEEDS_REVIEW;
  if (/not_observed|not_aware|not noticed/i.test(unknownReason)) return FACT_STATES.PATIENT_NOT_AWARE;
  if (/ambiguous|partial/i.test(unknownReason)) return FACT_STATES.PARTIALLY_KNOWN;
  return FACT_STATES.MISSING;
}

function factStateFromText(value, options = {}) {
  const text = String(value || "").trim();
  if (options.medicalConflict) return FACT_STATES.MEDICAL_CONFLICT;
  if (options.needsReview) return FACT_STATES.NEEDS_REVIEW;
  if (!text) return FACT_STATES.MISSING;
  if (unawarePattern.test(text) && !approximatePattern.test(text)) return FACT_STATES.PATIENT_NOT_AWARE;
  if (approximatePattern.test(text)) return FACT_STATES.APPROXIMATE_VALUE;
  if (partialPattern.test(text)) return FACT_STATES.PARTIALLY_KNOWN;
  return FACT_STATES.EXACT_VALUE;
}

function normalizeSentence(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return /[。！？.!?]$/.test(text) ? text : `${text}。`;
}

function answerPlanFromRendered({
  intent,
  sourceSlotId,
  factState,
  renderedAnswer,
  unknownReason,
  clauseStatus = "matched",
  matchIndex = Number.MAX_SAFE_INTEGER,
  provenance = null,
  runtimeOnly = false,
  runtimeFactStates = null
}) {
  const answer = normalizeSentence(renderedAnswer);
  const separator = answer.search(/[，,]/);
  let directAnswer = separator >= 0 ? answer.slice(0, separator).trim() : "";
  if (!directAnswer && factState === FACT_STATES.KNOWN_FALSE) {
    directAnswer = answer.match(/(?:没有|不是|不会|不)[^，,。！？.!?]*/)?.[0]?.trim() || "";
  } else if (!directAnswer && factState === FACT_STATES.KNOWN_TRUE) {
    directAnswer = answer.match(/(?:有|是|会)[^，,。！？.!?]*/)?.[0]?.trim() || "";
  }
  const detail = separator >= 0
    ? answer.slice(separator + 1).replace(/[。！？.!?]+$/, "").trim()
    : answer.replace(/[。！？.!?]+$/, "").trim();
  return {
    intent,
    sourceSlotId,
    factState,
    directAnswer,
    detail,
    unknownReason: unknownReason || reasonCodeForState(factState),
    clauseStatus,
    matchIndex,
    renderedAnswer: answer,
    provenance,
    runtimeOnly,
    runtimeFactStates
  };
}

function renderAnswerPlan(plan) {
  if (plan?.renderedAnswer) return normalizeSentence(plan.renderedAnswer);
  const direct = String(plan?.directAnswer || "").trim();
  const detail = String(plan?.detail || "").trim();
  if (direct && detail) return normalizeSentence(`${direct}，${detail}`);
  return normalizeSentence(direct || detail);
}

function classifierReasonCode(reason) {
  if (/unavailable|disabled|rate_limited/i.test(String(reason || ""))) {
    return UNKNOWN_REASON_CODES.CLASSIFIER_UNAVAILABLE;
  }
  return UNKNOWN_REASON_CODES.INTENT_AMBIGUOUS;
}

module.exports = {
  FACT_STATES,
  UNKNOWN_REASON_CODES,
  answerPlanFromRendered,
  classifierReasonCode,
  factStateFromBoolean,
  factStateFromText,
  reasonCodeForState,
  renderAnswerPlan
};
