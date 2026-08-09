import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const cases = require("../data/cases.json");
const { patientKnowableAllowlist, sourceValue, verifiedPatientKnowableRecords } = require("../server/patientKnowableAllowlist.js");
const { buildPatientKnowableFactIndex } = require("../server/patientKnowableFacts.js");

assert.equal(patientKnowableAllowlist.length, 96, "reviewed patient-knowable allowlist count");
assert.equal(new Set(patientKnowableAllowlist.map((entry) => `${entry.caseId}:${entry.intent}`)).size, 96, "duplicate case/intent allowlist entry");

let projected = 0;
for (const caseData of cases) {
  const verified = verifiedPatientKnowableRecords(caseData);
  const index = buildPatientKnowableFactIndex(caseData, "zh");
  projected += verified.length;
  assert.equal(index.allowlistRecords?.length, verified.length, `${caseData.displayCaseId}: runtime projection bypassed the allowlist`);
  for (const entry of verified) {
    assert.equal(entry.sourceFile, "data/cases.json", `${entry.caseId}:${entry.intent}: source file`);
    assert.deepEqual(entry.allowedIntents, [entry.intent], `${entry.caseId}:${entry.intent}: widened intent boundary`);
    assert.ok(String(sourceValue(caseData, entry.sourcePath) || "").includes(entry.sourceExcerpt), `${entry.caseId}:${entry.intent}: source drift`);
    assert.equal(index.facts[entry.intent], entry.patientAwareZh, `${entry.caseId}:${entry.intent}: projection drift`);
  }
}

assert.equal(projected, 96, "all reviewed facts must verify against their exact source binding");
console.log(JSON.stringify({ gate: "R5-PATIENT-KNOWABLE-ALLOWLIST", records: projected, sourceDrift: 0, broadProjection: 0 }, null, 2));
