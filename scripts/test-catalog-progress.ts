import assert from "node:assert/strict";
import { attemptPointerKey, attemptStorageKey, createAttempt, trainingStateStorageKey } from "../src/lib/attemptState";
import { ATTEMPT_SUMMARY_KEY, createAttemptSummary, loadCatalogProgress } from "../src/lib/catalogProgress";

class MemoryStorage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const localStorage = new MemoryStorage();
const sessionStorage = new MemoryStorage();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage, sessionStorage }
});

const pageOrigin = "https://preview.example";
const apiBaseUrl = "";
const signedToken = `${"A".repeat(24)}.${"B".repeat(32)}`;

function seedValidAttempt(caseId = "P001") {
  const attempt = createAttempt(caseId, "free", "zh");
  localStorage.setItem(attemptPointerKey(caseId, "free", "zh"), JSON.stringify(attempt));
  localStorage.setItem(attemptStorageKey(attempt), JSON.stringify({
    attempt,
    activeStageNo: 1,
    submitted: {},
    finalReport: null
  }));
  sessionStorage.setItem(trainingStateStorageKey(attempt.attemptId, apiBaseUrl, pageOrigin), signedToken);
  return attempt;
}

function reset() {
  localStorage.clear();
  sessionStorage.clear();
}

const valid = seedValidAttempt();
assert.equal(loadCatalogProgress(apiBaseUrl, pageOrigin).progress.P001, "in-progress");

localStorage.setItem(attemptStorageKey(valid), JSON.stringify({
  attempt: valid,
  activeStageNo: 7,
  submitted: Object.fromEntries(Array.from({ length: 7 }, (_, index) => [index + 1, { score: 0 }])),
  finalReport: { total: 0, max: 360, reportVersion: 3 }
}));
localStorage.setItem(ATTEMPT_SUMMARY_KEY, JSON.stringify([createAttemptSummary(valid, 0, 360)]));
assert.equal(loadCatalogProgress(apiBaseUrl, pageOrigin).progress.P001, "completed");

const malformedMutations = [
  (pointer: Record<string, unknown>) => { delete pointer.schemaVersion; },
  (pointer: Record<string, unknown>) => { delete pointer.caseId; },
  (pointer: Record<string, unknown>) => { delete pointer.mode; },
  (pointer: Record<string, unknown>) => { delete pointer.language; },
  (pointer: Record<string, unknown>) => { delete pointer.participantId; },
  (pointer: Record<string, unknown>) => { delete pointer.attemptId; }
];
let falseProgressScenarioCount = 0;
for (const mutate of malformedMutations) {
  reset();
  const attempt = seedValidAttempt();
  const malformed = { ...attempt } as Record<string, unknown>;
  mutate(malformed);
  localStorage.setItem(attemptPointerKey("P001", "free", "zh"), JSON.stringify(malformed));
  assert.equal(loadCatalogProgress(apiBaseUrl, pageOrigin).progress.P001, undefined);
  falseProgressScenarioCount += 1;
}

reset();
localStorage.setItem(ATTEMPT_SUMMARY_KEY, JSON.stringify([{ caseId: "P001", total: 360 }]));
assert.equal(loadCatalogProgress(apiBaseUrl, pageOrigin).progress.P001, undefined);
falseProgressScenarioCount += 1;

reset();
const orphan = createAttempt("P001", "free", "zh");
localStorage.setItem(attemptStorageKey(orphan), JSON.stringify({ attempt: orphan, activeStageNo: 1, submitted: {} }));
assert.equal(loadCatalogProgress(apiBaseUrl, pageOrigin).progress.P001, undefined);
falseProgressScenarioCount += 1;

assert.equal(falseProgressScenarioCount, 8);
console.log("Catalog progress integrity passed: valid progress accepted and 8 malformed/unverified scenarios failed closed.");
