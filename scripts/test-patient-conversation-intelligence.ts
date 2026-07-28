import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

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
    answerPlans?: Array<{ intent: string; factState: string; renderedAnswer: string; directAnswer: string }>;
    clauseOutcomes?: Array<{ status: string }>;
    safetyFlags?: string[];
    fallbackReason?: string;
    filter?: { ok: boolean };
    contextResolution?: { inherited: boolean };
    answerSource?: string;
    isFallback?: boolean;
    conversationState?: {
      currentTopic: string;
      currentEntity: string;
      requestedSlot: string;
    };
    runtimeTrace?: {
      generationSource: string;
      thinkingMode: string;
      thinkingApplied: boolean;
      thinkingExecuted: boolean;
    };
  }>;
};
const {
  classifyPatientIntent,
  resetPatientIntentClassifierState
} = require("../server/patientIntentClassifier.js") as {
  classifyPatientIntent(input: {
    question: string;
    language: "zh" | "en";
    conversationState: {
      currentTopic: string;
      currentEntity: string;
      requestedSlot: string;
      lastResolvedFact: { intent: string };
    };
  }): Promise<{ accepted: boolean; providerCalls: number; thinkingMode?: string }>;
  resetPatientIntentClassifierState(): void;
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

const multiTurnQuestions = [
  "哪里不舒服？",
  "多久了？",
  "怎么发现的？",
  "还有其他不舒服吗？",
  "以前出现过吗？",
  "有没有其他疾病？",
  "高血压吃什么药？",
  "怎么吃？",
  "还吃其他药吗？",
  "抽烟吗？",
  "喝酒吗？",
  "那多久了？"
];

function ambiguousContextResponse(question: string) {
  return JSON.stringify({
    intent: null,
    topic: "alcohol_history",
    clauses: [{
      text: question,
      intent: null,
      requestedSlot: null,
      confidence: 0.4,
      needsClarification: true
    }],
    contextReference: {
      inherited: true,
      sourceIntent: "alcohol_history"
    }
  });
}

async function runThinkingAB() {
  const originalFetch = globalThis.fetch;
  const environmentKeys = [
    "PATIENT_SEMANTIC_CLASSIFIER_ENABLED",
    "PATIENT_DEEPSEEK_THINKING",
    "LLM_ENABLE_AI_PATIENT",
    "LLM_API_KEY",
    "LLM_API_BASE_URL",
    "LLM_MODEL",
    "LLM_STREAMING_ENABLED"
  ];
  const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));
  const caseIds = ["P001", "P003", "P005", "HX-ADD-025", "HX-ADD-030"];
  const evidence: Array<Record<string, unknown>> = [];
  const requestBodies: Array<Record<string, unknown>> = [];
  try {
    process.env.PATIENT_SEMANTIC_CLASSIFIER_ENABLED = "true";
    process.env.LLM_ENABLE_AI_PATIENT = "true";
    process.env.LLM_API_KEY = "synthetic-thinking-ab-key";
    process.env.LLM_API_BASE_URL = "https://patient-thinking-ab.example.test";
    process.env.LLM_MODEL = "deepseek-v4-pro";
    process.env.LLM_STREAMING_ENABLED = "false";
    globalThis.fetch = async (_url, options) => {
      const requestBody = JSON.parse(String(options?.body || "{}")) as Record<string, unknown>;
      requestBodies.push(requestBody);
      const messages = requestBody.messages as Array<{ content?: string }> | undefined;
      const input = JSON.parse(String(messages?.[1]?.content || "{}")) as {
        question?: string;
        currentAllowedAnswer?: string;
      };
      const content = input.currentAllowedAnswer
        ? input.currentAllowedAnswer
        : ambiguousContextResponse(String(input.question || ""));
      return new Response(JSON.stringify({
        choices: [{
          message: {
            reasoning_content: "private reasoning must never reach the patient",
            content
          }
        }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    for (const mode of ["disabled", "max"] as const) {
      process.env.PATIENT_DEEPSEEK_THINKING = mode;
      resetPatientIntentClassifierState();
      for (const caseId of caseIds) {
        const session = await initSession({
          caseId,
          attemptId: `thinking-ab-${mode}-${caseId}`,
          language: "zh"
        });
        for (let turn = 0; turn < multiTurnQuestions.length; turn += 1) {
          const startedAt = performance.now();
          const answer = await generatePatientAnswer({
            sessionId: session.sessionId,
            caseId,
            studentInput: multiTurnQuestions[turn],
            conversationHistory: [],
            language: "zh"
          });
          const latencyMs = performance.now() - startedAt;
          const plans = answer.answerPlans || [];
          const erroneousUnknown = plans.some(
            (plan) => knownStates.has(plan.factState) && unknownZh.test(plan.renderedAnswer)
          );
          assert.equal(erroneousUnknown, false, `${mode}/${caseId}/turn-${turn + 1} erroneous unknown`);
          if (turn === 1) {
            assert.equal(answer.contextResolution?.inherited, true, `${mode}/${caseId} duration must inherit the chief complaint`);
            assert.equal(answer.conversationState?.requestedSlot, "hematuria_onset");
            assert.doesNotMatch(answer.replyText, /^这项情况我现在不太清楚。?$/);
          }
          if (turn === 2) {
            assert.equal(answer.contextResolution?.inherited, true, `${mode}/${caseId} discovery must inherit the chief complaint`);
          }
          if (turn === 4) {
            assert.equal(answer.contextResolution?.inherited, true, `${mode}/${caseId} previous episode must inherit the complaint topic`);
          }
          if (turn === 11) {
            assert.equal(answer.runtimeTrace?.generationSource, "mock");
            assert.equal(answer.runtimeTrace?.thinkingMode, mode);
            assert.equal(answer.runtimeTrace?.thinkingApplied, mode === "max");
            assert.equal(answer.runtimeTrace?.thinkingExecuted, mode === "max");
            assert.doesNotMatch(answer.replyText, /private reasoning/i);
          }
          evidence.push({
            mode,
            caseId,
            turn: turn + 1,
            question: multiTurnQuestions[turn],
            answer: answer.replyText,
            intent: plans[0]?.intent || null,
            currentTopic: answer.conversationState?.currentTopic || "",
            requestedSlot: answer.conversationState?.requestedSlot || "",
            answerSource: answer.answerSource || "",
            erroneousUnknown,
            latencyMs: Number(latencyMs.toFixed(2)),
            isFallback: Boolean(answer.isFallback)
          });
        }
        const classifierProbe = await classifyPatientIntent({
          question: "那疼吗？",
          language: "zh",
          conversationState: {
            currentTopic: caseId === "P001" ? "gross_hematuria"
              : caseId === "P003" ? "microscopic_hematuria"
                : caseId === "P005" ? "flank_pain"
                  : caseId === "HX-ADD-025" ? "medication_list"
                    : "hypertension_history",
            currentEntity: caseId,
            requestedSlot: "",
            lastResolvedFact: { intent: "" }
          }
        });
        assert.equal(classifierProbe.providerCalls, 1);
        assert.equal(classifierProbe.accepted, false);
        assert.equal(classifierProbe.thinkingMode, mode);
      }
    }

    const classifierRequests = requestBodies.filter((body) => "response_format" in body);
    const disabledClassifierRequests = classifierRequests.filter(
      (body) => (body.thinking as { type?: string } | undefined)?.type === "disabled"
    );
    const maxClassifierRequests = classifierRequests.filter(
      (body) => (body.thinking as { type?: string } | undefined)?.type === "enabled"
        && body.reasoning_effort === "max"
    );
    assert.equal(disabledClassifierRequests.length, caseIds.length);
    assert.equal(maxClassifierRequests.length, caseIds.length);
    assert(requestBodies.length > classifierRequests.length, "governed answers must use the configured Patient provider");
    for (const body of requestBodies) {
      assert.equal(body.model, "deepseek-v4-pro");
      assert.equal("top_p" in body, false);
      if ((body.thinking as { type?: string } | undefined)?.type === "enabled") {
        assert.equal("temperature" in body, false);
      }
    }
    assert.equal(evidence.length, 120);
    assert.equal(evidence.filter((item) => item.erroneousUnknown).length, 0);
    const outputPath = process.env.PATIENT_AB_EVIDENCE_PATH;
    if (outputPath) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, `${JSON.stringify({ model: "deepseek-v4-pro", cases: caseIds, turns: multiTurnQuestions, evidence }, null, 2)}\n`, "utf8");
    }
    console.log(`PATIENT_THINKING_AB_EVIDENCE ${JSON.stringify({
      cases: caseIds.length,
      turnsPerCase: multiTurnQuestions.length,
      responses: evidence.length,
      disabledClassifierCalls: disabledClassifierRequests.length,
      maxClassifierCalls: maxClassifierRequests.length,
      erroneousUnknowns: 0,
      contextLosses: 0,
      reasoningLeaks: 0
    })}`);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of originalEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetPatientIntentClassifierState();
  }
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
  await runThinkingAB();
}

void main();
