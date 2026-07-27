import type { CaseData, StructuredHistory, StructuredPatientFact } from "./types";
import historyMedicalPolicy from "../../data/history_medical_reconciliation.json";

export type StructuredReply = {
  replyText: string;
  matchedSlotIds: string[];
  matchedFacts: string[];
  governanceSlotIds: string[];
  collectableSlotIds: string[];
  collectableFacts: string[];
  answerSource: "source" | "author_added_for_simulation" | "mixed" | "pending_review";
  confidence: number;
  safetyFlags: string[];
  fallbackReason: string;
};

const explicitlyBlockedFacts = new Set(
  historyMedicalPolicy.blockedMedicalHistory.map((item) => `${item.caseId}:${item.field}`)
);

function unresolvedReply(key: string, language: "zh" | "en") {
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

function unresolvedFact(
  caseId: string,
  key: string,
  fact: Pick<StructuredPatientFact, "provenance" | "teacherReviewRequired">
) {
  return explicitlyBlockedFacts.has(`${caseId}:${key}`)
    || fact.provenance === "author_added_for_simulation"
    || fact.teacherReviewRequired;
}

type FactMatch = { key: keyof StructuredHistory; slotId: string; triggers: RegExp; targeted?: RegExp };

const { structuredHistoryIntentDefinitions } = require("./patientIntentCatalog.js") as {
  structuredHistoryIntentDefinitions: Array<{
    historyKey?: keyof StructuredHistory;
    sourceSlotId: string;
    pattern?: RegExp;
    key: string;
  }>;
};
const {
  buildMedicationAnswerPlan,
  buildPastMedicalHistorySummary,
  selectMedicationsForQuestion
} = require("./structuredHistoryAnswerPlanner.js") as {
  buildMedicationAnswerPlan(
    history: StructuredHistory,
    intent: string,
    language: "zh" | "en",
    medications: StructuredHistory["medicationList"],
    options?: { scope?: string; allMedications?: StructuredHistory["medicationList"]; caseId?: string }
  ): { renderedAnswer: string; runtimeOnly?: boolean };
  buildPastMedicalHistorySummary(
    history: StructuredHistory,
    language: "zh" | "en",
    isBlocked: (
      key: string,
      fact: Pick<StructuredPatientFact, "provenance" | "teacherReviewRequired">
    ) => boolean,
    options?: { caseId?: string }
  ): {
    renderedAnswer: string;
    sources: StructuredPatientFact[];
    hasUnresolved: boolean;
    hasRuntimeGovernance?: boolean;
  };
  selectMedicationsForQuestion(
    medications: StructuredHistory["medicationList"],
    question: string,
    language: "zh" | "en",
    options?: { caseId?: string }
  ): { medications: StructuredHistory["medicationList"]; scope: string };
};
const {
  personalHistoryRecommendation
} = require("./patientRuntimeRecommendations.js") as {
  personalHistoryRecommendation(
    caseId: string,
    intentKey: string
  ): { runtimeAnswer: string; provenance: string } | null;
};

const specialIntents = new Set([
  "past_medical_history_summary",
  "medication_list",
  "medication_name",
  "medication_dosage",
  "medication_frequency",
  "other_medications"
]);

const facts: FactMatch[] = structuredHistoryIntentDefinitions
  .filter((definition) => definition.historyKey && !specialIntents.has(definition.key) && definition.pattern)
  .map((definition) => ({
    key: definition.historyKey!,
    slotId: definition.sourceSlotId,
    triggers: definition.pattern!
  }));

const specialDefinitions = structuredHistoryIntentDefinitions.filter(
  (definition) => specialIntents.has(definition.key) && definition.pattern
);

function provenance(items: Array<StructuredPatientFact | { provenance: string }>) {
  const values = new Set(items.map((item) => item.provenance));
  return values.size > 1 ? "mixed" : (values.values().next().value || "source");
}

export function matchStructuredPatientQuestion(caseData: CaseData, question: string, language: "zh" | "en" = "zh"): StructuredReply | null {
  const history = caseData.structuredHistory;
  if (!history) return null;
  const matches = facts.filter((item) => item.triggers.test(question));
  const specialMatches = specialDefinitions.filter((item) => item.pattern?.test(question));
  const matchedFacts = matches.map((item) => String(item.key));
  const matchedSlotIds = matches.map((item) => item.slotId);
  const answers: string[] = [];
  const collectableFacts: string[] = [];
  const collectableSlotIds: string[] = [];
  const sources: Array<StructuredPatientFact | { provenance: string }> = [];
  let hasUnresolved = false;

  for (const match of specialMatches) {
    let collectable = true;
    if (match.key === "past_medical_history_summary") {
      const summary = buildPastMedicalHistorySummary(
        history,
        language,
        (key, fact) => unresolvedFact(caseData.id, key, fact),
        { caseId: caseData.id }
      );
      answers.push(summary.renderedAnswer);
      sources.push(...summary.sources);
      hasUnresolved ||= summary.hasUnresolved;
      collectable = !summary.hasRuntimeGovernance && !summary.hasUnresolved;
    } else {
      const medications = history.medicationList.filter(
        (item) => !unresolvedFact(caseData.id, "medicationList", item)
      );
      const selection = selectMedicationsForQuestion(
        medications,
        question,
        language,
        { caseId: caseData.id }
      );
      answers.push(buildMedicationAnswerPlan(
        history,
        match.key,
        language,
        selection.medications,
        { scope: selection.scope, allMedications: medications, caseId: caseData.id }
      ).renderedAnswer);
      sources.push(...medications);
      hasUnresolved ||= medications.length !== history.medicationList.length;
    }
    matchedFacts.push(match.key);
    matchedSlotIds.push(match.sourceSlotId);
    if (collectable) {
      collectableFacts.push(match.key);
      collectableSlotIds.push(match.sourceSlotId);
    }
  }
  for (const match of matches) {
    const fact = history[match.key] as StructuredPatientFact;
    if (!fact || typeof fact !== "object" || !("patientAnswerZh" in fact)) continue;
    if (unresolvedFact(caseData.id, String(match.key), fact)) {
      const personalIntent = match.key === "smokingHistory"
        ? "smoking_history"
        : match.key === "alcoholHistory" ? "alcohol_history" : "";
      const runtimeRecommendation = language === "zh" && personalIntent
        ? personalHistoryRecommendation(caseData.id, personalIntent)
        : null;
      answers.push(runtimeRecommendation?.runtimeAnswer || unresolvedReply(String(match.key), language));
      hasUnresolved = true;
    } else {
      answers.push(language === "en" ? fact.patientAnswerEn : fact.patientAnswerZh);
      collectableFacts.push(String(match.key));
      collectableSlotIds.push(match.slotId);
    }
    sources.push(fact);
  }
  const uniqueAnswers = [...new Set(answers.map((item) => item.trim()).filter(Boolean))];
  if (!uniqueAnswers.length) return null;
  return {
    replyText: uniqueAnswers.join("\n"),
    matchedSlotIds: [...new Set(matchedSlotIds)],
    matchedFacts: [...new Set(matchedFacts)],
    governanceSlotIds: [...new Set(matchedSlotIds)],
    collectableSlotIds: [...new Set(collectableSlotIds)],
    collectableFacts: [...new Set(collectableFacts)],
    answerSource: hasUnresolved ? "pending_review" : provenance(sources) as StructuredReply["answerSource"],
    confidence: hasUnresolved ? 0 : 0.99,
    safetyFlags: [],
    fallbackReason: hasUnresolved ? "medical_history_pending_review" : ""
  };
}
