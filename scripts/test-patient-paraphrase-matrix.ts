import assert from "node:assert/strict";

process.env.TRAINING_STATE_SECRET = "test-only-paraphrase-matrix-secret-with-adequate-length";
process.env.LLM_ENABLE_AI_PATIENT = "false";

const publicCases = require("../data/cases_public.json") as Array<{ id: string; displayCaseId?: string }>;
const { matchCanonicalPatientFacts } = require("../server/canonicalFacts.js") as {
  matchCanonicalPatientFacts(caseId: string, question: string, language: "zh" | "en"): null | {
    matchedSlotIds: string[];
    matchedFacts: string[];
    factValues: Record<string, boolean | "unknown">;
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
const { isBilingualConflict } = require("../server/bilingualConflictQuarantine.js") as {
  isBilingualConflict(caseId: string, field: string): boolean;
};

type Language = "zh" | "en";
type Value = boolean | "unknown";
type IntentContract = {
  intent: string;
  sourceSlot: string;
  questions: Record<Language, string[]>;
  forbidden: RegExp;
};

const contracts: IntentContract[] = [
  {
    intent: "dysuria",
    sourceSlot: "dysuria",
    questions: {
      zh: ["尿痛吗？", "小便痛不痛？", "没有尿痛吧？"],
      en: ["Does it hurt to pee?", "No dysuria, right?"]
    },
    forbidden: /尿频|尿急|血块|全程|终末|frequency|urgency|clot|throughout|terminal/i
  },
  {
    intent: "whole_stream_hematuria",
    sourceSlot: "hematuria_phase",
    questions: {
      zh: ["全程血尿吗？", "从头到尾都红吗？", "整个排尿过程都是红的吗？"],
      en: ["Is it red throughout?", "Is it red from start to finish?"]
    },
    forbidden: /血块|尿痛|尿频|尿急|clot|dysuria|frequency|urgency/i
  },
  {
    intent: "initial_hematuria",
    sourceSlot: "hematuria_phase",
    questions: {
      zh: ["起始血尿吗？", "是不是只有一开始红？", "刚尿出来就红吗？"],
      en: ["Is it initial hematuria?", "Is the blood only at the beginning?"]
    },
    forbidden: /血块|尿痛|尿频|尿急|clot|dysuria|frequency|urgency/i
  },
  {
    intent: "terminal_hematuria",
    sourceSlot: "hematuria_phase",
    questions: {
      zh: ["终末血尿吗？", "是最后才红吗？", "快尿完的时候红吗？"],
      en: ["Is it terminal hematuria?", "Does it turn red near the end?"]
    },
    forbidden: /血块|尿痛|尿频|尿急|clot|dysuria|frequency|urgency/i
  },
  {
    intent: "urinary_frequency", sourceSlot: "urinary_frequency",
    questions: { zh: ["有尿频吗？", "小便次数多不多？", "是不是老想上厕所？"], en: ["Do you urinate more often?", "Any urinary frequency?"] },
    forbidden: /尿急|尿痛|血块|urgency|dysuria|clot/i
  },
  {
    intent: "urinary_urgency", sourceSlot: "urinary_urgency",
    questions: { zh: ["有尿急吗？", "一有尿意就憋不住吗？", "会不会来不及上厕所？"], en: ["Any urinary urgency?", "Do you get a sudden urge to pee?"] },
    forbidden: /尿频|尿痛|血块|frequency|dysuria|clot/i
  },
  {
    intent: "blood_clots", sourceSlot: "clots",
    questions: { zh: ["有血块吗？", "尿里有没有血凝块？", "小便里有血疙瘩吗？"], en: ["Any blood clots?", "Do you see clots in the urine?"] },
    forbidden: /尿痛|尿频|尿急|全程|终末|dysuria|frequency|urgency|throughout|terminal/i
  },
  {
    intent: "flank_pain", sourceSlot: "flank_pain",
    questions: { zh: ["有腰痛吗？", "腰侧疼不疼？", "肾区会痛吗？"], en: ["Any flank pain?", "Does the side of your back hurt?"] },
    forbidden: /尿痛|尿频|尿急|血块|dysuria|frequency|urgency|clot/i
  },
  {
    intent: "fever", sourceSlot: "fever_chills",
    questions: { zh: ["有发热吗？", "最近发烧没有？", "体温高不高？"], en: ["Any fever?", "Have you had a high temperature?"] },
    forbidden: /腰痛|尿痛|尿频|尿急|血块|flank|dysuria|frequency|urgency|clot/i
  },
  {
    intent: "foamy_urine", sourceSlot: "glomerular_features",
    questions: { zh: ["有泡沫尿吗？", "尿里泡沫多不多？", "小便会不会很多泡？"], en: ["Any foamy urine?", "Does your urine look frothy?"] },
    forbidden: /水肿|眼睑|腿肿|edema|oedema|swelling/i
  },
  {
    intent: "edema", sourceSlot: "glomerular_features",
    questions: { zh: ["有水肿吗？", "眼皮会肿吗？", "腿脚有没有肿？"], en: ["Any edema?", "Have your legs or eyes been swollen?"] },
    forbidden: /泡沫尿|尿.*泡沫|foamy|frothy/i
  },
  {
    intent: "weak_stream", sourceSlot: "voiding_difficulty",
    questions: { zh: ["尿线细吗？", "小便流得有没有变弱？", "是不是尿得没劲？"], en: ["Is your urine stream weak?", "Any weak urinary flow?"] },
    forbidden: /尿不尽|尿潴留|夜尿|incomplete|retention|nocturia/i
  },
  {
    intent: "incomplete_emptying", sourceSlot: "voiding_difficulty",
    questions: { zh: ["有尿不尽吗？", "尿完还觉得有尿吗？", "小便能不能排干净？"], en: ["Any incomplete emptying?", "Does your bladder still feel full after urinating?"] },
    forbidden: /尿线|尿潴留|夜尿|weak stream|retention|nocturia/i
  },
  {
    intent: "urinary_retention", sourceSlot: "retention",
    questions: { zh: ["有尿潴留吗？", "有没有完全尿不出来过？", "会不会憋着一点尿不出？"], en: ["Any urinary retention?", "Have you ever been unable to pass urine?"] },
    forbidden: /尿线|尿不尽|夜尿|weak stream|incomplete|nocturia/i
  },
  {
    intent: "nocturia", sourceSlot: "voiding_difficulty",
    questions: { zh: ["有夜尿吗？", "晚上要起夜小便吗？", "一晚上起来尿几次？"], en: ["Any nocturia?", "Do you get up at night to urinate?"] },
    forbidden: /尿线|尿不尽|尿潴留|weak stream|incomplete|retention/i
  }
];

function unknown(text: string, language: Language) {
  return language === "en"
    ? /not sure|did not clearly notice|have not been able to say|do not know|have not (?:kept|paid|counted)|did not (?:look|measure)|cannot say for sure/i.test(text)
    : /说不准|没仔细看|不太清楚|不清楚|没注意|没有注意|没特别注意|没有数清|没有量清|没特别留意|没有数过/.test(text);
}

function polarity(text: string, language: Language, value: Exclude<Value, "unknown">) {
  if (language === "en") return value
    ? /^(yes\b|it does\b|it is\b|there is\b|i do\b)/i.test(text)
    : /^(no\b|it does not\b|it doesn't\b|it is not\b|i do not\b|i don't\b)/i.test(text);
  return value ? /^(有|是|会)/.test(text) : /^(没有|不|不是|不会)/.test(text);
}

async function main() {
  assert.equal(publicCases.length, 42);
  const failures: string[] = [];
  const sessions = new Map<string, string>();
  const values = new Map<string, Value>();
  let totalQuestions = 0;
  let canonicalHits = 0;
  let knownAnswers = 0;
  let correctUnknowns = 0;
  let erroneousUnknowns = 0;
  let polarityErrors = 0;
  let quarantineAnswers = 0;
  const originalWarn = console.warn;
  console.warn = () => undefined;

  try {
    for (const caseData of publicCases) {
      const displayId = caseData.displayCaseId || caseData.id;
      for (const contract of contracts) {
        for (const language of ["zh", "en"] as const) {
          const sessionKey = `${caseData.id}:${language}`;
          if (!sessions.has(sessionKey)) {
            const session = await initSession({ caseId: caseData.id, attemptId: `paraphrase-${sessionKey}`, language });
            sessions.set(sessionKey, session.sessionId);
          }
          for (const question of contract.questions[language]) {
            totalQuestions += 1;
            const matched = matchCanonicalPatientFacts(caseData.id, question, language);
            const value = matched?.factValues?.[contract.intent];
            if (matched?.matchedSlotIds.includes(contract.sourceSlot) && matched.matchedFacts.includes(contract.intent)) canonicalHits += 1;
            else failures.push(`${displayId}/${language}/${contract.intent}/${question}: canonical miss`);
            if (value !== true && value !== false && value !== "unknown") failures.push(`${displayId}/${language}/${contract.intent}/${question}: invalid fact value`);

            const valueKey = `${caseData.id}:${contract.intent}`;
            if (!values.has(valueKey)) values.set(valueKey, value as Value);
            else if (values.get(valueKey) !== value) failures.push(`${displayId}/${contract.intent}/${question}: language/query fact value drift`);

            const answer = await generatePatientAnswer({
              sessionId: sessions.get(sessionKey)!,
              caseId: caseData.id,
              studentInput: question,
              language
            });
            const quarantined = isBilingualConflict(caseData.id, contract.sourceSlot);
            if (quarantined) {
              quarantineAnswers += 1;
              if (answer.fallbackReason !== "medical_bilingual_conflict_pending_review" || answer.matchedSlotIds?.length) {
                failures.push(`${displayId}/${language}/${contract.intent}: medical conflict escaped quarantine`);
              }
              if (!unknown(answer.replyText, language)) failures.push(`${displayId}/${language}/${contract.intent}: quarantine answer became deterministic`);
              continue;
            }

            if (value === "unknown") {
              if (unknown(answer.replyText, language)) correctUnknowns += 1;
              else failures.push(`${displayId}/${language}/${contract.intent}: unknown fact became deterministic`);
              if (answer.matchedSlotIds?.length) failures.push(`${displayId}/${language}/${contract.intent}: unknown fact became collectable`);
            } else {
              knownAnswers += 1;
              if (!answer.matchedSlotIds?.includes(contract.sourceSlot)) failures.push(`${displayId}/${language}/${contract.intent}: known fact was not collectable`);
              if (unknown(answer.replyText, language)) {
                erroneousUnknowns += 1;
                failures.push(`${displayId}/${language}/${contract.intent}: known fact answered unknown`);
              }
              if (!polarity(answer.replyText, language, value as boolean)) {
                polarityErrors += 1;
                failures.push(`${displayId}/${language}/${contract.intent}: polarity mismatch`);
              }
              if (contract.forbidden.test(answer.replyText)) failures.push(`${displayId}/${language}/${contract.intent}: leaked an unrelated fact`);
            }
          }
        }
      }
    }
  } finally {
    console.warn = originalWarn;
  }

  const summary = {
    cases: publicCases.length,
    intents: contracts.length,
    totalQuestions,
    canonicalHits,
    canonicalHitRate: Number((canonicalHits / totalQuestions).toFixed(4)),
    knownAnswers,
    correctUnknowns,
    erroneousUnknowns,
    erroneousUnknownRate: knownAnswers ? Number((erroneousUnknowns / knownAnswers).toFixed(4)) : 0,
    polarityErrors,
    bilingualValueConsistency: failures.every((item) => !item.includes("fact value drift")),
    quarantineAnswers,
    failures: failures.length
  };
  console.log(`PATIENT_PARAPHRASE_MATRIX_EVIDENCE ${JSON.stringify(summary)}`);
  assert.deepEqual(failures, [], `patient paraphrase matrix failures (${failures.length}):\n${failures.slice(0, 30).join("\n")}`);
}

void main();
