import assert from "node:assert/strict";

const {
  INTENT_WHITELIST,
  classifyPatientIntent,
  parseClassifierResponse,
  resetPatientIntentClassifierState
} = require("../server/patientIntentClassifier.js");
const { matchPriorityCanonicalIntents } = require("../src/lib/patientIntentCatalog.js");
const { projectCanonicalPatientFacts } = require("../server/canonicalFacts.js");
const { matchStructuredFacts } = require("../server/structuredFacts.js");
const cases = require("../data/cases.json");

async function main() {
  assert.ok(INTENT_WHITELIST.includes("dysuria"));
  assert.ok(INTENT_WHITELIST.includes("whole_stream_hematuria"));
  assert.equal(parseClassifierResponse('{"intent":"dysuria","confidence":0.96,"needsClarification":false}')?.intent, "dysuria");
  assert.equal(parseClassifierResponse('{"intent":"diagnosis","confidence":0.99,"needsClarification":false}'), null);
  assert.equal(parseClassifierResponse('{"intent":"dysuria","confidence":0.99,"needsClarification":false,"answer":"yes"}'), null);
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
      return { text: '{"intent":"dysuria","confidence":0.96,"needsClarification":false}' };
    }
  });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.intent, "dysuria");
  assert.equal(providerCalls, 1);
  assert.deepEqual(Object.keys(capturedInput?.userPayload as object).sort(), ["allowedIntents", "classificationId", "language", "question"]);
  assert.doesNotMatch(JSON.stringify(capturedInput), /caseId|diagnosis|score|patientAnswer|reviewerStatus/i, "classifier input must not contain case data or answers");
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
  resolveProvider?.({ text: '{"intent":"dysuria","confidence":0.97,"needsClarification":false}' });
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.accepted, true);
  assert.equal(secondResult.accepted, true);
  assert.equal(singleflightCalls, 1, "concurrent identical classifications must be singleflight");

  resetPatientIntentClassifierState();
  const lowConfidence = await classifyPatientIntent({
    question: "小便时是不是哪里有点怪？",
    language: "zh",
    enabled: true,
    callProvider: async () => ({ text: '{"intent":"dysuria","confidence":0.70,"needsClarification":true}' })
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
    let deterministicProviderPayload: Record<string, unknown> | undefined;
    globalThis.fetch = async (_url, options) => {
      deterministicNetworkCalls += 1;
      const requestBody = JSON.parse(String(options?.body || "{}"));
      deterministicProviderPayload = JSON.parse(String(requestBody.messages?.[1]?.content || "{}"));
      return new Response(JSON.stringify({ choices: [{ message: { content: "没有，小便时不痛。" } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const deterministicAnswer = await generatePatientAnswer({ sessionId: `deterministic-${Date.now()}`, caseId: "P002", studentInput: "小便痛不痛？", language: "zh" });
    assert.deepEqual(deterministicAnswer.matchedFacts, ["dysuria"]);
    assert.equal(deterministicNetworkCalls, 1, "a deterministic alias may use one answer rewrite, but must not add a semantic-classifier call");
    assert.equal("classificationId" in (deterministicProviderPayload || {}), false);
    assert.ok("currentAllowedAnswer" in (deterministicProviderPayload || {}), "the one provider call must be the constrained answer rewrite");

    resetPatientIntentClassifierState();
    let integrationProviderCalls = 0;
    globalThis.fetch = async () => {
      integrationProviderCalls += 1;
      const content = integrationProviderCalls === 1
        ? '{"intent":"dysuria","confidence":0.97,"needsClarification":false}'
        : "没有，小便时不痛。";
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const semanticAnswer = await generatePatientAnswer({ sessionId: "", caseId: "P002", studentInput: semanticQuestion, language: "zh" });
    assert.deepEqual(semanticAnswer.matchedFacts, ["dysuria"]);
    assert.equal(semanticAnswer.answerSource, "case_bilingual_slot_semantic_classification");
    assert.match(semanticAnswer.replyText, /没有|不痛/);
    assert.equal(integrationProviderCalls, 2, "semantic classification and optional natural-language rewrite are separate bounded calls");
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
        return { text: '{"intent":"dysuria","confidence":0.50,"needsClarification":true}' };
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
