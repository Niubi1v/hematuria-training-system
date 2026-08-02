import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  desktopEvidenceSnapshot,
  desktopPatientEvidence,
  desktopRuntimeEventsForTests,
  desktopRuntimeSummary,
  resetDesktopPatientEvidenceForTests,
  runtimeSnapshot
} = require("../server/desktopRuntimeEvidence.js");

function runtime(overrides = {}) {
  return {
    sessionStartedAt: "2026-08-01T12:00:00.000Z",
    runtimeTarget: "desktop",
    model: "Qwen3-1.7B",
    modelProfile: "lightweight",
    productHead: "a".repeat(40),
    llamaServerReady: true,
    localModelReady: true,
    cloudRequestCount: 0,
    ...overrides
  };
}

function patient({
  classificationSource = "local_ai",
  classifierStatus = "accepted",
  providerHttpSuccess = true,
  inherited = true,
  factState = "exact_value",
  unknownReason = null,
  model = "Qwen3-1.7B",
  fallbackReason = "",
  intent = "smoking_history",
  requestedSlot = "SMOKING",
  durationMs = 321
} = {}) {
  return {
    runtimeTrace: {
      classificationSource,
      classifierStatus,
      providerHttpSuccess,
      model,
      fallbackReason,
      intent,
      requestedSlot,
      durationMs,
      responseErrors: []
    },
    contextResolution: { inherited },
    answerPlans: [{ intent, sourceSlotId: requestedSlot, factState, unknownReason }]
  };
}

try {
  resetDesktopPatientEvidenceForTests();
  delete globalThis.__hematuriaDesktopRuntimeEvidence;
  assert.equal(runtimeSnapshot(), null);
  assert.equal(desktopPatientEvidence(patient()), null);

  globalThis.__hematuriaDesktopRuntimeEvidence = () => runtime();
  assert.deepEqual(desktopEvidenceSnapshot(), {
    sessionStartedAt: "2026-08-01T12:00:00.000Z",
    runtimeTarget: "desktop",
    modelProfile: "lightweight",
    productHead: "a".repeat(40),
    llamaServerReady: true,
    localModelReady: true,
    model: "Qwen3-1.7B",
    cloudRequestCount: 0,
    answerSource: null,
    fallbackReason: null,
    intent: null,
    requestedSlot: null,
    factState: null,
    unknown: null,
    latency: 0,
    responseErrors: []
  });
  assert.deepEqual(desktopPatientEvidence(patient(), { sessionId: "runtime-test-session" }), {
    sessionStartedAt: "2026-08-01T12:00:00.000Z",
    runtimeTarget: "desktop",
    modelProfile: "lightweight",
    productHead: "a".repeat(40),
    llamaServerReady: true,
    localModelReady: true,
    model: "Qwen3-1.7B",
    cloudRequestCount: 0,
    answerSource: "local_ai",
    fallbackReason: null,
    intent: "smoking_history",
    requestedSlot: "SMOKING",
    factState: "exact_value",
    unknown: null,
    latency: 321,
    responseErrors: []
  });
  assert.equal(desktopEvidenceSnapshot().intent, "smoking_history");

  assert.equal(
    desktopPatientEvidence(patient({ classifierStatus: "rejected" })).answerSource,
    "rule_fallback"
  );
  assert.equal(
    desktopPatientEvidence(patient({ providerHttpSuccess: false })).answerSource,
    "rule_fallback"
  );

  globalThis.__hematuriaDesktopRuntimeEvidence = () => runtime({ llamaServerReady: false, localModelReady: false, model: "Qwen3-4B" });
  const unavailable = desktopPatientEvidence(patient());
  assert.equal(unavailable.answerSource, "rule_fallback");
  assert.equal(unavailable.llamaServerReady, false);
  assert.equal(unavailable.localModelReady, false);
  assert.equal(unavailable.model, "Qwen3-4B");

  const unknown = desktopPatientEvidence(patient({
    factState: "missing",
    unknownReason: "fact_missing",
    fallbackReason: "semantic_low_confidence"
  }));
  assert.equal(unknown.factState, "missing");
  assert.equal(unknown.unknown, "fact_missing");
  assert.equal(unknown.fallbackReason, "semantic_low_confidence");

  resetDesktopPatientEvidenceForTests();
  globalThis.__hematuriaDesktopRuntimeEvidence = () => runtime();
  for (let index = 0; index < 5; index += 1) {
    desktopPatientEvidence(patient(), { sessionId: `local-session-${index}` });
  }
  desktopPatientEvidence(patient({ classifierStatus: "rejected" }), { sessionId: "fallback-session" });
  const aggregate = desktopRuntimeSummary();
  assert.deepEqual(aggregate, {
    schemaVersion: 1,
    sessionStartedAt: "2026-08-01T12:00:00.000Z",
    runtimeTarget: "desktop",
    model: "Qwen3-1.7B",
    modelProfile: "lightweight",
    productHead: "a".repeat(40),
    llamaServerReady: true,
    localModelReady: true,
    localAiAcceptedCount: 5,
    ruleFallbackCount: 1,
    cloudRequestCount: 0,
    generatedAt: aggregate.generatedAt
  });
  assert.doesNotMatch(JSON.stringify(aggregate), /question|answer|prompt|reply|caseId|token|secret|reasoning|patient|intent/i);
  const runtimeEvent = desktopRuntimeEventsForTests()[0];
  assert.deepEqual(Object.keys(runtimeEvent).sort(), ["eventType", "latency", "model", "sessionId", "timestamp"].sort());
  assert.equal(runtimeEvent.eventType, "local_ai_accepted");
  assert.match(runtimeEvent.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
  assert.doesNotMatch(JSON.stringify(desktopRuntimeEventsForTests()), /question|answer|prompt|reply|caseId|token|secret|reasoning|patient|intent/i);

  resetDesktopPatientEvidenceForTests();
  for (let index = 0; index < 10; index += 1) {
    desktopPatientEvidence(patient({
      classificationSource: "deterministic",
      classifierStatus: "not_invoked",
      providerHttpSuccess: false
    }), { sessionId: `model-disabled-session-${index}` });
  }
  const modelDisabledAggregate = desktopRuntimeSummary();
  assert.equal(modelDisabledAggregate.localAiAcceptedCount, 0);
  assert.equal(modelDisabledAggregate.ruleFallbackCount, 10);
  assert.equal(modelDisabledAggregate.cloudRequestCount, 0);

  globalThis.__hematuriaDesktopRuntimeEvidence = () => runtime({ cloudRequestCount: -1 });
  assert.equal(runtimeSnapshot(), null);

  globalThis.__hematuriaDesktopRuntimeEvidence = () => runtime({ model: "attacker-controlled-model" });
  assert.equal(runtimeSnapshot(), null);

  process.stdout.write("desktop runtime evidence tests passed\n");
} finally {
  resetDesktopPatientEvidenceForTests();
  delete globalThis.__hematuriaDesktopRuntimeEvidence;
}
