import assert from "node:assert/strict";
import { attemptStorageKey, createAttempt, isAttemptCompatible, recordTimeoutOnce } from "../src/lib/attemptState";

const freeZh = createAttempt("P001", "free", "zh");
const freeEn = createAttempt("P001", "free", "en");
const osceZh = createAttempt("P001", "osce", "zh");
assert.notEqual(attemptStorageKey(freeZh), attemptStorageKey(freeEn));
assert.notEqual(attemptStorageKey(freeZh), attemptStorageKey(osceZh));
assert.equal(isAttemptCompatible(freeZh, { caseId: "P001", mode: "free", language: "zh" }), true);
assert.equal(isAttemptCompatible(freeZh, { caseId: "P001", mode: "free", language: "en" }), false);
const timed = recordTimeoutOnce(recordTimeoutOnce([]));
assert.equal(timed.filter((item) => item.type === "timeout").length, 1);
console.log("Attempt isolation and unique timeout behavior passed.");
