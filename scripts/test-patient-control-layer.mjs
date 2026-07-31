import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  RESPONSE_ERROR_CATEGORIES,
  classifyPatientResponseErrors,
  createPatientControlContext
} = require("../server/patientControlLayer.js");

const knownPlan = Object.freeze({
  intent: "smoking_history",
  sourceSlotId: "SMOKING",
  factState: "known_false",
  directAnswer: "没有",
  renderedAnswer: "没有，我不抽烟。"
});
const profile = {
  patient_persona: {
    emotion: { value: "有些担心，但能配合问诊。" },
    health_literacy: { value: "医学知识有限。" },
    memory_reliability: { value: "症状清楚，细节说不清。" },
    cooperation_style: { value: "医生问到具体问题时再回答。" }
  }
};

const control = createPatientControlContext({
  result: { answerPlans: [knownPlan] },
  runtimeProfile: profile,
  language: "zh"
});
assert.equal(control.caseTruth.plans[0], knownPlan, "Case Truth must reuse the governed answer plan rather than copy a second fact model");
assert.equal(control.caseTruth.source, "existing_ontology_and_answer_planner");
assert.equal(control.disclosurePolicy.mode, "question_triggered");
assert.equal(control.disclosurePolicy.granularity, "exact_or_polar");
assert.equal(control.personaStyle.responseLength, "concise");
assert.equal("factState" in control.personaStyle, false, "Persona Style must remain fact-free");
assert.equal("answer" in control.personaStyle, false, "Persona Style must not contain patient answers");

const clean = classifyPatientResponseErrors({
  result: { answerPlans: [knownPlan], replyText: "没有，我不抽烟。", allowedAnswer: "没有，我不抽烟。", safetyFlags: [] },
  language: "zh",
  filter: { hits: [], tooLong: false },
  preservesAnswer: true
});
assert.deepEqual(clean, []);

const errors = classifyPatientResponseErrors({
  result: {
    answerPlans: [knownPlan],
    replyText: "有。我是医生，顺便把诊断和检查结果都告诉你。".repeat(8),
    allowedAnswer: "没有，我不抽烟。",
    safetyFlags: ["ai_response_blocked"]
  },
  contextResolution: { inherited: true },
  language: "zh",
  filter: { hits: ["诊断"], tooLong: true },
  preservesAnswer: false
});
for (const category of ["oversharing", "role_breaking", "off_script", "tangential", "polarity_error"]) {
  assert(errors.includes(category), `${category} must be classified`);
}
assert(errors.every((category) => RESPONSE_ERROR_CATEGORIES.includes(category)));

const wrongUnknown = classifyPatientResponseErrors({
  result: { answerPlans: [{ ...knownPlan, factState: "exact_value" }], replyText: "这个我不清楚。", allowedAnswer: "每天一片。", safetyFlags: [] },
  language: "zh",
  filter: { hits: [], tooLong: false },
  preservesAnswer: false
});
assert(wrongUnknown.includes("wrong_unknown"));

const legitimatePartialUnknown = classifyPatientResponseErrors({
  result: {
    replyText: "I am not sure how often I take it.",
    allowedAnswer: "I am not sure how often I take it.",
    answerPlans: [
      { factState: "exact_value", directAnswer: "valsartan" },
      { factState: "partially_known", directAnswer: "not sure" }
    ]
  },
  contextResolution: { inherited: true },
  language: "en",
  filter: { hits: [], tooLong: false }
});
assert(!legitimatePartialUnknown.includes("wrong_unknown"));

const contextLost = classifyPatientResponseErrors({
  result: { answerPlans: [], replyText: "请再说具体一点。", safetyFlags: [] },
  contextResolution: { inherited: true },
  language: "zh",
  filter: { hits: [], tooLong: false }
});
assert(contextLost.includes("context_lost"));

console.log("Patient Case Truth, Disclosure Policy, Persona Style, and development-only response error taxonomy passed.");
