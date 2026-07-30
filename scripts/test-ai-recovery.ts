import assert from "node:assert/strict";
import { isConnectionFailureFallback, isSafetyFallback, mergeRecoveredCoverage, recordConnectionTransition, validCachedSession, type CachedPatientSession } from "../src/lib/aiRecovery";
import type { CollectedMap } from "../src/lib/types";

const base: CachedPatientSession = {
  sessionId: "session-1",
  attemptId: "attempt-1",
  caseId: "P001",
  language: "zh",
  mode: "free",
  patientOpeningStatement: "医生您好。",
  sessionCreatedAt: "2026-07-11T10:00:00.000Z",
  sessionExpiresAt: "2026-07-11T10:30:00.000Z",
  deploymentSha: "sha-new",
  apiVersion: "2.6.0",
  aiStatus: "available",
  profileSource: "local-simulation"
};

assert.equal(validCachedSession(base, { attemptId: "attempt-1", caseId: "P001", language: "zh", mode: "free", deploymentSha: "sha-new", apiVersion: "2.6.0", now: Date.parse("2026-07-11T10:10:00.000Z") }), true);
assert.equal(validCachedSession(base, { attemptId: "attempt-other", caseId: "P001", language: "zh", mode: "free", deploymentSha: "sha-new", apiVersion: "2.6.0", now: Date.parse("2026-07-11T10:10:00.000Z") }), false, "attempt change must invalidate session");
assert.equal(validCachedSession(base, { attemptId: "attempt-1", caseId: "P001", language: "zh", mode: "free", deploymentSha: "sha-new", apiVersion: "2.6.0", now: Date.parse("2026-07-11T10:31:00.000Z") }), false, "expired session must be rebuilt");
assert.equal(validCachedSession(base, { attemptId: "attempt-1", caseId: "P001", language: "zh", mode: "free", deploymentSha: "sha-other", apiVersion: "2.6.0", now: Date.parse("2026-07-11T10:10:00.000Z") }), false, "deployment change must invalidate session");
assert.equal(validCachedSession(base, { attemptId: "attempt-1", caseId: "P001", language: "zh", mode: "free", deploymentSha: "sha-new", apiVersion: "2.5.0", now: Date.parse("2026-07-11T10:10:00.000Z") }), false, "API version change must invalidate session");

for (const reason of ["llm_error", "provider_timeout", "provider_rate_limit", "provider_unavailable"]) assert.equal(isConnectionFailureFallback(reason), true, reason);
for (const reason of ["diagnosis_boundary", "report_boundary", "compound_question_preserves_all_facts", "unsafe_deterministic_answer", "blocked_report_request"]) {
  assert.equal(isConnectionFailureFallback(reason), false, `${reason} is a safety fallback, not a disconnection`);
  assert.equal(isSafetyFallback(reason), true);
}

const empty = Object.fromEntries(["onset", "hematuriaType", "hematuriaPhase", "colorClots", "irritativeSymptoms", "flankPain", "fever", "voidingDifficulty", "smoking", "occupation", "stoneHistory", "infectionHistory", "trauma", "anticoagulants", "tumorFamilyHistory", "historyBundle"].map((key) => [key, false])) as CollectedMap;
const recovered = mergeRecoveredCoverage([], empty, ["smoking", "fever_chills"], { smoking: "smoking", fever_chills: "fever" });
assert.deepEqual(recovered.askedSlots, ["smoking", "fever_chills"]);
assert.equal(recovered.collected.smoking, true);
assert.equal(recovered.collected.fever, true);

let transitions = recordConnectionTransition([], "unknown", "checking", "2026-07-13T00:00:00.000Z");
transitions = recordConnectionTransition(transitions, "checking", "connected", "2026-07-13T00:00:01.000Z");
transitions = recordConnectionTransition(transitions, "connected", "connected", "2026-07-13T00:00:02.000Z");
assert.deepEqual(transitions, [
  { at: "2026-07-13T00:00:00.000Z", from: "idle", to: "initializing" },
  { at: "2026-07-13T00:00:01.000Z", from: "initializing", to: "ready" }
]);

console.log("AI recovery state, session expiry, deployment invalidation, safety fallback and coverage restoration passed.");
