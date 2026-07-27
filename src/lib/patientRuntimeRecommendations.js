const catalog = require("./patientRuntimeRecommendations.json");
const { FACT_STATES } = require("./patientFactState.js");

const recommendations = Object.freeze(catalog.recommendations || []);

function caseMatches(item, caseId) {
  const target = String(caseId || "").toLowerCase();
  return String(item.caseId || "").toLowerCase() === target
    || String(item.runtimeCaseId || "").toLowerCase() === target;
}

function normalizeRecommendedFactState(value) {
  const state = String(value || "");
  if (state.startsWith("known_true/partially_known")) return FACT_STATES.PARTIALLY_KNOWN;
  if (state.startsWith("known_true")) return FACT_STATES.KNOWN_TRUE;
  if (state.startsWith("known_false")) return FACT_STATES.KNOWN_FALSE;
  if (state.startsWith("partially_known")) return FACT_STATES.PARTIALLY_KNOWN;
  if (state.startsWith("patient_not_aware")) return FACT_STATES.PATIENT_NOT_AWARE;
  if (state.startsWith("needs_review")) return FACT_STATES.NEEDS_REVIEW;
  if (state.startsWith("medical_conflict")) return FACT_STATES.MEDICAL_CONFLICT;
  if (state.startsWith("exact_value")) return FACT_STATES.EXACT_VALUE;
  if (state.startsWith("approximate_value")) return FACT_STATES.APPROXIMATE_VALUE;
  return FACT_STATES.MISSING;
}

function runtimeRecommendationsFor(caseId, predicate = () => true) {
  return recommendations.filter((item) => caseMatches(item, caseId) && predicate(item));
}

function personalHistoryRecommendation(caseId, intentKey) {
  const questionType = intentKey === "smoking_history"
    ? "吸烟史来源缺口"
    : intentKey === "alcohol_history" ? "饮酒史来源缺口" : "";
  if (!questionType) return null;
  return runtimeRecommendationsFor(
    caseId,
    (item) => item.questionType === questionType && item.handling === "direct_negative_answer"
  )[0] || null;
}

function historySummaryRecommendations(caseId) {
  return runtimeRecommendationsFor(
    caseId,
    (item) => item.questionType === "既往史汇总来源缺口"
      && item.handling === "aggregate_known_present_then_negative_summary"
  );
}

function medicationRecommendations(caseId, questionType, medicationName = "") {
  return runtimeRecommendationsFor(
    caseId,
    (item) => item.questionType === questionType
      && (!medicationName || item.medicationName === medicationName)
  );
}

function controlledAntihypertensiveNames(caseId) {
  return [...new Set(runtimeRecommendationsFor(
    caseId,
    (item) => ["controlled_indication_link", "link_by_controlled_drug_class"].includes(item.handling)
  ).map((item) => item.medicationName).filter(Boolean))];
}

function hypertensionMedicationRecommendation(caseId) {
  return runtimeRecommendationsFor(
    caseId,
    (item) => item.questionType === "高血压用药关联缺口"
  )[0] || null;
}

module.exports = {
  catalog,
  controlledAntihypertensiveNames,
  historySummaryRecommendations,
  hypertensionMedicationRecommendation,
  medicationRecommendations,
  normalizeRecommendedFactState,
  personalHistoryRecommendation,
  runtimeRecommendationsFor
};
