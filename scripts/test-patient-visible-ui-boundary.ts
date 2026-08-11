import assert from "node:assert/strict";
import { isUnsafePatientReply } from "../src/components/ClinicalTrainingClient";

type Probe = {
  id: string;
  question: string;
  reply: string;
  matchedFacts?: string[];
  matchedSlotIds?: string[];
  unsafe: boolean;
};

const probes: Probe[] = [
  {
    id: "hypertension-diabetes-medication-compound",
    question: "有没有高血压、糖尿病，平时吃什么药？",
    reply: "有高血压。没有糖尿病。我长期服用缬沙坦、阿司匹林。",
    matchedFacts: ["hypertension_history", "medication_name", "diabetes_history", "medication_list"],
    matchedSlotIds: ["PAST_HYPERTENSION", "MED_ALL", "PAST_DIABETES"],
    unsafe: false
  },
  {
    id: "smoking-alcohol-compound",
    question: "抽烟吗，喝不喝酒？",
    reply: "我吸烟，也喝酒。",
    matchedFacts: ["smoking_history", "alcohol_history"],
    matchedSlotIds: ["LIFE_SMOKING", "LIFE_ALCOHOL"],
    unsafe: false
  },
  {
    id: "urine-color-clot-compound",
    question: "尿是什么颜色，有没有血块？",
    reply: "尿是洗肉水样，没有看到血块。",
    matchedFacts: ["urine_color", "blood_clots"],
    matchedSlotIds: ["urine_color", "clots"],
    unsafe: false
  },
  {
    id: "hematuria-phase-color-compound",
    question: "血尿是全程的吗，尿什么颜色？",
    reply: "全程都是洗肉水样。",
    matchedFacts: ["hematuria_phase", "urine_color"],
    matchedSlotIds: ["hematuria_phase", "urine_color"],
    unsafe: false
  },
  {
    id: "urinary-symptom-compound",
    question: "有没有尿频尿急尿痛？",
    reply: "有尿频，没有尿急，也不尿痛。",
    matchedFacts: ["urinary_frequency", "urinary_urgency", "dysuria"],
    matchedSlotIds: ["urinary_frequency", "urinary_urgency", "dysuria"],
    unsafe: false
  },
  {
    id: "surgery-urinary-procedure-compound",
    question: "做过手术或者导过尿吗？",
    reply: "这点我记不太清了。\n以前没有做过导尿、膀胱镜等泌尿操作。",
    matchedFacts: ["surgery_history", "urinary_procedure_history"],
    matchedSlotIds: ["PAST_SURGERY", "PAST_URINARY_PROCEDURE"],
    unsafe: false
  },
  {
    id: "grounded-public-fact-authorizes-compound-clause",
    question: "有高血压吗？",
    reply: "有高血压，没有糖尿病。",
    matchedFacts: ["hypertension_history", "diabetes_history"],
    matchedSlotIds: ["PAST_HYPERTENSION", "PAST_DIABETES"],
    unsafe: false
  },
  {
    id: "hypertension-does-not-authorize-diabetes",
    question: "有高血压吗？",
    reply: "有高血压，没有糖尿病。",
    matchedFacts: ["hypertension_history"],
    matchedSlotIds: ["PAST_HYPERTENSION"],
    unsafe: true
  },
  {
    id: "smoking-does-not-authorize-alcohol",
    question: "抽烟吗？",
    reply: "我吸烟，也喝酒。",
    matchedFacts: ["smoking_history"],
    matchedSlotIds: ["LIFE_SMOKING"],
    unsafe: true
  },
  {
    id: "urine-color-does-not-authorize-imaging",
    question: "尿什么颜色？",
    reply: "尿是鲜红色，后来还做了CT。",
    matchedFacts: ["urine_color"],
    matchedSlotIds: ["urine_color"],
    unsafe: true
  },
  {
    id: "urine-color-does-not-authorize-cystoscopy",
    question: "尿什么颜色？",
    reply: "尿是鲜红色，后来还做了膀胱镜。",
    matchedFacts: ["urine_color"],
    matchedSlotIds: ["urine_color"],
    unsafe: true
  },
  {
    id: "urine-color-does-not-authorize-clot",
    question: "尿什么颜色？",
    reply: "尿是鲜红色，还有血块。",
    matchedFacts: ["urine_color"],
    matchedSlotIds: ["urine_color"],
    unsafe: true
  },
  {
    id: "clot-does-not-authorize-color-or-phase",
    question: "有没有血块？",
    reply: "有血块，尿色鲜红，而且全程都是红的。",
    matchedFacts: ["blood_clots"],
    matchedSlotIds: ["clots"],
    unsafe: true
  },
  {
    id: "json-control-envelope",
    question: "查过尿吗？",
    reply: "{\"currentAllowedAnswer\":\"之前没有做过检查。\"}",
    unsafe: true
  }
];

for (const probe of probes) {
  assert.equal(
    isUnsafePatientReply(probe.question, probe.reply, "zh", probe.matchedFacts, probe.matchedSlotIds),
    probe.unsafe,
    probe.id
  );
}

for (const reply of [
  "allowedAnswer: 之前没有做过检查。",
  "currentAllowedAnswer：之前没有做过检查。",
  "matchedFacts=[prior_investigations]",
  "provenance: patient_allowlist",
  "classifier: accepted",
  "intent: prior_investigation",
  "replyText: 之前没有做过检查。",
  "provider: local",
  '说明如下：\n{"replyText":"之前没有做过检查。"}',
  'Here is the answer:\n["之前没有做过检查。"]',
  '说明如下：\n{"role":"assistant","content":"之前没有做过检查。"}',
  'Here is ["之前没有做过检查。"]',
  'Plain prefix ["之前没有做过检查。"] suffix'
]) {
  assert.equal(isUnsafePatientReply("查过尿吗？", reply, "zh"), true, `control envelope leaked: ${reply}`);
}

assert.equal(isUnsafePatientReply("查过尿吗？", "之前没有做过检查。", "zh"), false);

console.log(`Patient-visible UI boundary passed: ${probes.length} scope probes, 13 control envelopes.`);
