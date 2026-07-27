import assert from "node:assert/strict";

const {
  INTENT_WHITELIST,
  classifyPatientIntent,
  parseClassifierResponse,
  resetPatientIntentClassifierState
} = require("../server/patientIntentClassifier.js");
const { matchPriorityCanonicalIntents } = require("../src/lib/patientIntentCatalog.js");
const { UNKNOWN_REASON_CODES } = require("../src/lib/patientFactState.js");
const { projectCanonicalPatientFacts } = require("../server/canonicalFacts.js");
const { matchStructuredFacts } = require("../server/structuredFacts.js");
const cases = require("../data/cases.json");

function classifierJson(
  intent: string | null,
  confidence: number,
  needsClarification = false,
  overrides: Record<string, unknown> = {}
) {
  return JSON.stringify({
    intent,
    topic: intent,
    clauses: [{ text: "source clause", intent, confidence, needsClarification }],
    contextReference: { inherited: false, sourceIntent: null },
    ...overrides
  });
}

async function main() {
  assert.ok(INTENT_WHITELIST.includes("dysuria"));
  assert.ok(INTENT_WHITELIST.includes("whole_stream_hematuria"));
  assert.equal(parseClassifierResponse(classifierJson("dysuria", 0.96))?.intent, "dysuria");
  assert.equal(parseClassifierResponse(classifierJson("diagnosis", 0.99)), null);
  assert.equal(parseClassifierResponse(classifierJson("dysuria", 0.99, false, { answer: "yes" })), null);
  assert.equal(parseClassifierResponse("not json"), null);

  for (const question of ["小便痛不痛？", "没有尿痛吧？", "全程都是红的吗？", "从开始到最后都红吗？"]) {
    assert.ok(matchPriorityCanonicalIntents(question, "zh").length > 0, `${question} must be resolved before semantic fallback`);
  }

  resetPatientIntentClassifierState();
  let providerCalls = 0;
  let capturedInput: Record<string, unknown> | undefined;
  const accepted = await classifyPatientIntent({
    question: "排泄尿液时会产生灼热样感觉吗？",
    language: "zh",
    enabled: true,
    callProvider: async (input: Record<string, unknown>) => {
      providerCalls += 1;
      capturedInput = input;
      return { text: classifierJson("dysuria", 0.96) };
    }
  });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.intent, "dysuria");
  assert.equal(providerCalls, 1);
  assert.deepEqual(
    Object.keys(capturedInput?.userPayload as object).sort(),
    ["allowedIntents", "classificationId", "language", "outputContract", "question", "recentUserQuestions"]
  );
  assert.equal(capturedInput?.thinkingMode, "enabled");
  assert.equal(capturedInput?.reasoningEffort, "high");
  assert.deepEqual(capturedInput?.responseFormat, { type: "json_object" });
  assert.doesNotMatch(
    JSON.stringify(capturedInput?.userPayload),
    /caseId|score|patientAnswer|reviewerStatus/i,
    "classifier input must not contain case data or answers"
  );
  const projected = projectCanonicalPatientFacts("P001", [accepted.intent], "zh", "排泄尿液时会产生灼热样感觉吗？");
  assert.deepEqual(projected?.matchedFacts, ["dysuria"]);
  assert.notEqual(projected?.factValues?.dysuria, undefined, "the answer polarity must be read from the canonical case fact");

  const cached = await classifyPatientIntent({
    question: "排泄尿液时会产生灼热样感觉吗？",
    language: "zh",
    enabled: true,
    callProvider: async () => { throw new Error("cache miss"); }
  });
  assert.equal(cached.accepted, true);
  assert.equal(cached.cacheHit, true);

  resetPatientIntentClassifierState();
  let resolveProvider: ((value: unknown) => void) | undefined;
  let singleflightCalls = 0;
  const singleflightProvider = async () => {
    singleflightCalls += 1;
    return new Promise((resolve) => { resolveProvider = resolve; });
  };
  const first = classifyPatientIntent({ question: "排泄尿液的时候会灼热吗？", language: "zh", enabled: true, callProvider: singleflightProvider });
  const second = classifyPatientIntent({ question: "排泄尿液的时候会灼热吗？", language: "zh", enabled: true, callProvider: singleflightProvider });
  await new Promise((resolve) => setImmediate(resolve));
  resolveProvider?.({ text: classifierJson("dysuria", 0.97) });
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.accepted, true);
  assert.equal(secondResult.accepted, true);
  assert.equal(singleflightCalls, 1, "concurrent identical classifications must be singleflight");

  resetPatientIntentClassifierState();
  const lowConfidence = await classifyPatientIntent({
    question: "小便时是不是哪里有点怪？",
    language: "zh",
    enabled: true,
    callProvider: async () => ({ text: classifierJson("dysuria", 0.70, true) })
  });
  assert.equal(lowConfidence.accepted, false);
  assert.equal(lowConfidence.reason, "semantic_low_confidence");

  resetPatientIntentClassifierState();
  const providerFailure = await classifyPatientIntent({
    question: "小便的时候某个地方不舒服吗？",
    language: "zh",
    enabled: true,
    callProvider: async () => { throw new Error("provider unavailable"); }
  });
  assert.deepEqual(providerFailure, { accepted: false, reason: "semantic_provider_unavailable", providerCalls: 1 });

  const semanticQuestion = "排泄尿液时会产生灼热样感觉吗？";
  assert.equal(matchPriorityCanonicalIntents(semanticQuestion, "zh").length, 0, "integration probe must really reach semantic fallback");
  assert.equal(matchStructuredFacts(cases.find((item: { id: string }) => item.id === "P002"), semanticQuestion, "zh"), null);
  const originalFetch = globalThis.fetch;
  process.env.PATIENT_SEMANTIC_CLASSIFIER_ENABLED = "true";
  process.env.LLM_ENABLE_AI_PATIENT = "true";
  process.env.LLM_API_KEY = "synthetic-semantic-test-key";
  process.env.LLM_API_BASE_URL = "https://semantic-classifier.example.test";
  process.env.LLM_MODEL = "test-model";
  process.env.LLM_STREAMING_ENABLED = "false";
  resetPatientIntentClassifierState();
  try {
    const { generatePatientAnswer } = require("../server/patientSession.js");
    let deterministicNetworkCalls = 0;
    globalThis.fetch = async () => {
      deterministicNetworkCalls += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: "没有，小便时不痛。" } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const deterministicAnswer = await generatePatientAnswer({ sessionId: `deterministic-${Date.now()}`, caseId: "P002", studentInput: "小便痛不痛？", language: "zh" });
    assert.deepEqual(deterministicAnswer.matchedFacts, ["dysuria"]);
    assert.equal(deterministicNetworkCalls, 0, "deterministic routing must never invoke DeepSeek");

    resetPatientIntentClassifierState();
    let integrationProviderCalls = 0;
    let classifierRequestBody: Record<string, unknown> | undefined;
    globalThis.fetch = async (_url, options) => {
      integrationProviderCalls += 1;
      classifierRequestBody = JSON.parse(String(options?.body || "{}"));
      return new Response(JSON.stringify({
        choices: [{
          message: {
            reasoning_content: "private chain of thought",
            content: classifierJson("dysuria", 0.97)
          }
        }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const semanticAnswer = await generatePatientAnswer({ sessionId: "", caseId: "P002", studentInput: semanticQuestion, language: "zh" });
    assert.deepEqual(semanticAnswer.matchedFacts, ["dysuria"]);
    assert.equal(semanticAnswer.answerSource, "case_bilingual_slot_semantic_classification");
    assert.equal(semanticAnswer.provider, "rule");
    assert.equal(semanticAnswer.model, "local-rule");
    assert.equal(semanticAnswer.classifierProvider, "deepseek");
    assert.equal(semanticAnswer.classifierModel, "test-model");
    assert.match(semanticAnswer.replyText, /没有|不痛/);
    assert.doesNotMatch(semanticAnswer.replyText, /private chain of thought/);
    assert.equal(integrationProviderCalls, 1, "DeepSeek may classify once but must not generate or rewrite the patient answer");
    assert.equal(classifierRequestBody?.model, "test-model");
    assert.deepEqual(classifierRequestBody?.thinking, { type: "enabled" });
    assert.equal(classifierRequestBody?.reasoning_effort, "high");
    assert.deepEqual(classifierRequestBody?.response_format, { type: "json_object" });
    assert.equal("temperature" in (classifierRequestBody || {}), false, "thinking-mode request must omit ignored sampling controls");

    resetPatientIntentClassifierState();
    let clarificationProviderCalls = 0;
    globalThis.fetch = async () => {
      clarificationProviderCalls += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: classifierJson("dysuria", 0.50, true) } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const ambiguousAnswer = await generatePatientAnswer({
      sessionId: "",
      caseId: "P002",
      studentInput: "排泄尿液的时候某处怪怪的吗？",
      language: "zh"
    });
    assert.equal(clarificationProviderCalls, 1, "low-confidence fallback must only classify, never generate an answer");
    assert.equal(ambiguousAnswer.answerSource, "unknown");
    assert.equal(ambiguousAnswer.fallbackReason, "semantic_low_confidence");
    assert.equal(ambiguousAnswer.unknownReasonCodes?.unresolved_intent, UNKNOWN_REASON_CODES.INTENT_AMBIGUOUS);
    assert.match(ambiguousAnswer.replyText, /具体.*哪一方面/);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.PATIENT_SEMANTIC_CLASSIFIER_ENABLED;
    delete process.env.LLM_ENABLE_AI_PATIENT;
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_API_BASE_URL;
    delete process.env.LLM_MODEL;
    delete process.env.LLM_STREAMING_ENABLED;
  }

  resetPatientIntentClassifierState();
  let rateCalls = 0;
  for (let index = 0; index < 30; index += 1) {
    await classifyPatientIntent({
      question: `第${index}次问小便的时候会不会有某种不适？`,
      language: "zh",
      enabled: true,
      callProvider: async () => {
        rateCalls += 1;
        return { text: classifierJson("dysuria", 0.50, true) };
      }
    });
  }
  const limited = await classifyPatientIntent({
    question: "额外一次问小便的时候会不会有某种不适？",
    language: "zh",
    enabled: true,
    callProvider: async () => { throw new Error("rate limit failed"); }
  });
  assert.equal(rateCalls, 30);
  assert.equal(limited.reason, "classifier_rate_limited");
  assert.equal(limited.providerCalls, 0);

  console.log("Patient semantic classifier whitelist, threshold, cache, singleflight, rate-limit, and canonical projection tests passed.");
}

void main();
