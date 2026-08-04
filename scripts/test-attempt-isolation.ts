import assert from "node:assert/strict";
import { attemptModeForTrainingMode, attemptPointerKey, attemptStorageKey, createAttempt, isAttemptCompatible, recordTimeoutOnce, trainingStateStorageKey } from "../src/lib/attemptState";

assert.equal(attemptModeForTrainingMode("random"), "free", "random case UI mode must use the durable free-attempt contract");
assert.equal(attemptModeForTrainingMode("demo"), "free");
assert.equal(attemptModeForTrainingMode("osce"), "osce");
assert.equal(attemptModeForTrainingMode("rct"), "rct");

const freeZh = createAttempt("P001", "free", "zh");
const freeEn = createAttempt("P001", "free", "en");
const osceZh = createAttempt("P001", "osce", "zh");
const participantA = createAttempt("P001", "rct", "zh", "participant-A");
const participantB = createAttempt("P001", "rct", "zh", "participant-B");
assert.notEqual(attemptStorageKey(freeZh), attemptStorageKey(freeEn));
assert.notEqual(attemptStorageKey(freeZh), attemptStorageKey(osceZh));
assert.notEqual(attemptStorageKey(participantA), attemptStorageKey(participantB));
assert.notEqual(attemptPointerKey("P001", "rct", "zh", participantA.participantId), attemptPointerKey("P001", "rct", "zh", participantB.participantId));
assert.notEqual(
  trainingStateStorageKey(freeZh.attemptId, "https://hematuria-training-system.vercel.app", "https://preview.example"),
  trainingStateStorageKey(freeZh.attemptId, "", "https://preview.example"),
  "signed training tokens must be isolated by their effective API origin"
);
assert.equal(isAttemptCompatible(freeZh, { caseId: "P001", mode: "free", language: "zh" }), true);
assert.equal(isAttemptCompatible(freeZh, { caseId: "P001", mode: "free", language: "en" }), false);
assert.equal(isAttemptCompatible(participantA, { caseId: "P001", mode: "rct", language: "zh", participantId: "participant-A", schemaVersion: "attempt-v3" }), true);
assert.equal(isAttemptCompatible(participantA, { caseId: "P001", mode: "rct", language: "zh", participantId: "participant-B", schemaVersion: "attempt-v3" }), false);

const identityScopes = [
  { caseId: "P001", mode: "free" as const, language: "zh" as const, participantId: "practice-user", schemaVersion: "attempt-v3" as const },
  { caseId: "P001", mode: "free" as const, language: "en" as const, participantId: "practice-user", schemaVersion: "attempt-v3" as const },
  { caseId: "P002", mode: "free" as const, language: "zh" as const, participantId: "practice-user", schemaVersion: "attempt-v3" as const },
  { caseId: "P001", mode: "rct" as const, language: "zh" as const, participantId: "participant-A", schemaVersion: "attempt-v3" as const }
];
const malformedIdentityVariants = [
  (attempt: Record<string, unknown>) => { delete attempt.schemaVersion; },
  (attempt: Record<string, unknown>) => { delete attempt.caseId; },
  (attempt: Record<string, unknown>) => { delete attempt.mode; },
  (attempt: Record<string, unknown>) => { delete attempt.language; },
  (attempt: Record<string, unknown>) => { delete attempt.participantId; },
  (attempt: Record<string, unknown>) => { delete attempt.attemptId; },
  (attempt: Record<string, unknown>) => { attempt.participantId = "wrong-participant"; }
];
let identityScenarioCount = 0;
for (const expected of identityScopes) {
  const valid = createAttempt(expected.caseId, expected.mode, expected.language, expected.participantId);
  for (const mutate of malformedIdentityVariants) {
    const malformed = { ...valid } as Record<string, unknown>;
    mutate(malformed);
    assert.equal(
      isAttemptCompatible(malformed as never, expected),
      false,
      `malformed identity must fail closed: ${JSON.stringify({ expected, malformed })}`
    );
    identityScenarioCount += 1;
  }
}
assert.equal(identityScenarioCount, 28);
const timed = recordTimeoutOnce(recordTimeoutOnce([]));
assert.equal(timed.filter((item) => item.type === "timeout").length, 1);
console.log(`Attempt isolation passed, including ${identityScenarioCount} malformed identity scenarios and unique timeout behavior.`);
