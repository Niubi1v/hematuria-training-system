import assert from "node:assert/strict";
import publicCases from "../data/cases_public.json";
import { publicCaseHref, publicPageHref } from "../src/lib/publicRoutes";

const displayIds = publicCases.map((item) => item.displayCaseId || item.id);
assert.equal(displayIds.length, 42, "public route contract must cover all 42 cases");
assert.deepEqual(displayIds, Array.from({ length: 42 }, (_, index) => `P${String(index + 1).padStart(3, "0")}`));

for (const caseId of displayIds) {
  assert.equal(publicCaseHref(caseId), `/cases/${caseId}/`);
  assert.equal(publicCaseHref(caseId, {}, "/hematuria-training-system"), `/hematuria-training-system/cases/${caseId}/`);
  assert.equal(publicCaseHref(caseId, {}, "/hematuria-training-system/"), `/hematuria-training-system/cases/${caseId}/`);
  assert.equal(publicCaseHref(caseId, { mode: "random" }), `/cases/${caseId}/?mode=random`);
}

assert.equal(publicPageHref("random"), "/random/");
assert.equal(publicPageHref("/random/", "/hematuria-training-system"), "/hematuria-training-system/random/");
for (const unsafeId of ["", "../P001", "P001/../../teacher", "P001?mode=formal", "P001#answer"]) {
  assert.throws(() => publicCaseHref(unsafeId), /Invalid public case route ID/);
}
assert.throws(() => publicPageHref("cases", "/repo?redirect=evil"), /Invalid public base path/);

console.log("Portable public route contract passed for 42 cases across local/Vercel root and GitHub Pages basePath.");
