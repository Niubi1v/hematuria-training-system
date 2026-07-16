import assert from "node:assert/strict";

process.env.TRAINING_STATE_SECRET = "test-only-intent-normalization-secret-with-adequate-length";
process.env.LLM_ENABLE_AI_PATIENT = "false";

const { matchCanonicalPatientFacts } = require("../server/canonicalFacts.js") as {
  matchCanonicalPatientFacts(caseId: string, question: string, language: "zh" | "en"): null | {
    matchedSlotIds: string[];
    matchedFacts: string[];
    factValues?: Record<string, boolean | string>;
  };
};
const { generatePatientAnswer, initSession } = require("../server/patientSession.js") as {
  initSession(input: { caseId: string; attemptId: string; language: "zh" | "en" }): Promise<{ sessionId: string }>;
  generatePatientAnswer(input: { sessionId: string; caseId: string; studentInput: string; language: "zh" | "en" }): Promise<{
    replyText: string;
    matchedSlotIds?: string[];
    matchedFacts?: string[];
    fallbackReason?: string;
  }>;
};

type Language = "zh" | "en";
type ExpectedValue = boolean | "unknown";
type Probe = {
  caseId: string;
  language: Language;
  intent: string;
  sourceSlot: string;
  expectedValue: ExpectedValue;
  question: string;
};

const dysuriaZh = [
  "尿痛吗？", "小便痛不痛？", "排尿疼吗？", "尿的时候疼不疼？", "撒尿会痛吗？",
  "小便时烧不烧？", "没有尿痛吧？", "解小便时痛吗？", "小便有没有不舒服？",
  "小便不痛吗？", "尿的时候会不会痛？", "有还是没有尿痛？", "排尿时有烧灼感吗？"
];
const dysuriaEn = [
  "Does it hurt to pee?", "Any burning when urinating?", "Is urination painful?",
  "Do you have pain passing urine?", "No dysuria, right?", "Does it sting when you pee?"
];
const wholeStreamZh = [
  "全程血尿吗？", "小便全程都是红的吗？", "从头到尾都红吗？", "整个小便过程都红吗？",
  "从开始尿到最后都红吗？", "一开始到尿完都红吗？", "是不是整泡尿都红？",
  "是全程还是刚开始红？", "是全程还是最后红？", "不是只有最后才红吧？",
  "是刚开始红，还是全程红？", "是全程红，还是最后才红？"
];
const wholeStreamEn = [
  "Is it red throughout?", "Is it red from start to finish?", "Is the whole stream red?",
  "Is all of the urine red?", "Is there blood throughout the entire stream?"
];
const initialZh = ["是刚开始尿的时候红吗？", "是不是只有一开始红？", "起始血尿吗？", "刚尿出来就红吗？"];
const initialEn = ["Is the blood only at the beginning?", "Is it initial hematuria?", "Does it start red and then clear?"];
const terminalZh = ["是最后才红吗？", "快尿完的时候红吗？", "终末血尿吗？", "不是只有最后才红吧？"];
const terminalEn = ["Is it red only at the end?", "Is it terminal hematuria?", "Does it turn red near the end?"];

const probes: Probe[] = [];
function add(caseId: string, language: Language, intent: string, sourceSlot: string, expectedValue: ExpectedValue, questions: string[]) {
  for (const question of questions) probes.push({ caseId, language, intent, sourceSlot, expectedValue, question });
}

add("P005", "zh", "dysuria", "dysuria", true, dysuriaZh);
add("P005", "en", "dysuria", "dysuria", true, dysuriaEn);
add("P002", "zh", "dysuria", "dysuria", false, dysuriaZh);
add("P002", "en", "dysuria", "dysuria", false, dysuriaEn);
add("P002", "zh", "whole_stream_hematuria", "hematuria_phase", true, wholeStreamZh);
add("P002", "en", "whole_stream_hematuria", "hematuria_phase", true, wholeStreamEn);
add("HX-ADD-006", "zh", "whole_stream_hematuria", "hematuria_phase", false, wholeStreamZh);
add("HX-ADD-006", "en", "whole_stream_hematuria", "hematuria_phase", false, wholeStreamEn);
add("P002", "zh", "initial_hematuria", "hematuria_phase", false, initialZh);
add("P002", "en", "initial_hematuria", "hematuria_phase", false, initialEn);
add("HX-ADD-006", "zh", "terminal_hematuria", "hematuria_phase", true, terminalZh);
add("HX-ADD-006", "en", "terminal_hematuria", "hematuria_phase", true, terminalEn);

function isUnknown(text: string, language: Language) {
  return language === "en"
    ? /not sure|do not know|don't know|did not notice|didn't notice/i.test(text)
    : /不太清楚|不清楚|说不准|没注意|没有注意|不明白/.test(text);
}

function hasExpectedPolarity(text: string, language: Language, value: ExpectedValue) {
  if (value === "unknown") return isUnknown(text, language);
  if (language === "en") return value
    ? /^(yes\b|it does\b|it is\b|there is\b|i do\b)/i.test(text)
    : /^(no\b|it does not\b|it doesn't\b|it is not\b|i do not\b|i don't\b)/i.test(text);
  return value ? /^(有|是|会)/.test(text) : /^(没有|不|不是|不会)/.test(text);
}

async function main() {
  const sessions = new Map<string, string>();
  const failures: string[] = [];
  let canonicalHits = 0;
  let erroneousUnknowns = 0;
  let polarityErrors = 0;

  for (const probe of probes) {
    const key = `${probe.caseId}:${probe.language}`;
    if (!sessions.has(key)) {
      const session = await initSession({ caseId: probe.caseId, attemptId: `intent-${key}`, language: probe.language });
      sessions.set(key, session.sessionId);
    }
    const matched = matchCanonicalPatientFacts(probe.caseId, probe.question, probe.language);
    const matchedIntent = matched?.matchedFacts?.includes(probe.intent) === true;
    const matchedSource = matched?.matchedSlotIds?.includes(probe.sourceSlot) === true;
    const factValue = matched?.factValues?.[probe.intent];
    if (matchedIntent && matchedSource) canonicalHits += 1;
    else failures.push(`${key} did not map '${probe.question}' to ${probe.intent}/${probe.sourceSlot}`);
    if (factValue !== probe.expectedValue) failures.push(`${key} '${probe.question}' factValue=${String(factValue)} expected=${String(probe.expectedValue)}`);

    const answer = await generatePatientAnswer({
      sessionId: sessions.get(key)!,
      caseId: probe.caseId,
      studentInput: probe.question,
      language: probe.language
    });
    if (probe.expectedValue !== "unknown" && isUnknown(answer.replyText, probe.language)) {
      erroneousUnknowns += 1;
      failures.push(`${key} '${probe.question}' incorrectly answered unknown: ${answer.fallbackReason || "no_reason"}`);
    }
    const expectedAnswerValue = probe.intent === "terminal_hematuria" && /不是只有最后/.test(probe.question)
      ? false
      : probe.expectedValue;
    if (!hasExpectedPolarity(answer.replyText, probe.language, expectedAnswerValue)) {
      polarityErrors += 1;
      failures.push(`${key} '${probe.question}' answer polarity mismatch`);
    }
  }

  for (const language of ["zh", "en"] as const) {
    const key = `P001:${language}`;
    const session = await initSession({ caseId: "P001", attemptId: `intent-conflict-${language}`, language });
    const conflictQuestion = language === "en" ? "Does it hurt to pee?" : "小便痛不痛？";
    const conflict = await generatePatientAnswer({ sessionId: session.sessionId, caseId: "P001", studentInput: conflictQuestion, language });
    if (conflict.fallbackReason !== "medical_bilingual_conflict_pending_review" || conflict.matchedSlotIds?.length) {
      failures.push(`${key} bilingual conflict escaped quarantine`);
    }
  }

  const compoundSession = await initSession({ caseId: "P005", attemptId: "intent-compound", language: "zh" });
  const compound = await generatePatientAnswer({
    sessionId: compoundSession.sessionId,
    caseId: "P005",
    studentInput: "尿频尿急尿痛有没有？",
    language: "zh"
  });
  for (const intent of ["urinary_frequency", "urinary_urgency", "dysuria"]) {
    if (!compound.matchedFacts?.includes(intent)) failures.push(`compound question dropped ${intent}`);
  }
  if (isUnknown(compound.replyText, "zh")) failures.push("compound known facts incorrectly answered unknown");

  const summary = {
    totalQuestions: probes.length,
    canonicalHits,
    canonicalHitRate: Number((canonicalHits / probes.length).toFixed(4)),
    erroneousUnknowns,
    erroneousUnknownRate: Number((erroneousUnknowns / probes.length).toFixed(4)),
    polarityErrors,
    polarityErrorRate: Number((polarityErrors / probes.length).toFixed(4)),
    compoundComplete: ["urinary_frequency", "urinary_urgency", "dysuria"].every((intent) => compound.matchedFacts?.includes(intent)),
    failures: failures.length
  };
  console.log(`PATIENT_INTENT_NORMALIZATION_EVIDENCE ${JSON.stringify(summary)}`);
  assert.deepEqual(failures, [], `patient intent normalization failures (${failures.length}):\n${failures.slice(0, 25).join("\n")}`);
}

void main();
