import assert from "node:assert/strict";

const cases = require("../data/cases.json") as Array<{ id: string; structuredHistory?: unknown }>;
const { matchCanonicalPatientFacts } = require("../server/canonicalFacts.js") as {
  matchCanonicalPatientFacts(caseId: string, question: string, language: "zh" | "en"): {
    matchedSlotIds?: string[];
    matchedFacts?: string[];
  } | null;
};
const { matchStructuredFacts } = require("../server/structuredFacts.js") as {
  matchStructuredFacts(caseData: unknown, question: string, language: "zh" | "en"): { matchedSlotIds?: string[] } | null;
};
const { matchPriorityCanonicalIntents } = require("../src/lib/patientIntentCatalog.js") as {
  matchPriorityCanonicalIntents(question: string, language: "zh" | "en"): Array<{ intentKey: string }>;
};

type Probe = {
  id: string;
  language: "zh" | "en";
  question: string;
  expectedSlot?: string;
  expectedSlots?: string[];
  expectedFacts?: string[];
  forbiddenSlots?: string[];
  qaNatural?: boolean;
};

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
  { id: "anticoagulant-apixaban-en", language: "en", question: "Are you taking apixaban?", expectedSlot: "MED_ANTICOAGULANT" },
  { id: "qa-dysuria-colloquial-zh", language: "zh", question: "小便痛不痛？", expectedSlots: ["dysuria"], expectedFacts: ["dysuria"], qaNatural: true },
  { id: "qa-dysuria-colloquial-en", language: "en", question: "Does it hurt when you urinate?", expectedSlots: ["dysuria"], expectedFacts: ["dysuria"], qaNatural: true },
  { id: "qa-dysuria-formal-zh", language: "zh", question: "排尿时疼吗？", expectedSlots: ["dysuria"], expectedFacts: ["dysuria"], qaNatural: true },
  { id: "qa-dysuria-formal-en", language: "en", question: "Is urination painful?", expectedSlots: ["dysuria"], expectedFacts: ["dysuria"], qaNatural: true },
  { id: "qa-dysuria-natural-zh", language: "zh", question: "尿的时候会不会痛？", expectedSlots: ["dysuria"], expectedFacts: ["dysuria"], qaNatural: true },
  { id: "qa-dysuria-natural-en", language: "en", question: "Does it hurt when you pee?", expectedSlots: ["dysuria"], expectedFacts: ["dysuria"], qaNatural: true },
  { id: "qa-dysuria-negated-zh", language: "zh", question: "没有尿痛吧？", expectedSlots: ["dysuria"], expectedFacts: ["dysuria"], qaNatural: true },
  { id: "qa-dysuria-negated-en", language: "en", question: "You do not have pain when urinating, right?", expectedSlots: ["dysuria"], expectedFacts: ["dysuria"], qaNatural: true },
  { id: "qa-phase-whole-zh", language: "zh", question: "小便全程都是红的吗？", expectedSlots: ["hematuria_phase"], expectedFacts: ["whole_stream_hematuria"], qaNatural: true },
  { id: "qa-phase-whole-en", language: "en", question: "Is the urine red throughout the whole stream?", expectedSlots: ["hematuria_phase"], expectedFacts: ["whole_stream_hematuria"], qaNatural: true },
  { id: "qa-phase-start-to-end-zh", language: "zh", question: "从开始尿到最后都红吗？", expectedSlots: ["hematuria_phase"], expectedFacts: ["whole_stream_hematuria"], qaNatural: true },
  {
    id: "whole-stream-start-to-end-en",
    language: "en",
    question: "Is it red from the start to the end of urination?",
    expectedSlots: ["hematuria_phase"],
    expectedFacts: ["whole_stream_hematuria"],
    qaNatural: true
  },
  {
    id: "phase-choice-zh",
    language: "zh",
    question: "是刚开始红、最后红，还是全程红？",
    expectedSlots: ["hematuria_phase"],
    expectedFacts: ["initial_hematuria", "terminal_hematuria", "whole_stream_hematuria"],
    qaNatural: true
  },
  {
    id: "phase-choice-en",
    language: "en",
    question: "Is it red at the beginning, at the end, or throughout urination?",
    expectedSlots: ["hematuria_phase"],
    expectedFacts: ["initial_hematuria", "terminal_hematuria", "whole_stream_hematuria"],
    qaNatural: true
  },
  {
    id: "qa-phase-negated-terminal-zh",
    language: "zh",
    question: "不是只有最后才红吧？",
    expectedSlots: ["hematuria_phase"],
    expectedFacts: ["terminal_hematuria", "whole_stream_hematuria"],
    qaNatural: true
  },
  {
    id: "phase-negated-terminal-en",
    language: "en",
    question: "It is not only red at the end of urination, right?",
    expectedSlots: ["hematuria_phase"],
    expectedFacts: ["terminal_hematuria", "whole_stream_hematuria"],
    qaNatural: true
  },
  {
    id: "qa-lower-urinary-compound-zh",
    language: "zh",
    question: "尿频尿急尿痛有没有？",
    expectedSlots: ["urinary_frequency", "urinary_urgency", "dysuria"],
    expectedFacts: ["urinary_frequency", "urinary_urgency", "dysuria"],
    forbiddenSlots: ["pain"],
    qaNatural: true
  },
  {
    id: "lower-urinary-compound-en",
    language: "en",
    question: "Do you have urinary frequency, urgency, or pain when urinating?",
    expectedSlots: ["urinary_frequency", "urinary_urgency", "dysuria"],
    expectedFacts: ["urinary_frequency", "urinary_urgency", "dysuria"],
    forbiddenSlots: ["pain"],
    qaNatural: true
  },
  {
    id: "qa-red-flag-compound-zh",
    language: "zh",
    question: "有没有腰痛、发烧和血块？",
    expectedSlots: ["flank_pain", "fever_chills", "clots"],
    expectedFacts: ["flank_pain", "fever", "blood_clots"],
    forbiddenSlots: ["pain"],
    qaNatural: true
  },
  {
    id: "red-flag-compound-en",
    language: "en",
    question: "Do you have flank pain, fever, or blood clots?",
    expectedSlots: ["flank_pain", "fever_chills", "clots"],
    expectedFacts: ["flank_pain", "fever", "blood_clots"],
    forbiddenSlots: ["pain"],
    qaNatural: true
  }
];

assert.equal(cases.length, 42, "priority paraphrase routing must cover all 42 cases");
let hits = 0;
let qaNaturalHits = 0;
let qaNaturalIntentChecks = 0;
let qaNaturalIntentHits = 0;
const failures: string[] = [];
for (const caseData of cases) {
  for (const probe of probes) {
    const matched = matchCanonicalPatientFacts(caseData.id, probe.question, probe.language)
      || matchStructuredFacts(caseData, probe.question, probe.language);
    const expectedSlots = probe.expectedSlots || (probe.expectedSlot ? [probe.expectedSlot] : []);
    const matchedSlots = matched?.matchedSlotIds || [];
    const matchedFacts = (matched as { matchedFacts?: string[] } | null)?.matchedFacts || [];
    const routedFacts = matchPriorityCanonicalIntents(probe.question, probe.language).map((item) => item.intentKey);
    const missingSlots = expectedSlots.filter((slot) => !matchedSlots.includes(slot));
    const missingFacts = (probe.expectedFacts || []).filter((fact) => !routedFacts.includes(fact));
    const forbiddenSlots = (probe.forbiddenSlots || []).filter((slot) => matchedSlots.includes(slot));
    if (probe.qaNatural) {
      qaNaturalIntentChecks += probe.expectedFacts?.length || 0;
      qaNaturalIntentHits += (probe.expectedFacts || []).filter((fact) => routedFacts.includes(fact)).length;
    }
    if (!missingSlots.length && !missingFacts.length && !forbiddenSlots.length) {
      hits += 1;
      if (probe.qaNatural) qaNaturalHits += 1;
    }
    else failures.push(
      `${caseData.id}/${probe.id}: missingSlots=${missingSlots.join(",") || "none"} `
      + `missingFacts=${missingFacts.join(",") || "none"} forbiddenSlots=${forbiddenSlots.join(",") || "none"} `
      + `gotSlots=${matchedSlots.join(",") || "none"} gotFacts=${matchedFacts.join(",") || "none"} `
      + `routedFacts=${routedFacts.join(",") || "none"}`
    );
  }
}

const total = cases.length * probes.length;
const qaNaturalTotal = cases.length * probes.filter((probe) => probe.qaNatural).length;
console.log(`PATIENT_PRIORITY_PARAPHRASE_EVIDENCE ${JSON.stringify({
  cases: cases.length,
  probes: probes.length,
  total,
  hits,
  hitRate: Number((hits / total).toFixed(4)),
  qaNaturalTotal,
  qaNaturalHits,
  qaNaturalIntentChecks,
  qaNaturalIntentHits,
  failures: failures.length
})}`);
assert.deepEqual(failures, [], `priority paraphrase failures (${failures.length}):\n${failures.slice(0, 30).join("\n")}`);
