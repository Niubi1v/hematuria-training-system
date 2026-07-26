import assert from "node:assert/strict";

import { buildPatientConversationCorpus } from "./patient-conversation-corpus.mjs";

process.env.TRAINING_STATE_SECRET = "test-only-conversation-intelligence-secret";
process.env.LLM_ENABLE_AI_PATIENT = "false";
process.env.PATIENT_SEMANTIC_CLASSIFIER_ENABLED = "false";

const publicCases = require("../data/cases_public.json") as Array<{ id: string }>;
const { initSession, generatePatientAnswer } = require("../server/patientSession.js") as {
  initSession(input: { caseId: string; attemptId: string; language: "zh" | "en" }): Promise<{ sessionId: string }>;
  generatePatientAnswer(input: {
    sessionId: string;
    caseId: string;
    studentInput: string;
    conversationHistory: Array<{ role: string; text: string }>;
    language: "zh" | "en";
  }): Promise<{
    replyText: string;
    matchedFacts?: string[];
    answerPlans?: Array<{ factState: string; renderedAnswer: string; directAnswer: string }>;
    clauseOutcomes?: Array<{ status: string }>;
    safetyFlags?: string[];
    fallbackReason?: string;
    filter?: { ok: boolean };
    contextResolution?: { inherited: boolean };
  }>;
};

const unknownZh = /不太清楚|不知道|没(?:有)?(?:特别)?(?:注意|留意)|记不(?:太)?清|没有可靠的信息/;
const unknownEn = /not sure|do not know|did not notice|have not noticed|cannot recall|do not have reliable information/i;
const knownStates = new Set(["known_true", "known_false", "exact_value", "approximate_value"]);

function hasCorrectPolarity(plan: { factState: string; directAnswer: string; renderedAnswer: string }, language: "zh" | "en") {
  const text = String(plan.directAnswer || plan.renderedAnswer).trim();
  if (plan.factState === "known_true") return language === "zh" ? /^(有|是|会)/.test(text) : /^(yes|it does|it is|there is|i do)/i.test(text);
  if (plan.factState === "known_false") return language === "zh" ? /^(没有|不|不是|不会)/.test(text) : /^(no|it does not|it doesn't|it is not|i do not|i don't)/i.test(text);
  return true;
}

async function main() {
  const cases = publicCases.slice(0, 10);
  const corpus = buildPatientConversationCorpus();
  const failures: string[] = [];
  let totalQuestions = 0;
  let knownFactPlans = 0;
  let correctUnknowns = 0;
  let erroneousUnknowns = 0;
  let polarityErrors = 0;
  let clauseDrops = 0;
  let contextChecks = 0;
  let contextLosses = 0;
  let diagnosisBoundaryMisclassifications = 0;
  let safetyFilterFalseBlocks = 0;
  let medicalConflictIsolations = 0;
  const originalWarn = console.warn;
  console.warn = () => undefined;

  try {
    for (const caseData of cases) {
      for (const language of ["zh", "en"] as const) {
        const session = await initSession({
          caseId: caseData.id,
          attemptId: `conversation-${caseData.id}-${language}`,
          language
        });
        for (const probe of corpus[language]) {
          totalQuestions += 1;
          const answer = await generatePatientAnswer({
            sessionId: session.sessionId,
            caseId: caseData.id,
            studentInput: probe.question,
            conversationHistory: probe.conversationHistory,
            language
          });
          const plans = answer.answerPlans || [];
          const outcomes = answer.clauseOutcomes || [];
          const blockedMedical = outcomes.filter((item) => item.status === "blocked_medical").length;
          medicalConflictIsolations += blockedMedical;
          if (outcomes.length < plans.length) {
            clauseDrops += plans.length - outcomes.length;
            failures.push(`${caseData.id}/${probe.id}: clause outcome dropped`);
          }
          if (answer.safetyFlags?.some((flag) => flag === "blocked_diagnosis_request")) {
            diagnosisBoundaryMisclassifications += 1;
            failures.push(`${caseData.id}/${probe.id}: false diagnosis boundary`);
          }
          if (answer.safetyFlags?.some((flag) => flag === "deterministic_answer_blocked")) {
            safetyFilterFalseBlocks += 1;
            failures.push(`${caseData.id}/${probe.id}: legal deterministic answer filtered`);
          }
          if (probe.kind.startsWith("context_")) {
            contextChecks += 1;
            if (!answer.contextResolution?.inherited) {
              contextLosses += 1;
              failures.push(`${caseData.id}/${probe.id}: context not inherited`);
            }
          }
          for (const plan of plans) {
            const unknownPattern = language === "zh" ? unknownZh : unknownEn;
            if (knownStates.has(plan.factState)) {
              knownFactPlans += 1;
              if (unknownPattern.test(plan.renderedAnswer)) {
                erroneousUnknowns += 1;
                failures.push(`${caseData.id}/${probe.id}: known plan answered unknown`);
              }
              if (!hasCorrectPolarity(plan, language)) {
                polarityErrors += 1;
                failures.push(`${caseData.id}/${probe.id}: polarity mismatch`);
              }
            } else if (unknownPattern.test(plan.renderedAnswer)) {
              correctUnknowns += 1;
            }
          }
          assert.equal(answer.filter?.ok ?? true, true, `${caseData.id}/${probe.id}: output filter rejected response`);
        }
      }
    }
  } finally {
    console.warn = originalWarn;
  }

  const evidence = {
    cases: cases.length,
    zhPerCase: corpus.zh.length,
    enPerCase: corpus.en.length,
    totalQuestions,
    knownFactPlans,
    correctUnknowns,
    erroneousUnknowns,
    polarityErrors,
    clauseDrops,
    contextChecks,
    contextLosses,
    diagnosisBoundaryMisclassifications,
    safetyFilterFalseBlocks,
    medicalConflictIsolations,
    failures: failures.length
  };
  console.log(`PATIENT_CONVERSATION_INTELLIGENCE_EVIDENCE ${JSON.stringify(evidence)}`);
  assert.equal(totalQuestions, 450);
  assert.deepEqual(failures, [], failures.slice(0, 30).join("\n"));
}

void main();
