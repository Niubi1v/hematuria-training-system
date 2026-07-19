import assert from "node:assert/strict";

const cases = require("../data/cases.json") as Array<{ id: string; structuredHistory?: unknown }>;
const { matchCanonicalPatientFacts } = require("../server/canonicalFacts.js") as {
  matchCanonicalPatientFacts(caseId: string, question: string, language: "zh" | "en"): { matchedSlotIds?: string[] } | null;
};
const { matchStructuredFacts } = require("../server/structuredFacts.js") as {
  matchStructuredFacts(caseData: unknown, question: string, language: "zh" | "en"): { matchedSlotIds?: string[] } | null;
};

type Probe = { id: string; language: "zh" | "en"; question: string; expectedSlot: string };

// Natural paraphrases intentionally avoid exact catalog labels. They exercise
// colloquial wording without changing, inferring, or defaulting any case fact.
const probes: Probe[] = [
  { id: "frequency-colloquial-zh", language: "zh", question: "最近总跑厕所小便吗？", expectedSlot: "urinary_frequency" },
  { id: "urgency-colloquial-zh", language: "zh", question: "尿来了会等不了吗？", expectedSlot: "urinary_urgency" },
  { id: "nocturia-colloquial-zh", language: "zh", question: "夜里要尿几回？", expectedSlot: "voiding_difficulty" },
  { id: "voiding-difficulty-zh", language: "zh", question: "排尿费不费劲？", expectedSlot: "voiding_difficulty" },
  { id: "incomplete-emptying-zh", language: "zh", question: "尿完总觉得膀胱没排空吗？", expectedSlot: "voiding_difficulty" },
  { id: "retention-colloquial-zh", language: "zh", question: "有没有憋得难受却尿不出？", expectedSlot: "retention" },
  { id: "urine-color-colloquial-zh", language: "zh", question: "小便看起来是什么色的？", expectedSlot: "urine_color" },
  { id: "fever-colloquial-zh", language: "zh", question: "这几天有没有烧？", expectedSlot: "fever_chills" },
  { id: "smoking-amount-zh", language: "zh", question: "一天抽多少根？", expectedSlot: "LIFE_SMOKING" },
  { id: "exposure-hairdye-zh", language: "zh", question: "工作中接触过染发剂吗？", expectedSlot: "LIFE_EXPOSURE" },
  { id: "anticoagulant-colloquial-zh", language: "zh", question: "吃过让血变稀的药吗？", expectedSlot: "MED_ANTICOAGULANT" },
  { id: "urgency-colloquial-en", language: "en", question: "Do you have to rush to the bathroom?", expectedSlot: "urinary_urgency" },
  { id: "nocturia-colloquial-en", language: "en", question: "How many times do you wake to pee overnight?", expectedSlot: "voiding_difficulty" },
  { id: "clots-colloquial-en", language: "en", question: "Any lumps of blood in your pee?", expectedSlot: "clots" },
  { id: "urine-color-colloquial-en", language: "en", question: "What color does your pee look?", expectedSlot: "urine_color" },
  { id: "foamy-colloquial-en", language: "en", question: "Does your pee look bubbly?", expectedSlot: "glomerular_features" },
  { id: "edema-colloquial-en", language: "en", question: "Any puffiness around your eyes?", expectedSlot: "glomerular_features" },
  { id: "weak-stream-colloquial-en", language: "en", question: "Is the flow of urine weaker?", expectedSlot: "voiding_difficulty" },
  { id: "incomplete-emptying-en", language: "en", question: "Do you still feel you need to go after peeing?", expectedSlot: "voiding_difficulty" },
  { id: "smoking-amount-en", language: "en", question: "How many cigarettes do you have per day?", expectedSlot: "LIFE_SMOKING" },
  { id: "occupation-colloquial-en", language: "en", question: "What do you do for a living?", expectedSlot: "LIFE_OCCUPATION" },
  { id: "exposure-rubber-en", language: "en", question: "Did you work around rubber or leather?", expectedSlot: "LIFE_EXPOSURE" },
  { id: "anticoagulant-colloquial-en", language: "en", question: "Do you take blood thinners?", expectedSlot: "MED_ANTICOAGULANT" },
  { id: "anticoagulant-apixaban-en", language: "en", question: "Are you taking apixaban?", expectedSlot: "MED_ANTICOAGULANT" }
];

assert.equal(cases.length, 42, "priority paraphrase routing must cover all 42 cases");
let hits = 0;
const failures: string[] = [];
for (const caseData of cases) {
  for (const probe of probes) {
    const matched = matchCanonicalPatientFacts(caseData.id, probe.question, probe.language)
      || matchStructuredFacts(caseData, probe.question, probe.language);
    if (matched?.matchedSlotIds?.includes(probe.expectedSlot)) hits += 1;
    else failures.push(`${caseData.id}/${probe.id}: expected ${probe.expectedSlot}, got ${matched?.matchedSlotIds?.join(",") || "none"}`);
  }
}

const total = cases.length * probes.length;
console.log(`PATIENT_PRIORITY_PARAPHRASE_EVIDENCE ${JSON.stringify({ cases: cases.length, probes: probes.length, total, hits, hitRate: Number((hits / total).toFixed(4)), failures: failures.length })}`);
assert.deepEqual(failures, [], `priority paraphrase failures (${failures.length}):\n${failures.slice(0, 30).join("\n")}`);
