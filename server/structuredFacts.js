const { matchPatientFactOntology } = require("../src/lib/patientIntentCatalog.js");
const {
  answerPlanFromRendered,
  factStateFromText,
  reasonCodeForState,
  renderAnswerPlan
} = require("../src/lib/patientFactState.js");
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
  const medicationMatch = ontologyMatches.find((item) => item.intentKey === "medication_list");
  const matches = ontologyMatches.filter((item) => item.intentKey !== "medication_list");
  const wantsAllMedication = Boolean(medicationMatch);
  const answers = [];
  const matchedFacts = [];
  const matchedSlotIds = [];
  const collectableFacts = [];
  const collectableSlotIds = [];
  const sources = [];
  const answerPlans = [];
  let hasUnresolved = false;
  const clauses = [
    ...matches.map((definition, sourceOrder) => ({
      kind: "fact",
      index: definition.matchIndex,
      sourceOrder,
      definition
    })),
    ...(wantsAllMedication ? [{
      kind: "allMedication",
      index: medicationMatch.matchIndex,
      sourceOrder: matches.length,
      definition: medicationMatch
    }] : [])
  ].sort((left, right) => left.index - right.index || left.sourceOrder - right.sourceOrder);
  for (const clause of clauses) {
    if (clause.kind === "allMedication") {
      const medicationAnswer = language === "en" ? history.medicationAnswerEn : history.medicationAnswerZh;
      answers.push(medicationAnswer);
      matchedFacts.push("medication_list");
      matchedSlotIds.push("MED_ALL");
      collectableFacts.push("medication_list");
      collectableSlotIds.push("MED_ALL");
      sources.push(...(history.medicationList || []));
      const factState = factStateFromText(medicationAnswer);
      answerPlans.push(answerPlanFromRendered({
        intent: "medication_list",
        sourceSlotId: "MED_ALL",
        factState,
        renderedAnswer: medicationAnswer,
        unknownReason: reasonCodeForState(factState),
        matchIndex: clause.index
      }));
      continue;
    }
    const { historyKey: key, sourceSlotId: slotId, intentKey } = clause.definition;
    const fact = history[key];
    if (!fact) continue;
    const blocked = unresolvedFact(caseData.id, key, fact);
    const renderedAnswer = blocked ? unresolvedStructuredReply(key, language) : (language === "en" ? fact.patientAnswerEn : fact.patientAnswerZh);
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
    const factState = factStateFromText(renderedAnswer, { needsReview: blocked });
    answerPlans.push(answerPlanFromRendered({
      intent: intentKey,
      sourceSlotId: slotId,
      factState,
      renderedAnswer,
      unknownReason: reasonCodeForState(factState),
      clauseStatus: blocked ? "blocked_medical" : "matched",
      matchIndex: clause.index
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
