import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.TRAINING_STATE_SECRET = "unit-test-progressive-disclosure-secret-with-adequate-length";
process.env.TRAINING_ATTEMPT_STORE_MODE = "memory";
process.env.LLM_ENABLE_AI_AGENTS = "false";
process.env.PATIENT_SEMANTIC_CLASSIFIER_ENABLED = "false";

const require = createRequire(import.meta.url);
const cases = require("../data/cases.json");
const { generatePatientAnswer, initSession } = require("../server/patientSession.js");
const { validatePatientDisclosureOutput } = require("../server/patientProgressiveDisclosure.js");

const openQuestions = ["哪里不舒服？", "怎么了？", "为什么来看病？"];
const prematureDetail = /(?:\d+|一|两|三|四|五|六|七|八|九|十|半)(?:小时|天|日|周|月|年)|反复|间断|持续|全程|起始|终末|鲜红|暗红|茶色|酱油色|洗肉水|血块|无痛|疼|尿频|尿急|尿痛|发热|运动|外伤|高血压|糖尿病|缬沙坦|检查结果|诊断|治疗/u;

async function ask(caseId, question, language = "zh", history = []) {
  const session = await initSession({ caseId, mode: "sp-progressive-disclosure", language });
  return generatePatientAnswer({
    sessionId: session.sessionId,
    caseId,
    studentInput: question,
    conversationHistory: history,
    language
  });
}

async function converse(caseId, questions, language = "zh") {
  const session = await initSession({ caseId, mode: "sp-progressive-disclosure", language });
  const history = [];
  const answers = [];
  for (const question of questions) {
    const answer = await generatePatientAnswer({
      sessionId: session.sessionId,
      caseId,
      studentInput: question,
      conversationHistory: history,
      language
    });
    answers.push(answer);
    history.push({ role: "student", text: question }, { role: "patient", text: answer.replyText });
  }
  return answers;
}

async function main() {
  assert.equal(validatePatientDisclosureOutput("我最近小便看着有点红。", "我最近小便看着有点红。").ok, true);
  assert.equal(validatePatientDisclosureOutput("嗯，我最近小便看着有点红。", "我最近小便看着有点红。").ok, true);
  assert.equal(validatePatientDisclosureOutput("我最近小便看着有点红，已经一个月了。", "我最近小便看着有点红。").ok, false);
  assert.equal(validatePatientDisclosureOutput("我最近小便看着有点红，全程无痛，还有血块。", "我最近小便看着有点红。").ok, false);
  assert.equal(validatePatientDisclosureOutput("我有高血压，已经10年了。", "我有高血压。").ok, false);
  assert.equal(validatePatientDisclosureOutput("平时吃缬沙坦，每天一次。", "平时吃缬沙坦。").ok, false);
  let openingChecks = 0;
  for (const caseData of cases) {
    for (const question of openQuestions) {
      const answer = await ask(caseData.id, question);
      assert.deepEqual(
        answer.disclosurePlan?.authorizedIntents,
        ["presenting_clue"],
        `${caseData.id}/${question} must expose only the presenting clue`
      );
      assert.equal(answer.answerPlans?.length, 1, `${caseData.id}/${question} must have one opening plan`);
      assert.equal(answer.answerPlans?.[0]?.intent, "chief_complaint");
      assert.doesNotMatch(answer.replyText, prematureDetail, `${caseData.id}/${question} disclosed unasked detail`);
      assert.ok(answer.replyText.length > 0 && answer.replyText.length <= 80, `${caseData.id}/${question} must be concise`);
      openingChecks += 1;
    }
  }

  const symptomTrajectory = await converse("P001", [
    "哪里不舒服？", "多久了？", "一直这样吗？", "什么颜色？", "有血块吗？", "有什么诱因？"
  ]);
  assert.deepEqual(
    symptomTrajectory.map((answer) => answer.disclosurePlan?.authorizedIntents),
    [
      ["presenting_clue"], ["hematuria_onset"], ["intermittent_hematuria"],
      ["urine_color"], ["blood_clots"], ["triggers"]
    ],
    "symptom trajectory must disclose only the current layer"
  );

  const singleDisease = await converse("P001", ["还有其他病吗？", "多久了？", "平时吃什么药？", "怎么吃？"]);
  assert.deepEqual(singleDisease[0].disclosurePlan?.authorizedIntents, ["hypertension_history"]);
  assert.deepEqual(singleDisease[0].matchedFacts, ["hypertension_history"]);
  assert.match(singleDisease[0].replyText, /高血压/);
  assert.doesNotMatch(singleDisease[0].replyText, /糖尿病|10年|缬沙坦|阿司匹林|记不清/u);
  assert.deepEqual(singleDisease[1].disclosurePlan?.authorizedIntents, ["hypertension_history_duration"]);
  assert.match(singleDisease[1].replyText, /10年/);
  assert.deepEqual(singleDisease[2].disclosurePlan?.authorizedIntents, ["medication_list"]);
  assert.match(singleDisease[2].replyText, /缬沙坦/);
  assert.doesNotMatch(singleDisease[2].replyText, /每天|一次|一片|qd/i);
  assert.deepEqual(singleDisease[3].disclosurePlan?.authorizedIntents, ["medication_frequency"]);

  const scopedDiseaseMedication = await converse("P001", ["还有其他病吗？", "多久了？", "吃什么药？"]);
  assert.deepEqual(scopedDiseaseMedication[2].matchedFacts, ["medication_name"]);
  assert.doesNotMatch(scopedDiseaseMedication[2].replyText, /阿司匹林/);

  const recoveredDiseaseDuration = await ask("P001", "多久了？", "zh", [
    { role: "student", text: "还有其他病吗？" },
    { role: "patient", text: singleDisease[0].replyText }
  ]);
  assert.deepEqual(recoveredDiseaseDuration.disclosurePlan?.authorizedIntents, ["hypertension_history_duration"]);
  assert.match(recoveredDiseaseDuration.replyText, /10年/);

  const multipleDiseases = await converse("P004", ["有基础病吗？", "多久了？"]);
  assert.deepEqual(multipleDiseases[0].disclosurePlan?.authorizedIntents, ["hypertension_history", "diabetes_history"]);
  assert.match(multipleDiseases[0].replyText, /高血压/);
  assert.match(multipleDiseases[0].replyText, /糖尿病/);
  assert.doesNotMatch(multipleDiseases[0].replyText, /20年|药|胰岛素/u);
  assert.match(multipleDiseases[1].replyText, /高血压.*糖尿病|糖尿病.*高血压/u);
  assert.equal(multipleDiseases[1].disclosurePlan?.clarification, "multiple_past_medical_conditions");

  const knownPositiveWithBlockedPeer = await ask("P005", "以前有什么病？");
  assert.deepEqual(knownPositiveWithBlockedPeer.disclosurePlan?.authorizedIntents, ["diabetes_history", "coronary_history"]);
  assert.deepEqual(knownPositiveWithBlockedPeer.matchedFacts, ["diabetes_history", "coronary_history"]);
  assert.ok(!knownPositiveWithBlockedPeer.matchedSlotIds.includes("PAST_HYPERTENSION"));
  assert.match(knownPositiveWithBlockedPeer.replyText, /糖尿病/);
  assert.match(knownPositiveWithBlockedPeer.replyText, /冠心病/);
  assert.doesNotMatch(knownPositiveWithBlockedPeer.replyText, /高血压|不清楚|审核|review|pending/i);

  const noKnownDisease = await ask("P006", "平时身体还有什么毛病？");
  assert.deepEqual(noKnownDisease.disclosurePlan?.authorizedIntents, ["past_medical_history_summary"]);
  assert.match(noKnownDisease.replyText, /没有.*(?:慢性病|其他病)/u);
  assert.doesNotMatch(noKnownDisease.replyText, /高血压、糖尿病|记不清/u);

  const missingDiseaseDuration = await converse("HX-ADD-003", ["有基础病吗？", "多久了？"]);
  assert.match(missingDiseaseDuration[0].replyText, /高血压/);
  assert.deepEqual(missingDiseaseDuration[1].disclosurePlan?.authorizedIntents, ["hypertension_history_duration"]);
  assert.match(missingDiseaseDuration[1].replyText, /记不.*清/);

  const compound = await ask("P004", "有没有高血压、糖尿病，平时吃什么药？");
  assert.deepEqual(
    new Set(compound.disclosurePlan?.authorizedIntents),
    new Set(["hypertension_history", "diabetes_history", "medication_list"])
  );
  assert.match(compound.replyText, /高血压/);
  assert.match(compound.replyText, /糖尿病/);
  assert.match(compound.replyText, /二甲双胍|胰岛素|达格列净/);
  assert.doesNotMatch(compound.replyText, /20年|每天|一次|一片|qd/i);

  const lifestyle = await converse("P003", [
    "抽烟吗？", "每天多少？", "多少年了？", "喝酒吗？", "喝多少？", "多久喝一次？"
  ]);
  assert.deepEqual(lifestyle.map((answer) => answer.disclosurePlan?.authorizedIntents), [
    ["smoking_history"], ["smoking_amount"], ["smoking_duration"],
    ["alcohol_history"], ["alcohol_amount"], ["alcohol_frequency"]
  ]);
  assert.match(lifestyle[0].replyText, /抽烟/);
  assert.doesNotMatch(lifestyle[0].replyText, /20|30|每天|年/u);
  assert.match(lifestyle[1].replyText, /20支/);
  assert.match(lifestyle[2].replyText, /30年/);
  assert.match(lifestyle[3].replyText, /喝.*酒/);
  assert.doesNotMatch(lifestyle[3].replyText, /偶尔|每天|多少|频率/u);
  assert.deepEqual(lifestyle[5].matchedFacts, ["alcohol_frequency"]);

  const investigations = await converse("HX-ADD-029", ["还有没有做其他检查？", "有没有做CT或者彩超？", "检查结果怎么说？"]);
  assert.deepEqual(investigations.map((answer) => answer.disclosurePlan?.authorizedIntents), [
    ["prior_investigations"], ["prior_investigations"], ["prior_investigation_results_patient_aware"]
  ]);
  assert.doesNotMatch(investigations[1].replyText, /得看检查报告/);
  assert.notEqual(investigations[1].fallbackReason, "report_boundary");

  const english = await converse("P001", ["What brings you in?", "How long?", "Any other medical problems?", "What medicines do you take?"] , "en");
  assert.deepEqual(english.map((answer) => answer.disclosurePlan?.authorizedIntents), [
    ["presenting_clue"], ["hematuria_onset"], ["hypertension_history"], ["medication_list"]
  ]);
  assert.doesNotMatch(english[0].replyText, /month|intermittent|painless|clot|hypertension|medicine/i);
  assert.match(english[2].replyText, /hypertension/i);
  assert.doesNotMatch(english[2].replyText, /diabetes|year|valsartan|aspirin/i);

  console.log("R5-SP-PROGRESSIVE-DISCLOSURE passed.", {
    openingChecks,
    symptomTrajectory: symptomTrajectory.length,
    pastMedicalHistoryStates: 6,
    compoundChecks: 1,
    progressiveLifestyleChecks: lifestyle.length,
    investigationLayerChecks: investigations.length,
    bilingualChecks: english.length
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : "patient_progressive_disclosure_failed");
  process.exitCode = 1;
});
