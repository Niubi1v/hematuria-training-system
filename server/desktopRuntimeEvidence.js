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
      || !Number.isSafeInteger(snapshot.cloudRequestCount)
      || snapshot.cloudRequestCount < 0
    ) {
      return null;
    }
    return {
      llamaServerReady: snapshot.llamaServerReady,
      localModelReady: snapshot.localModelReady,
      cloudRequestCount: snapshot.cloudRequestCount
    };
  } catch {
    return null;
  }
}

function desktopPatientEvidence(patient) {
  const runtime = runtimeSnapshot();
  if (!runtime) return null;

  const classificationSource = String(patient?.runtimeTrace?.classificationSource || "none");
  const classifierStatus = String(patient?.runtimeTrace?.classifierStatus || "not_invoked");
  const answerPlans = Array.isArray(patient?.answerPlans) ? patient.answerPlans : [];
  const localClassificationAccepted = runtime.llamaServerReady
    && runtime.localModelReady
    && classificationSource === "local_ai"
    && classifierStatus === "accepted"
    && patient?.runtimeTrace?.providerHttpSuccess === true;

  return {
    ...runtime,
    answerSource: localClassificationAccepted ? "local_ai" : "rule_fallback",
    ontologyApplied: answerPlans.length > 0,
    contextApplied: Boolean(patient?.contextResolution?.inherited),
    nineStateApplied: answerPlans.length > 0
      && answerPlans.every((plan) => FACT_STATES.has(String(plan?.factState || ""))),
    answerPlannerApplied: answerPlans.length > 0,
    modelFactAuthority: false
  };
}

module.exports = {
  desktopPatientEvidence,
  runtimeSnapshot
};
