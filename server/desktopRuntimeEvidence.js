"use strict";

const FACT_STATES = new Set([
  "known_true",
  "known_false",
  "exact_value",
  "approximate_value",
  "partially_known",
  "patient_not_aware",
  "missing",
  "needs_review",
  "medical_conflict"
]);
const UNKNOWN_REASONS = new Set([
  "fact_missing",
  "partial_fact",
  "patient_not_aware",
  "needs_review",
  "medical_conflict",
  "intent_ambiguous",
  "classifier_unavailable"
]);
const MODEL_ALIASES = new Set(["Qwen3-1.7B", "Qwen3-4B"]);
let lastPatientEvidence = null;

function safeToken(value, maxLength = 120) {
  const token = String(value || "");
  return token.length <= maxLength && /^[A-Za-z0-9:_-]+$/.test(token) ? token : null;
}

function runtimeSnapshot() {
  const provider = globalThis.__hematuriaDesktopRuntimeEvidence;
  if (typeof provider !== "function") return null;
  try {
    const snapshot = provider();
    if (
      !snapshot
      || typeof snapshot !== "object"
      || typeof snapshot.llamaServerReady !== "boolean"
      || typeof snapshot.localModelReady !== "boolean"
      || !MODEL_ALIASES.has(snapshot.model)
      || !Number.isSafeInteger(snapshot.cloudRequestCount)
      || snapshot.cloudRequestCount < 0
    ) {
      return null;
    }
    return {
      llamaServerReady: snapshot.llamaServerReady,
      localModelReady: snapshot.localModelReady,
      model: snapshot.model,
      cloudRequestCount: snapshot.cloudRequestCount
    };
  } catch {
    return null;
  }
}

function desktopPatientEvidence(patient, options = {}) {
  const runtime = runtimeSnapshot();
  if (!runtime) return null;

  const classificationSource = String(patient?.runtimeTrace?.classificationSource || "none");
  const classifierStatus = String(patient?.runtimeTrace?.classifierStatus || "not_invoked");
  const answerPlans = Array.isArray(patient?.answerPlans) ? patient.answerPlans : [];
  const runtimeIntent = safeToken(patient?.runtimeTrace?.intent, 80);
  const selectedPlan = [...answerPlans].reverse().find((plan) => (
    !runtimeIntent || String(plan?.intent || "") === runtimeIntent
  )) || answerPlans.at(-1) || null;
  const clauseOutcomes = Array.isArray(patient?.clauseOutcomes) ? patient.clauseOutcomes : [];
  const selectedOutcome = [...clauseOutcomes].reverse().find((outcome) => (
    !runtimeIntent || String(outcome?.intent || "") === runtimeIntent
  )) || clauseOutcomes.at(-1) || null;
  const factStateCandidate = String(selectedPlan?.factState || selectedOutcome?.factState || "");
  const factState = FACT_STATES.has(factStateCandidate) ? factStateCandidate : null;
  const unknownCandidate = String(
    selectedPlan?.unknownReason
    || selectedOutcome?.unknownReason
    || Object.values(patient?.unknownReasonCodes || {}).find((value) => UNKNOWN_REASONS.has(String(value)))
    || ""
  );
  const fallbackReason = safeToken(patient?.runtimeTrace?.fallbackReason, 120);
  const latencyCandidate = options.latency ?? patient?.runtimeTrace?.durationMs;
  const latency = Number.isFinite(Number(latencyCandidate))
    ? Math.max(0, Math.min(120_000, Math.round(Number(latencyCandidate))))
    : 0;
  const localClassificationAccepted = runtime.llamaServerReady
    && runtime.localModelReady
    && classificationSource === "local_ai"
    && classifierStatus === "accepted"
    && patient?.runtimeTrace?.providerHttpSuccess === true;

  const evidence = {
    ...runtime,
    answerSource: localClassificationAccepted ? "local_ai" : "rule_fallback",
    fallbackReason,
    intent: runtimeIntent,
    requestedSlot: safeToken(patient?.runtimeTrace?.requestedSlot),
    factState,
    unknown: UNKNOWN_REASONS.has(unknownCandidate) ? unknownCandidate : null,
    latency
  };
  lastPatientEvidence = Object.freeze({ ...evidence });
  return evidence;
}

function desktopEvidenceSnapshot() {
  const runtime = runtimeSnapshot();
  if (!runtime) return null;
  if (!lastPatientEvidence) {
    return {
      ...runtime,
      answerSource: null,
      fallbackReason: null,
      intent: null,
      requestedSlot: null,
      factState: null,
      unknown: null,
      latency: 0
    };
  }
  return {
    ...lastPatientEvidence,
    ...runtime
  };
}

function resetDesktopPatientEvidenceForTests() {
  lastPatientEvidence = null;
}

module.exports = {
  desktopEvidenceSnapshot,
  desktopPatientEvidence,
  resetDesktopPatientEvidenceForTests,
  runtimeSnapshot
};
