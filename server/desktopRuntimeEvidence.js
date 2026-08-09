"use strict";

const crypto = require("node:crypto");
const desktopSqliteStore = require("./desktopSqliteStore.js");

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
const RESPONSE_ERRORS = new Set([
  "tangential",
  "oversharing",
  "role_breaking",
  "off_script",
  "wrong_unknown",
  "context_lost",
  "polarity_error"
]);
let lastPatientEvidence = null;
const moduleInstanceId = crypto.randomUUID();

function runtimeAuditTrace(routeName, details = {}) {
  if (process.env.HEMATURIA_RUNTIME_AUDIT_TRACE !== "1") return;
  const providerPresent = typeof globalThis.__hematuriaDesktopRuntimeEvidence === "function";
  const runtimeSessionId = String(
    details.runtimeSessionId || process.env.HEMATURIA_DESKTOP_RUNTIME_SESSION_ID || ""
  );
  process.stderr.write(`${JSON.stringify({
    timestamp: new Date().toISOString(),
    routeName: safeToken(routeName, 80) || "runtime-audit",
    "process.pid": process.pid,
    "process.ppid": process.ppid,
    moduleInstanceId,
    runtimeSessionId,
    providerPresent,
    eventWriteAttempted: details.eventWriteAttempted === true,
    eventWriteSucceeded: details.eventWriteSucceeded === true,
    eventStoreKind: "desktop_sqlite",
    eventCount: Number.isSafeInteger(details.eventCount) ? details.eventCount : 0
  })}\n`);
}

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
      || typeof snapshot.sessionStartedAt !== "string"
      || !["lightweight", "standard"].includes(snapshot.modelProfile)
      || (snapshot.configuredMode !== null && !["lightweight", "standard"].includes(snapshot.configuredMode))
      || snapshot.effectiveMode !== snapshot.modelProfile
      || snapshot.effectiveModel !== snapshot.model
      || !["mentor_package", "packaged_model_fallback", "configured_preference", "runtime_default"].includes(snapshot.overrideSource)
      || snapshot.runtimeTarget !== "desktop"
      || typeof snapshot.productHead !== "string"
    ) {
      return null;
    }
    return {
      llamaServerReady: snapshot.llamaServerReady,
      localModelReady: snapshot.localModelReady,
      model: snapshot.model,
      modelProfile: snapshot.modelProfile,
      configuredMode: snapshot.configuredMode,
      effectiveMode: snapshot.effectiveMode,
      effectiveModel: snapshot.effectiveModel,
      overrideSource: snapshot.overrideSource,
      productHead: snapshot.productHead,
      runtimeTarget: snapshot.runtimeTarget,
      sessionStartedAt: snapshot.sessionStartedAt,
      cloudRequestCount: snapshot.cloudRequestCount
    };
  } catch {
    return null;
  }
}

function desktopPatientEvidence(patient, options = {}) {
  const runtime = runtimeSnapshot();
  const runtimeSessionId = safeToken(process.env.HEMATURIA_DESKTOP_RUNTIME_SESSION_ID, 160);
  if (!runtime) {
    let failureSummary = null;
    try {
      if (runtimeSessionId) failureSummary = desktopSqliteStore.recordDesktopRuntimeWriteFailure(runtimeSessionId);
    } catch {
      failureSummary = null;
    }
    runtimeAuditTrace("event-write-provider-missing", {
      eventWriteAttempted: true,
      eventCount: failureSummary
        ? failureSummary.localAiAcceptedCount + failureSummary.ruleFallbackCount
        : 0
    });
    return null;
  }
  if (!runtimeSessionId) {
    runtimeAuditTrace("event-write-session-missing", { eventWriteAttempted: true });
    return null;
  }

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
    latency,
    responseErrors: Array.isArray(patient?.runtimeTrace?.responseErrors)
      ? patient.runtimeTrace.responseErrors.filter((value) => RESPONSE_ERRORS.has(String(value)))
      : []
  };
  let audit;
  try {
    audit = desktopSqliteStore.writeDesktopRuntimeEvent({
      eventId: safeToken(options.eventId, 160) || crypto.randomUUID(),
      runtimeSessionId,
      eventType: localClassificationAccepted ? "local_ai_accepted" : "rule_fallback_used",
      timestamp: new Date().toISOString(),
      model: runtime.model,
      latency
    });
  } catch {
    try {
      audit = desktopSqliteStore.recordDesktopRuntimeWriteFailure(runtimeSessionId);
    } catch {
      audit = null;
    }
    runtimeAuditTrace("event-write-failed", {
      eventWriteAttempted: true,
      eventCount: audit ? audit.localAiAcceptedCount + audit.ruleFallbackCount : 0
    });
    lastPatientEvidence = Object.freeze({
      ...evidence,
      runtimeAuditHealthy: false,
      eventWriteFailureCount: audit?.eventWriteFailureCount ?? 1
    });
    return lastPatientEvidence;
  }
  runtimeAuditTrace(
    localClassificationAccepted ? "event-write-local-ai" : "event-write-rule-fallback",
    {
      eventWriteAttempted: true,
      eventWriteSucceeded: true,
      eventCount: audit.localAiAcceptedCount + audit.ruleFallbackCount
    }
  );
  lastPatientEvidence = Object.freeze({
    ...evidence,
    runtimeAuditHealthy: audit.runtimeAuditHealthy,
    eventWriteFailureCount: audit.eventWriteFailureCount
  });
  return evidence;
}

function desktopRuntimeSummary() {
  const runtime = runtimeSnapshot();
  if (!runtime) {
    runtimeAuditTrace("evidence-read-provider-missing");
    return null;
  }
  const runtimeSessionId = safeToken(process.env.HEMATURIA_DESKTOP_RUNTIME_SESSION_ID, 160);
  if (!runtimeSessionId) {
    runtimeAuditTrace("evidence-read-session-missing");
    return null;
  }
  let audit;
  try {
    audit = desktopSqliteStore.desktopRuntimeEventSummary(runtimeSessionId);
  } catch {
    runtimeAuditTrace("evidence-read-failed");
    return null;
  }
  if (!audit) {
    runtimeAuditTrace("evidence-read-session-missing");
    return null;
  }
  const summary = {
    schemaVersion: 1,
    sessionStartedAt: runtime.sessionStartedAt,
    runtimeTarget: runtime.runtimeTarget,
    model: runtime.model,
    modelProfile: runtime.modelProfile,
    configuredMode: runtime.configuredMode,
    effectiveMode: runtime.effectiveMode,
    effectiveModel: runtime.effectiveModel,
    overrideSource: runtime.overrideSource,
    productHead: runtime.productHead,
    llamaServerReady: runtime.llamaServerReady,
    localModelReady: runtime.localModelReady,
    localAiAcceptedCount: audit.localAiAcceptedCount,
    ruleFallbackCount: audit.ruleFallbackCount,
    eventWriteFailureCount: audit.eventWriteFailureCount,
    runtimeAuditHealthy: audit.runtimeAuditHealthy,
    cloudRequestCount: runtime.cloudRequestCount,
    generatedAt: new Date().toISOString()
  };
  runtimeAuditTrace("evidence-read", {
    eventCount: audit.localAiAcceptedCount + audit.ruleFallbackCount
  });
  return summary;
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
      latency: 0,
      responseErrors: []
    };
  }
  return {
    ...lastPatientEvidence,
    ...runtime
  };
}

function resetDesktopPatientEvidenceForTests() {
  lastPatientEvidence = null;
  const runtimeSessionId = safeToken(process.env.HEMATURIA_DESKTOP_RUNTIME_SESSION_ID, 160);
  if (runtimeSessionId) desktopSqliteStore.resetDesktopRuntimeSessionForTests(runtimeSessionId);
}

function desktopRuntimeEventsForTests() {
  const runtimeSessionId = safeToken(process.env.HEMATURIA_DESKTOP_RUNTIME_SESSION_ID, 160);
  return runtimeSessionId ? desktopSqliteStore.desktopRuntimeEventsForTests(runtimeSessionId) : [];
}

module.exports = {
  desktopEvidenceSnapshot,
  desktopPatientEvidence,
  desktopRuntimeEventsForTests,
  desktopRuntimeSummary,
  resetDesktopPatientEvidenceForTests,
  runtimeAuditTrace,
  runtimeSnapshot
};
