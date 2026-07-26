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

function unresolvedFact(caseId: string, key: string, fact: StructuredPatientFact) {
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

const facts: FactMatch[] = structuredHistoryIntentDefinitions
  .filter((definition) => definition.historyKey && definition.key !== "medication_list" && definition.pattern)
  .map((definition) => ({
    key: definition.historyKey!,
    slotId: definition.sourceSlotId,
    triggers: definition.pattern!
  }));

const broadMedication = structuredHistoryIntentDefinitions.find((definition) => definition.key === "medication_list")?.pattern || /$a/;

function provenance(items: Array<StructuredPatientFact | { provenance: string }>) {
  const values = new Set(items.map((item) => item.provenance));
  return values.size > 1 ? "mixed" : (values.values().next().value || "source");
}

export function matchStructuredPatientQuestion(caseData: CaseData, question: string, language: "zh" | "en" = "zh"): StructuredReply | null {
  const history = caseData.structuredHistory;
  if (!history) return null;
  const matches = facts.filter((item) => item.triggers.test(question));
  const wantsAllMedication = broadMedication.test(question) && !matches.some((item) => item.key === "anticoagulantUse" || item.key === "antiplateletUse");
  const matchedFacts = matches.map((item) => String(item.key));
  const matchedSlotIds = matches.map((item) => item.slotId);
  const answers: string[] = [];
  const collectableFacts: string[] = [];
  const collectableSlotIds: string[] = [];
  const sources: Array<StructuredPatientFact | { provenance: string }> = [];
  let hasUnresolved = false;

  if (wantsAllMedication) {
    answers.push(language === "en" ? history.medicationAnswerEn : history.medicationAnswerZh);
    matchedFacts.push("medicationList");
    matchedSlotIds.push("MED_ALL");
    collectableFacts.push("medicationList");
    collectableSlotIds.push("MED_ALL");
    sources.push(...history.medicationList);
  }
  for (const match of matches) {
    const fact = history[match.key] as StructuredPatientFact;
    if (!fact || typeof fact !== "object" || !("patientAnswerZh" in fact)) continue;
    if (unresolvedFact(caseData.id, String(match.key), fact)) {
      answers.push(unresolvedReply(String(match.key), language));
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
