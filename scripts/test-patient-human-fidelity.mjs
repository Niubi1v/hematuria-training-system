import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.TRAINING_STATE_SECRET = "r5-human-fidelity-test-secret-with-adequate-length";
process.env.TRAINING_ATTEMPT_STORE_MODE = "memory";
process.env.LLM_ENABLE_AI_AGENTS = "false";
process.env.PATIENT_SEMANTIC_CLASSIFIER_ENABLED = "false";

const require = createRequire(import.meta.url);
const { generatePatientAnswer, initSession } = require("../server/patientSession.js");
const { buildLifestyleAnswerPlan } = require("../src/lib/structuredHistoryAnswerPlanner.js");
const { questionSemanticDepth } = require("../src/lib/stage1HistoryIntentRegistry.js");

async function ask(caseId, question) {
  const session = await initSession({ caseId, attemptId: `human-fidelity-${caseId}-${question}`, language: "zh" });
  return generatePatientAnswer({ sessionId: session.sessionId, caseId, studentInput: question, conversationHistory: [], language: "zh" });
}

async function main() {
  const missing = await ask("HX-ADD-012", "既往肾病吗？");
  assert.equal(missing.factStates?.previous_kidney_disease, "missing");
  assert.match(missing.replyText, /记不(?:太)?清|不太清楚|没太留意/);
  assert.doesNotMatch(missing.replyText, /可靠的信息|没记录|数据库|病例字段|source fact|needs review/i);

  const treatment = await ask("HX-ADD-010", "以前接受过治疗吗");
  assert.match(treatment.replyText, /口服过抗菌药/);
  assert.doesNotMatch(treatment.replyText, /没特别(?:注意|留意)|这个我.*(?:不清楚|记不清)/);

  const visit = await ask("HX-ADD-014", "以前看过医生吗");
  assert.match(visit.replyText, /去门诊看过/);
  assert.doesNotMatch(visit.replyText, /没特别(?:注意|留意)|这个我.*(?:不清楚|记不清)/);

  const dosage = await ask("HX-ADD-017", "平时用药剂量有吗？");
  assert.equal(dosage.factStates?.medication_dosage, "partially_known");
  assert.doesNotMatch(dosage.replyText, /。、|；、|\n、/);
  assert.match(dosage.replyText, /这些药|阿司匹林.*坦索罗辛/);

  const frequency = await ask("HX-ADD-017", "用药频次有还是没有？");
  assert.equal(frequency.factStates?.medication_frequency, "partially_known");
  assert.doesNotMatch(frequency.replyText, /。、|；、|\n、/);
  assert.ok((frequency.replyText.match(/记不清/g) || []).length <= 1);

  const medicationName = await ask("HX-ADD-014", "平时药物名称有吗？");
  assert.deepEqual(medicationName.answerPlans?.map((plan) => plan.intent), ["medication_name"]);
  assert.ok((medicationName.replyText.match(/记不(?:太)?清/g) || []).length <= 1);

  const hesitancy = await ask("P007", "排尿踌躇这方面怎么样？");
  assert.deepEqual(hesitancy.matchedFacts, ["hesitancy"]);
  assert.doesNotMatch(hesitancy.replyText, /尿频|夜尿|尿潴留|尿线变细|尿分叉/);

  const urineColor = await ask("P012", "平时小便什么颜色？");
  assert.deepEqual(urineColor.matchedFacts, ["urine_color"]);
  assert.match(urineColor.replyText, /茶色|淡红|红色/);
  assert.doesNotMatch(urineColor.replyText, /泡沫/);

  const microscopic = await ask("HX-ADD-017", "平时镜下血尿有吗？");
  assert.deepEqual(microscopic.matchedFacts, ["microscopic_hematuria"]);
  assert.match(microscopic.replyText, /尿检|检查|红细胞/);
  assert.doesNotMatch(microscopic.replyText, /小便能看出红色|肉眼/);

  const gross = await ask("P011", "肉眼能看见尿里有血吗？");
  const microscopicComposite = await ask("P011", "尿检或镜下能查到血吗？");
  assert.deepEqual(gross.matchedFacts, ["gross_hematuria"]);
  assert.deepEqual(microscopicComposite.matchedFacts, ["microscopic_hematuria"]);
  assert.match(gross.replyText, /小便能看出红色/);
  assert.doesNotMatch(gross.replyText, /镜下|红细胞|肾小球/);
  assert.match(microscopicComposite.replyText, /尿检|检查|红细胞/);
  assert.doesNotMatch(microscopicComposite.replyText, /小便能看出红色|肾小球性镜下证据/);

  const frequencyPresenceUnknown = await ask("HX-ADD-023", "有没有尿频？");
  assert.equal(frequencyPresenceUnknown.factStates?.urinary_frequency, "missing");
  assert.match(frequencyPresenceUnknown.replyText, /有没有尿频|是否尿频|会不会尿频|小便次数有没有增多|没太留意/);
  assert.doesNotMatch(frequencyPresenceUnknown.replyText, /具体.*次数|次数.*没(?:有)?数/);

  const painConflict = await ask("P004", "一般疼痛有还是没有？");
  assert.equal(painConflict.clauseOutcomes?.[0]?.status, "blocked_medical");
  assert.doesNotMatch(painConflict.replyText, /什么时候疼/);
  assert.match(painConflict.replyText, /有没有疼|是否疼|有无疼痛|说不准|记不清|没太留意/);

  assert.equal(questionSemanticDepth("urinary_frequency", "有没有尿频？", "zh"), 1);
  assert.equal(questionSemanticDepth("urinary_frequency", "一天小便几次？", "zh"), 3);
  assert.equal(questionSemanticDepth("urine_color", "尿是什么颜色？", "zh"), 2);

  const urinaryQuantity = await ask("P005", "一天小便几次？");
  assert.deepEqual(urinaryQuantity.matchedFacts, ["urinary_frequency"]);
  assert.match(urinaryQuantity.replyText, /具体.*几次.*没数/);
  assert.doesNotMatch(urinaryQuantity.replyText, /^有，小便次数比平时多。$/);

  const unknownSmokingAmount = buildLifestyleAnswerPlan({ status: "unknown" }, "smoking_amount", "zh");
  assert.equal(unknownSmokingAmount.factState, "missing");
  assert.doesNotMatch(unknownSmokingAmount.renderedAnswer, /每天|多少支|抽了多少年/);
  const knownSmokingUnknownAmount = buildLifestyleAnswerPlan({ status: "current" }, "smoking_amount", "zh");
  assert.match(knownSmokingUnknownAmount.renderedAnswer, /每天抽多少支/);

  const occupation = await ask("HX-ADD-003", "有没有职业暴露？");
  assert.match(occupation.replyText, /工作中接触过/);
  assert.doesNotMatch(occupation.replyText, /职业暴露\s*[：:]|工作中接触过工作中接触过/);

  console.log("R5 Patient Human Fidelity gate passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
