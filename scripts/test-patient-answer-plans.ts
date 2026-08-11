import assert from "node:assert/strict";

process.env.LLM_ENABLE_AI_PATIENT = "false";
process.env.TRAINING_STATE_SECRET = "test-only-answer-plan-secret-with-adequate-length";

const cases = require("../data/cases.json") as Array<{ id: string }>;
const { matchCanonicalPatientFacts } = require("../server/canonicalFacts.js");
const { matchStructuredFacts } = require("../server/structuredFacts.js");
const { generatePatientAnswer } = require("../server/patientSession.js");
const {
  FACT_STATES,
  UNKNOWN_REASON_CODES,
  answerPlanFromRendered,
  renderAnswerPlan
} = require("../src/lib/patientFactState.js");

type AnswerPlan = {
  intent: string;
  factState: string;
  directAnswer: string;
  unknownReason: string | null;
};

function planFor(result: { answerPlans?: AnswerPlan[] } | null, intent: string) {
  return result?.answerPlans?.find((plan) => plan.intent === intent);
}

async function main() {
  const dysuriaTrue = matchCanonicalPatientFacts("P005", "小便痛不痛？", "zh");
  const truePlan = planFor(dysuriaTrue, "dysuria");
  assert.equal(truePlan?.factState, FACT_STATES.KNOWN_TRUE);
  assert.equal(truePlan?.directAnswer, "有");
  assert.match(renderAnswerPlan(truePlan), /^有/);
  assert.equal(truePlan?.unknownReason, null);

  const dysuriaFalse = matchCanonicalPatientFacts("P002", "小便痛不痛？", "zh");
  const falsePlan = planFor(dysuriaFalse, "dysuria");
  assert.equal(falsePlan?.factState, FACT_STATES.KNOWN_FALSE);
  assert.equal(falsePlan?.directAnswer, "没有");
  assert.match(renderAnswerPlan(falsePlan), /^没有/);
  assert.equal(falsePlan?.unknownReason, null);

  const onset = matchCanonicalPatientFacts("P001", "血尿多久了？", "zh");
  const onsetPlan = planFor(onset, "hematuria_onset");
  assert.ok(
    [FACT_STATES.EXACT_VALUE, FACT_STATES.APPROXIMATE_VALUE, FACT_STATES.PARTIALLY_KNOWN].includes(onsetPlan?.factState),
    `unexpected onset state: ${onsetPlan?.factState}`
  );
  assert.doesNotMatch(renderAnswerPlan(onsetPlan), /不太清楚|不知道/);

  const p002 = cases.find((item) => item.id === "P002");
  assert.ok(p002);
  const diabetes = matchStructuredFacts(p002, "以前得过糖尿病吗？", "zh");
  assert.equal(planFor(diabetes, "diabetes_history")?.factState, FACT_STATES.EXACT_VALUE);
  const stones = matchStructuredFacts(p002, "以前得过结石吗？", "zh");
  assert.equal(planFor(stones, "previous_stone")?.factState, FACT_STATES.NEEDS_REVIEW);
  assert.equal(planFor(stones, "previous_stone")?.unknownReason, UNKNOWN_REASON_CODES.NEEDS_REVIEW);

  const partial = answerPlanFromRendered({
    intent: "hematuria_onset",
    sourceSlotId: "hematuria_onset",
    factState: FACT_STATES.APPROXIMATE_VALUE,
    renderedAnswer: "已经有几天了，具体是哪一天开始的我记不太清。",
    unknownReason: null
  });
  assert.equal(renderAnswerPlan(partial), "已经有几天了，具体是哪一天开始的我记不太清。");
  assert.notEqual(partial.factState, FACT_STATES.MISSING);

  const reasonValues = new Set(Object.values(UNKNOWN_REASON_CODES));
  for (const result of [dysuriaTrue, dysuriaFalse, onset, diabetes, stones]) {
    for (const reason of Object.values(result?.unknownReasonCodes || {})) {
      assert.ok(reasonValues.has(reason), `unknown reason code escaped whitelist: ${reason}`);
    }
  }

  const missingKidneyHistory = await generatePatientAnswer({
    sessionId: "answer-plan-missing-kidney-history",
    caseId: "P002",
    studentInput: "以前得过肾病吗？",
    conversationHistory: [],
    language: "zh"
  });
  assert.equal(missingKidneyHistory.unknownReasonCodes?.previous_kidney_disease, UNKNOWN_REASON_CODES.FACT_MISSING);
  assert.match(missingKidneyHistory.replyText, /记不(?:太)?清|不太清楚/);
  assert.doesNotMatch(missingKidneyHistory.replyText, /可靠的信息|没记录|数据库|病例字段|source fact|needs review/i);
  assert.doesNotMatch(missingKidneyHistory.replyText, /^没有[，。]/, "missing history must not become a negative fact");

  console.log("Patient fact-state model and deterministic answer-plan contracts passed.");
}

void main();
