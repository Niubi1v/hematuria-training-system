import assert from "node:assert/strict";
import { attemptPointerKey, attemptStorageKey, createAttempt, isAttemptCompatible, recordTimeoutOnce } from "../src/lib/attemptState";

const freeZh = createAttempt("P001", "free", "zh");
const freeEn = createAttempt("P001", "free", "en");
const osceZh = createAttempt("P001", "osce", "zh");
const participantA = createAttempt("P001", "rct", "zh", "participant-A");
const participantB = createAttempt("P001", "rct", "zh", "participant-B");
assert.notEqual(attemptStorageKey(freeZh), attemptStorageKey(freeEn));
assert.notEqual(attemptStorageKey(freeZh), attemptStorageKey(osceZh));
assert.notEqual(attemptStorageKey(participantA), attemptStorageKey(participantB));
assert.notEqual(attemptPointerKey("P001", "rct", "zh", participantA.participantId), attemptPointerKey("P001", "rct", "zh", participantB.participantId));
assert.equal(isAttemptCompatible(freeZh, { caseId: "P001", mode: "free", language: "zh" }), true);
assert.equal(isAttemptCompatible(freeZh, { caseId: "P001", mode: "free", language: "en" }), false);
assert.equal(isAttemptCompatible(participantA, { caseId: "P001", mode: "rct", language: "zh", participantId: "participant-A", schemaVersion: "attempt-v3" }), true);
assert.equal(isAttemptCompatible(participantA, { caseId: "P001", mode: "rct", language: "zh", participantId: "participant-B", schemaVersion: "attempt-v3" }), false);
const timed = recordTimeoutOnce(recordTimeoutOnce([]));
assert.equal(timed.filter((item) => item.type === "timeout").length, 1);
console.log("Attempt isolation and unique timeout behavior passed.");
