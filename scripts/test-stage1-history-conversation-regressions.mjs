import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.TRAINING_STATE_SECRET = "r5-stage1-history-conversation-regression-secret";
process.env.TRAINING_ATTEMPT_STORE_MODE = "memory";
process.env.LLM_ENABLE_AI_AGENTS = "false";
process.env.PATIENT_SEMANTIC_CLASSIFIER_ENABLED = "false";

const require = createRequire(import.meta.url);
const { stage1HistoryIntentRegistry } = require("../src/lib/stage1HistoryIntentRegistry.js");
const { generatePatientAnswer, initSession } = require("../server/patientSession.js");

const genericUnknown = /(?:这个|这点|这项).*(?:不清楚|记不清)|得看检查报告/;

async function ask(question) {
  const session = await initSession({ caseId: "HX-ADD-029", attemptId: `stage1-p041-${question}`, language: "zh" });
  return generatePatientAnswer({
    sessionId: session.sessionId,
    caseId: "HX-ADD-029",
    studentInput: question,
    conversationHistory: [],
    language: "zh"
  });
}

async function main() {
  for (const intent of [
    "chief_complaint", "alcohol_history", "medication_list", "medication_dosage",
    "medication_frequency", "prior_investigations", "prior_investigation_results_patient_aware",
    "prior_diagnosis_patient_aware", "prior_treatment", "treatment_response"
  ]) {
    assert.ok(stage1HistoryIntentRegistry.has(intent), `${intent}: missing from Stage-1 registry`);
  }

  const alcohol = await ask("喝酒吗");
  assert.equal(alcohol.clauseOutcomes?.[0]?.intent, "alcohol_history");
  assert.equal(alcohol.clauseOutcomes?.[0]?.status, "blocked_medical");
  assert.equal(alcohol.clauseOutcomes?.[0]?.factState, "needs_review");
  assert.notEqual(alcohol.unknownReasonCodes?.unresolved_intent, "classifier_unavailable");

  const medication = await ask("吃什么药吗");
  assert.ok(medication.answerPlans?.some((plan) => plan.intent === "medication_list"));
  assert.ok(medication.matchedFacts?.includes("medication_list"));
  assert.doesNotMatch(medication.replyText, genericUnknown);
  assert.match(medication.replyText, /(?:没有|不).*长期.*(?:服药|吃药|用药)/);

  const specificInvestigation = await ask("有没有做CT或者彩超");
  assert.notEqual(specificInvestigation.fallbackReason, "report_boundary");
  assert.equal(specificInvestigation.answerPlans?.[0]?.intent, "prior_investigations");
  assert.equal(specificInvestigation.answerPlans?.[0]?.factState, "patient_not_aware");
  assert.match(specificInvestigation.replyText, /CT|B超|彩超/);

  const otherInvestigation = await ask("还有没有做其他检查");
  assert.notEqual(otherInvestigation.fallbackReason, "report_boundary");
  assert.ok(otherInvestigation.answerPlans?.some((plan) => plan.intent === "prior_investigations"));
  assert.match(otherInvestigation.replyText, /尿检/);

  const urineColor = await ask("平时小便什么颜色");
  assert.deepEqual(urineColor.matchedFacts, ["urine_color"]);
  assert.match(urineColor.replyText, /外观多正常/);
  assert.doesNotMatch(urineColor.replyText, /病历|记录|报告|字段|source|fact/i);

  console.log("R5-STAGE1-HUMAN-REGRESSIONS passed: 5/5.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : "stage1_history_regression_failed");
  process.exitCode = 1;
});
