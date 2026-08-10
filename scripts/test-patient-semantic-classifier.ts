import assert from "node:assert/strict";

const {
  INTENT_WHITELIST,
  PATIENT_METADATA_RESPONSE_FORMAT,
  classifyPatientIntent,
  parseClassifierResponse,
  resetPatientIntentClassifierState
} = require("../server/patientIntentClassifier.js");
const { matchPriorityCanonicalIntents, patientFactOntology } = require("../src/lib/patientIntentCatalog.js");
const { UNKNOWN_REASON_CODES } = require("../src/lib/patientFactState.js");
const { projectCanonicalPatientFacts } = require("../server/canonicalFacts.js");
const { matchStructuredFacts } = require("../server/structuredFacts.js");
const { matchPatientKnowableFacts } = require("../server/patientKnowableFacts.js");
const { routePatientIntents } = require("../server/patientIntentOnlyRouter.js");
const cases = require("../data/cases.json");

function classifierJson(
  intent: string | null,
  confidence: number,
  needsClarification = false,
  overrides: Record<string, unknown> = {}
) {
  const classifiedIntent = needsClarification || confidence < 0.92 ? null : intent;
  const requestedSlot = classifiedIntent === null
    ? null
    : patientFactOntology.find((definition: { key: string }) => definition.key === classifiedIntent)?.sourceSlotId || null;
  return JSON.stringify({
    intent: classifiedIntent,
    currentTopic: classifiedIntent,
    currentEntity: classifiedIntent === null ? null : "urination",
    requestedSlot,
    contextReference: { inherited: false, sourceIntent: null },
    clauses: [{ intent: classifiedIntent, requestedSlot }],
    naturalizationStyle: classifiedIntent === null ? "clarification" : "direct",
    ...overrides
  });
}

function legacyClassifierJson(
  intent: string | null,
  confidence: number,
  needsClarification = false
) {
  const requestedSlot = intent === null
    ? null
    : patientFactOntology.find((definition: { key: string }) => definition.key === intent)?.sourceSlotId || null;
  return JSON.stringify({
    intent,
    topic: intent,
    clauses: [{
      text: "synthetic classification probe",
      intent,
      requestedSlot,
      confidence,
      needsClarification
    }],
    contextReference: { inherited: false, sourceIntent: null }
  });
}

async function main() {
  const originalProvider = process.env.LLM_PROVIDER;
  process.env.LLM_PROVIDER = "local";
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
  assert.equal(accepted.routingAuthorized, false);
  assert.equal(accepted.confidence, 0);
  assert.equal(accepted.intent, "dysuria");
  assert.equal(providerCalls, 1);
  assert.deepEqual(
    Object.keys(capturedInput?.userPayload as object).sort(),
    [
      "allowedEntities",
      "allowedIntents",
      "allowedNaturalizationStyles",
      "classificationId",
      "conversationState",
      "governedCandidateMappings",
      "governedIntentCandidates",
      "language",
      "question",
      "recentUserQuestions",
      "requiredContextReference",
      "schemaVersion"
    ].sort()
  );
  assert.equal(capturedInput?.thinkingMode, "disabled");
  assert.equal(capturedInput?.reasoningEffort, undefined);
  assert.deepEqual(capturedInput?.responseFormat, PATIENT_METADATA_RESPONSE_FORMAT);
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
  assert.equal(lowConfidence.reason, "semantic_needs_clarification");

  resetPatientIntentClassifierState();
  const providerFailure = await classifyPatientIntent({
    question: "小便的时候某个地方不舒服吗？",
    language: "zh",
    enabled: true,
    callProvider: async () => { throw new Error("provider unavailable"); }
  });
  assert.deepEqual(providerFailure, {
    accepted: false,
    reason: "semantic_provider_unavailable",
    providerHttpSuccess: false,
    providerCalls: 1
  });

  const caseP002 = cases.find((item: { id: string }) => item.id === "P002");
  const deterministicQuestion = "排泄尿液时会产生灼热样感觉吗？";
  assert.equal(matchPriorityCanonicalIntents(deterministicQuestion, "zh").length, 0);
  assert.equal(matchStructuredFacts(caseP002, deterministicQuestion, "zh"), null);
  assert.equal(matchPatientKnowableFacts(caseP002, deterministicQuestion, "zh"), null);
  assert.deepEqual(routePatientIntents(deterministicQuestion, "zh", "").map((route: { intent: string }) => route.intent), ["dysuria"]);

  const semanticQuestion = "解手时尿道会不会像有针在扎？";
  assert.equal(matchPriorityCanonicalIntents(semanticQuestion, "zh").length, 0, "semantic fallback probe must miss priority canonical routing");
  assert.equal(matchStructuredFacts(caseP002, semanticQuestion, "zh"), null, "semantic fallback probe must miss structured routing");
  assert.equal(matchPatientKnowableFacts(caseP002, semanticQuestion, "zh"), null, "semantic fallback probe must miss patient-knowledge routing");
  assert.equal(routePatientIntents(semanticQuestion, "zh", "").length, 0, "semantic fallback probe must miss offline intent routing");
  const originalFetch = globalThis.fetch;
  process.env.PATIENT_SEMANTIC_CLASSIFIER_ENABLED = "true";
  process.env.LLM_PROVIDER = "deepseek";
  process.env.LLM_ENABLE_AI_PATIENT = "true";
  process.env.LLM_API_KEY = "synthetic-semantic-test-key";
  process.env.LLM_API_BASE_URL = "https://semantic-classifier.example.test";
  process.env.LLM_MODEL = "test-model";
  process.env.LLM_STREAMING_ENABLED = "false";
  resetPatientIntentClassifierState();
  try {
    const { generatePatientAnswer } = require("../server/patientSession.js");
    let deterministicNetworkCalls = 0;
    let deterministicClassifierCalls = 0;
    globalThis.fetch = async (_url, options) => {
      deterministicNetworkCalls += 1;
      const requestBody = JSON.parse(String(options?.body || "{}")) as Record<string, unknown> & { messages?: Array<{ content?: string }> };
      if ("response_format" in requestBody) {
        deterministicClassifierCalls += 1;
        return new Response(JSON.stringify({ choices: [{ message: { content: legacyClassifierJson("dysuria", 0.97) } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      const payload = JSON.parse(String(requestBody.messages?.[1]?.content || "{}")) as { currentAllowedAnswer?: string };
      return new Response(JSON.stringify({ choices: [{ message: { content: payload.currentAllowedAnswer || "" } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const deterministicAnswer = await generatePatientAnswer({ sessionId: `deterministic-${Date.now()}`, caseId: "P002", studentInput: deterministicQuestion, language: "zh" });
    assert.deepEqual(deterministicAnswer.matchedFacts, ["dysuria"]);
    assert.equal(deterministicAnswer.answerSource, "case_bilingual_slot");
    assert.equal(deterministicAnswer.isFallback, false);
    assert.equal(deterministicAnswer.provider, "deepseek");
    assert.equal(deterministicClassifierCalls, 0, "offline intent routing must not call the semantic classifier");
    assert.equal(deterministicNetworkCalls, 1, "deterministic routing must naturalize only the governed answer");

    resetPatientIntentClassifierState();
    let integrationProviderCalls = 0;
    let classifierRequestBody: Record<string, unknown> | undefined;
    globalThis.fetch = async (_url, options) => {
      integrationProviderCalls += 1;
      const requestBody = JSON.parse(String(options?.body || "{}")) as Record<string, unknown>;
      if (!("response_format" in requestBody)) {
        const messages = requestBody.messages as Array<{ content?: string }> | undefined;
        const payload = JSON.parse(String(messages?.[1]?.content || "{}")) as { currentAllowedAnswer?: string };
        return new Response(JSON.stringify({
          choices: [{ message: { content: payload.currentAllowedAnswer || "" } }]
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      classifierRequestBody = requestBody;
      return new Response(JSON.stringify({
        choices: [{
          message: {
            reasoning_content: "private chain of thought",
            content: legacyClassifierJson("dysuria", 0.97)
          }
        }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const semanticAnswer = await generatePatientAnswer({ sessionId: "", caseId: "P002", studentInput: semanticQuestion, language: "zh" });
    assert.deepEqual(semanticAnswer.matchedFacts, ["dysuria"]);
    assert.equal(semanticAnswer.answerSource, "governed_fact_semantic_classification");
    assert.equal(semanticAnswer.isFallback, false);
    assert.equal(semanticAnswer.provider, "deepseek");
    assert.doesNotMatch(semanticAnswer.replyText, /private chain of thought/);
    assert.equal(integrationProviderCalls, 2, "the existing DeepSeek web contract must classify then naturalize the governed fact");
    assert.equal(classifierRequestBody?.model, "test-model");
    assert.deepEqual(classifierRequestBody?.thinking, { type: "disabled" });
    assert.equal("reasoning_effort" in (classifierRequestBody || {}), false);
    assert.deepEqual(classifierRequestBody?.response_format, { type: "json_object" });
    assert.equal(
      typeof classifierRequestBody?.temperature,
      "number",
      "disabled-thinking request may retain deterministic sampling controls"
    );

    resetPatientIntentClassifierState();
    let clarificationProviderCalls = 0;
    globalThis.fetch = async () => {
      clarificationProviderCalls += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: legacyClassifierJson("dysuria", 0.50, true) } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
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
    process.env.LLM_PROVIDER = "local";
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

  if (originalProvider === undefined) delete process.env.LLM_PROVIDER;
  else process.env.LLM_PROVIDER = originalProvider;
  console.log("Patient semantic classifier whitelist, non-authoritative routing, cache, singleflight, rate-limit, and governed projection tests passed.");
}

void main();
