import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

process.env.LLM_PROVIDER = "none";
process.env.LLM_ENABLE_AI_PATIENT = "false";
process.env.TRAINING_STATE_SECRET ||= "r5-patient-adversarial-corpus-secret-2026";
process.env.TRAINING_ATTEMPT_STORE_MODE = "memory";

const require = createRequire(import.meta.url);
const cases = require("../data/cases.json");
const corpus = JSON.parse(fs.readFileSync(new URL("../tests/fixtures/patient-adversarial-corpus.json", import.meta.url), "utf8"));
const routerSource = fs.readFileSync(new URL("../server/patientIntentOnlyRouter.js", import.meta.url), "utf8");
const { initSession, generatePatientAnswer } = require("../server/patientSession.js");

const expectedIntents = [
  "chief_complaint",
  "gross_hematuria",
  "hematuria_onset",
  "urine_color",
  "blood_clots",
  "dysuria",
  "flank_pain",
  "fever",
  "smoking_history",
  "medication_list",
  "family_history",
  "prior_medical_visit",
  "prior_investigations",
  "prior_investigation_results_patient_aware",
  "prior_diagnosis_patient_aware",
  "prior_treatment",
  "prior_medication_for_current_problem",
  "treatment_response"
];
const knowledgeIntents = new Set(expectedIntents.slice(11));
const styles = ["colloquial", "ellipsis", "inversion", "typo_or_grammar", "referential", "natural"];
const naturalUnknown = /不太清楚|记不太准|记不清|说不准|不知道|没做过检查|没有做过检查|需要医生判断/;
const genericUnknown = /这个我现在记不清了|这项情况我现在不太清楚|医生，您能问得再具体一点吗|不太明白您想问哪方面/;
const internalLeak = /simulated|provenance|medical_review|eligibility|diagnosticEligible|scoringEligible|sourceSlotId|matchedPatientFactDomain|groundedIntent|teacherOnly|评分点|标准答案/i;
const stage2Detail = /\d+(?:\.\d+)?\s*(?:个\/|HPF|μl|ul|ng\/ml|mm|cm)|PI-?RADS|TURBT|病理分级|TNM/i;
const systemPatientWording = /现有病史|现有记录|病例资料|资料没有写清|不能凭空|\bsource\b|\bfact\b|字段|记录显示/iu;

function sorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function plans(answer) {
  return Array.isArray(answer.answerPlans) ? answer.answerPlans : [];
}

function adversarialDomain(intent) {
  return ["smoking_amount", "smoking_duration"].includes(intent) ? "smoking_history" : intent;
}

function checkSafe(answer, metrics) {
  const reply = String(answer.replyText || "").trim();
  if (!reply) metrics.emptyAnswers += 1;
  if (internalLeak.test(reply)) metrics.internalLeaks += 1;
  if (stage2Detail.test(reply)) metrics.stage2Leak += 1;
  if (systemPatientWording.test(reply)) metrics.systemPatientWording += 1;
}

function checkIntents(answer, expected, label, routeFailures, question = "") {
  const actual = sorted(plans(answer).map((plan) => adversarialDomain(plan.intent)));
  const wanted = sorted(expected);
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) routeFailures.push({ label, question, expected: wanted, actual });
  return actual;
}

function caseByDisplayId(caseId) {
  const found = cases.find((item) => item.displayCaseId === caseId || item.id === caseId);
  assert.ok(found, "unknown corpus case: " + caseId);
  return found;
}

async function ask(session, caseData, question, history = []) {
  return generatePatientAnswer({
    sessionId: session.sessionId,
    caseId: caseData.id,
    studentInput: question,
    conversationHistory: history,
    language: "zh"
  });
}

function expectedKnown(intent, caseId) {
  return (corpus.patientKnowledgeExactCases[intent] || []).includes(caseId);
}

function checkKnowledge(answer, intent, caseId, metrics, label) {
  const plan = plans(answer).find((item) => item.intent === intent);
  assert.ok(plan, label + ": missing patient-knowledge plan");
  const known = expectedKnown(intent, caseId);
  if (known) {
    metrics.sourceKnownTotal += 1;
    if (plan.factState === "exact_value" && plan.provenance === "repo_patient_knowable_projection") {
      metrics.sourceKnownCorrect += 1;
    }
    if (genericUnknown.test(answer.replyText)) metrics.answerableGenericUnknown += 1;
  } else {
    metrics.trueMissingTotal += 1;
    if (!["missing", "patient_not_aware"].includes(plan.factState)) metrics.hallucination += 1;
    if (!naturalUnknown.test(answer.replyText)) metrics.unnaturalUnknown += 1;
    if ((answer.collectableFacts || []).includes(intent)) metrics.hallucination += 1;
  }
}

assert.equal(corpus.schemaVersion, 1, "unsupported corpus schema");
assert.deepEqual(corpus.domains.map((domain) => domain.expectedIntent), expectedIntents, "corpus must own the fixed 18-domain order");
assert.deepEqual(Object.keys(corpus.patientKnowledgeExactCases), expectedIntents.slice(11), "literal patient-knowledge truth map drift");
assert.equal(cases.length, 42, "the adversarial gate requires all 42 cases");
assert.equal(new Set(corpus.caseOrder).size, 42, "fixture must own 42 unique case assignments");
assert.deepEqual(sorted(corpus.caseOrder), sorted(cases.map((caseData) => caseData.displayCaseId)), "fixture case assignments drifted from the 42 cases");

const direct = [];
for (const domain of corpus.domains) {
  assert.deepEqual(Object.keys(domain.groups), styles, domain.expectedIntent + ": style coverage drift");
  let questionIndex = 0;
  for (const style of styles) {
    assert.equal(domain.groups[style].length, style === "colloquial" ? 8 : 4, domain.expectedIntent + ":" + style + " count");
    for (const question of domain.groups[style]) {
      direct.push({ intent: domain.expectedIntent, style, question, questionIndex });
      questionIndex += 1;
    }
  }
}
assert.equal(direct.length, 504, "independent direct corpus must contain 504 questions");
assert.equal(new Set(direct.map((item) => item.question.replace(/[\s，。！？；：、,.!?;:]/g, ""))).size, direct.length, "direct corpus contains duplicate questions");
for (const item of direct) {
  if ([...item.question].length >= 8) {
    assert.equal(routerSource.includes(item.question), false, "production router hard-coded an adversarial question: " + item.question);
  }
}

const metrics = {
  directQuestions: direct.length,
  contextSequences: corpus.sequences.length,
  compoundQuestions: corpus.compounds.length,
  sourceKnownTotal: 0,
  sourceKnownCorrect: 0,
  trueMissingTotal: 0,
  answerableGenericUnknown: 0,
  unnaturalUnknown: 0,
  hallucination: 0,
  stage2Leak: 0,
  internalLeaks: 0,
  systemPatientWording: 0,
  emptyAnswers: 0,
  compoundClauseDrop: 0
};
const coveredCases = new Set();
const routeFailures = [];

for (let index = 0; index < direct.length; index += 1) {
  const item = direct[index];
  const exactCases = corpus.patientKnowledgeExactCases[item.intent] || [];
  const missingCases = corpus.caseOrder.filter((caseId) => !exactCases.includes(caseId));
  const caseId = knowledgeIntents.has(item.intent) && item.questionIndex < exactCases.length
    ? exactCases[item.questionIndex]
    : knowledgeIntents.has(item.intent)
      ? missingCases[(item.questionIndex - exactCases.length) % missingCases.length]
      : corpus.caseOrder[(index * 17) % corpus.caseOrder.length];
  const caseData = caseByDisplayId(caseId);
  coveredCases.add(caseData.displayCaseId);
  const session = await initSession({ caseId: caseData.id, attemptId: "r5-adversarial-" + index, language: "zh" });
  const answer = await ask(session, caseData, item.question);
  const label = caseData.displayCaseId + ":" + item.intent + ":" + item.style + ":" + index;
  checkIntents(answer, [item.intent], label, routeFailures, item.question);
  checkSafe(answer, metrics);
  if (knowledgeIntents.has(item.intent) && plans(answer).some((plan) => plan.intent === item.intent)) {
    checkKnowledge(answer, item.intent, caseData.displayCaseId, metrics, label);
  }
}

for (const [index, scenario] of corpus.sequences.entries()) {
  const caseData = caseByDisplayId(scenario.caseId);
  coveredCases.add(caseData.displayCaseId);
  const session = await initSession({ caseId: caseData.id, attemptId: "r5-adversarial-sequence-" + index, language: "zh" });
  const history = [];
  for (const [turnIndex, turn] of scenario.turns.entries()) {
    const answer = await ask(session, caseData, turn.question, history);
    const label = scenario.caseId + ":sequence-" + index + ":" + turnIndex;
    checkIntents(answer, turn.expectedIntents, label, routeFailures, turn.question);
    checkSafe(answer, metrics);
    history.push({ role: "user", content: turn.question }, { role: "assistant", content: answer.replyText });
  }
}

for (const [index, scenario] of corpus.compounds.entries()) {
  const caseData = caseByDisplayId(scenario.caseId);
  coveredCases.add(caseData.displayCaseId);
  const session = await initSession({ caseId: caseData.id, attemptId: "r5-adversarial-compound-" + index, language: "zh" });
  const answer = await ask(session, caseData, scenario.question);
  const actual = checkIntents(answer, scenario.expectedIntents, scenario.caseId + ":compound-" + index, routeFailures, scenario.question);
  const expected = sorted(scenario.expectedIntents);
  metrics.compoundClauseDrop += expected.filter((intent) => !actual.includes(intent)).length;
  checkSafe(answer, metrics);
}

assert.equal(coveredCases.size, 42, "independent corpus did not exercise all 42 cases");
const routeFailureCounts = Object.fromEntries(expectedIntents.map((intent) => [
  intent,
  routeFailures.filter((failure) => failure.label.split(":")[1] === intent).length
]));
if (process.argv.includes("--verbose") && routeFailures.length) console.error(JSON.stringify(routeFailures, null, 2));
assert.equal(routeFailures.length, 0, "route failures by intent: " + JSON.stringify(routeFailureCounts) + "; samples: " + JSON.stringify(routeFailures.slice(0, 36)));
assert.equal(metrics.sourceKnownCorrect, metrics.sourceKnownTotal, "source-known patient facts were not grounded exactly");
for (const key of ["answerableGenericUnknown", "unnaturalUnknown", "hallucination", "stage2Leak", "internalLeaks", "systemPatientWording", "emptyAnswers", "compoundClauseDrop"]) {
  assert.equal(metrics[key], 0, key + " must be zero");
}

console.log(JSON.stringify({
  gate: "R5-PATIENT-ADVERSARIAL-CORPUS",
  scenarios: direct.length + corpus.sequences.reduce((count, scenario) => count + scenario.turns.length, 0) + corpus.compounds.length,
  domains: expectedIntents.length,
  cases: coveredCases.size,
  styles,
  sourceKnownAccuracy: metrics.sourceKnownTotal ? metrics.sourceKnownCorrect / metrics.sourceKnownTotal : 1,
  ...metrics
}, null, 2));
