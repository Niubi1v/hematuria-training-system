const { matchPatientFactOntology } = require("../src/lib/patientIntentCatalog.js");
const {
  FACT_STATES,
  answerPlanFromRendered,
  factStateFromText,
  reasonCodeForState,
  renderAnswerPlan
} = require("../src/lib/patientFactState.js");
const {
  buildMedicationAnswerPlan,
  buildPastMedicalHistorySummary,
  selectMedicationsForQuestion
} = require("../src/lib/structuredHistoryAnswerPlanner.js");
const {
  normalizeRecommendedFactState,
  personalHistoryRecommendation
} = require("../src/lib/patientRuntimeRecommendations.js");
const historyMedicalPolicy = require("../data/history_medical_reconciliation.json");
const explicitBlockedFacts = new Set(
  historyMedicalPolicy.blockedMedicalHistory.map((item) => `${item.caseId}:${item.field}`)
);

function unresolvedStructuredReply(key, language = "zh") {
  const observationFacts = new Set(["traumaHistory", "urinaryProcedureHistory"]);
  if (language === "en") {
    return observationFacts.has(key)
      ? "I did not pay close attention to that before."
      : "I cannot recall that clearly.";
  }
  return observationFacts.has(key)
    ? "这个我之前没特别注意。"
    : "这点我记不太清了。";
}

function unresolvedFact(caseId, key, fact) {
  return explicitBlockedFacts.has(`${caseId}:${key}`)
    || fact?.provenance === "author_added_for_simulation"
    || fact?.teacherReviewRequired === true;
}

function matchStructuredFacts(caseData, question, language = "zh") {
  const history = caseData?.structuredHistory;
  if (!history) return null;
  const text = String(question || "");
  const ontologyMatches = matchPatientFactOntology(text, language, ["structured_history"]);
  const specialIntents = new Set([
    "past_medical_history_summary",
    "medication_list",
    "medication_name",
    "medication_dosage",
    "medication_frequency",
    "other_medications"
  ]);
  const answers = [];
  const matchedFacts = [];
  const matchedSlotIds = [];
  const collectableFacts = [];
  const collectableSlotIds = [];
  const sources = [];
  const answerPlans = [];
  let hasUnresolved = false;
  const clauses = ontologyMatches.map((definition, sourceOrder) => ({
    kind: specialIntents.has(definition.intentKey) ? "special" : "fact",
    index: definition.matchIndex,
    sourceOrder,
    definition
  })).sort((left, right) => left.index - right.index || left.sourceOrder - right.sourceOrder);
  for (const clause of clauses) {
    if (clause.kind === "special") {
      const { intentKey, sourceSlotId } = clause.definition;
      const summary = intentKey === "past_medical_history_summary"
        ? buildPastMedicalHistorySummary(
          history,
          language,
          (key, fact) => unresolvedFact(caseData.id, key, fact),
          { caseId: caseData.id }
        )
        : null;
      const allMedicationSources = (history.medicationList || []).filter(
        (item) => !unresolvedFact(caseData.id, "medicationList", item)
      );
      const medicationHasUnresolved = intentKey !== "past_medical_history_summary"
        && allMedicationSources.length !== (history.medicationList || []).length;
      const medicationSelection = selectMedicationsForQuestion(
        allMedicationSources,
        text,
        language,
        { caseId: caseData.id }
      );
      const planned = summary || buildMedicationAnswerPlan(
        history,
        intentKey,
        language,
        medicationSelection.medications,
        {
          scope: medicationSelection.scope,
          allMedications: allMedicationSources,
          caseId: caseData.id
        }
      );
      const renderedAnswer = planned.renderedAnswer;
      const factState = medicationHasUnresolved && planned.factState === FACT_STATES.MISSING
        ? FACT_STATES.NEEDS_REVIEW
        : planned.factState;
      answers.push(renderedAnswer);
      matchedFacts.push(intentKey);
      matchedSlotIds.push(sourceSlotId);
      if (
        !summary?.hasRuntimeGovernance
        && ![FACT_STATES.MISSING, FACT_STATES.NEEDS_REVIEW, FACT_STATES.MEDICAL_CONFLICT].includes(factState)
      ) {
        collectableFacts.push(intentKey);
        collectableSlotIds.push(sourceSlotId);
      }
      sources.push(...(summary?.sources || (medicationSelection.scope ? allMedicationSources : medicationSelection.medications)));
      hasUnresolved ||= Boolean(summary?.hasUnresolved || medicationHasUnresolved);
      answerPlans.push(answerPlanFromRendered({
        intent: intentKey,
        sourceSlotId,
        factState,
        renderedAnswer,
        unknownReason: reasonCodeForState(factState),
        clauseStatus: factState === FACT_STATES.NEEDS_REVIEW ? "blocked_medical" : "matched",
        matchIndex: clause.index,
        provenance: planned.provenance,
        runtimeOnly: Boolean(planned.runtimeOnly),
        runtimeFactStates: planned.runtimeFactStates
      }));
      continue;
    }
    const { historyKey: key, sourceSlotId: slotId, intentKey } = clause.definition;
    const fact = history[key];
    if (!fact) continue;
    const blocked = unresolvedFact(caseData.id, key, fact);
    const runtimeRecommendation = blocked && language === "zh"
      ? personalHistoryRecommendation(caseData.id, intentKey)
      : null;
    const renderedAnswer = runtimeRecommendation?.runtimeAnswer
      || (blocked ? unresolvedStructuredReply(key, language) : (language === "en" ? fact.patientAnswerEn : fact.patientAnswerZh));
    answers.push(renderedAnswer);
    matchedFacts.push(intentKey);
    matchedSlotIds.push(slotId);
    if (blocked) {
      hasUnresolved = true;
    } else {
      collectableFacts.push(intentKey);
      collectableSlotIds.push(slotId);
    }
    sources.push(fact);
    const factState = runtimeRecommendation
      ? normalizeRecommendedFactState(runtimeRecommendation.factState)
      : factStateFromText(renderedAnswer, { needsReview: blocked });
    answerPlans.push(answerPlanFromRendered({
      intent: intentKey,
      sourceSlotId: slotId,
      factState,
      renderedAnswer,
      unknownReason: reasonCodeForState(factState),
      clauseStatus: blocked && !runtimeRecommendation ? "blocked_medical" : "matched",
      matchIndex: clause.index,
      provenance: runtimeRecommendation?.provenance,
      runtimeOnly: Boolean(runtimeRecommendation),
      runtimeFactStates: runtimeRecommendation
        ? { [key]: normalizeRecommendedFactState(runtimeRecommendation.factState) }
        : null
    }));
  }
  if (!answers.length) return null;
  const provenance = new Set(sources.map((item) => item.provenance));
  return {
    replyText: [...new Set(answerPlans.map(renderAnswerPlan).filter(Boolean))].join("\n"),
    matchedSlotIds: [...new Set(matchedSlotIds)],
    matchedFacts: [...new Set(matchedFacts)],
    governanceSlotIds: [...new Set(matchedSlotIds)],
    collectableSlotIds: [...new Set(collectableSlotIds)],
    collectableFacts: [...new Set(collectableFacts)],
    answerSource: hasUnresolved ? "pending_review" : (provenance.size > 1 ? "mixed" : ([...provenance][0] || "source")),
    confidence: hasUnresolved ? 0 : 0.99,
    safetyFlags: [],
    fallbackReason: hasUnresolved ? "medical_history_pending_review" : "",
    factStates: Object.fromEntries(answerPlans.map((plan) => [plan.intent, plan.factState])),
    answerPlans,
    unknownReasonCodes: Object.fromEntries(
      answerPlans.filter((plan) => plan.unknownReason).map((plan) => [plan.intent, plan.unknownReason])
    )
  };
}

module.exports = { matchStructuredFacts };
