import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  desktopEvidenceSnapshot,
  desktopPatientEvidence,
  resetDesktopPatientEvidenceForTests,
  runtimeSnapshot
} = require("../server/desktopRuntimeEvidence.js");

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

  globalThis.__hematuriaDesktopRuntimeEvidence = () => ({
    llamaServerReady: true,
    localModelReady: true,
    model: "Qwen3-1.7B",
    cloudRequestCount: 0
  });
  assert.deepEqual(desktopEvidenceSnapshot(), {
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
  assert.deepEqual(desktopPatientEvidence(patient()), {
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

  globalThis.__hematuriaDesktopRuntimeEvidence = () => ({
    llamaServerReady: false,
    localModelReady: false,
    model: "Qwen3-4B",
    cloudRequestCount: 0
  });
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

  globalThis.__hematuriaDesktopRuntimeEvidence = () => ({
    llamaServerReady: true,
    localModelReady: true,
    model: "Qwen3-1.7B",
    cloudRequestCount: -1
  });
  assert.equal(runtimeSnapshot(), null);

  globalThis.__hematuriaDesktopRuntimeEvidence = () => ({
    llamaServerReady: true,
    localModelReady: true,
    model: "attacker-controlled-model",
    cloudRequestCount: 0
  });
  assert.equal(runtimeSnapshot(), null);

  process.stdout.write("desktop runtime evidence tests passed\n");
} finally {
  resetDesktopPatientEvidenceForTests();
  delete globalThis.__hematuriaDesktopRuntimeEvidence;
}
