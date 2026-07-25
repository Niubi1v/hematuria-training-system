import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const cases = require("../data/cases.json") as Array<{
  id: string;
  medicalReview?: { status?: string };
}>;
const slots = require("../data/patient_slots_bilingual.json") as Record<string, Record<string, {
  patientAnswerZh: string;
  patientAnswerEn: string;
  provenance: string;
  teacherReviewRequired: boolean;
}>>;
const { matchStructuredFacts } = require("../server/structuredFacts.js") as {
  matchStructuredFacts(caseData: unknown, question: string, language: "zh" | "en"): {
    replyText: string;
    matchedSlotIds: string[];
    collectableSlotIds?: string[];
    collectableFacts?: string[];
    fallbackReason?: string;
  } | null;
};
const { bilingualConflictEntries } = require("../server/bilingualConflictQuarantine.js") as {
  bilingualConflictEntries: Array<{ caseId: string; field: string }>;
};

const unknownZh = /没(?:有)?特别注意|没留意|记不(?:太)?清|记不准确|说不准/;
const unknownEn = /did not notice|have not noticed|cannot recall|do not clearly remember|not sure|did not pay/i;

function assertBilingualUnknown(caseId: string, field: string) {
  const item = slots[caseId]?.[field];
  assert.ok(item, `${caseId}.${field} fixture`);
  assert.match(item.patientAnswerZh, unknownZh, `${caseId}.${field} Chinese must be a natural patient uncertainty`);
  assert.match(item.patientAnswerEn, unknownEn, `${caseId}.${field} English must preserve uncertainty`);
}

assert.equal(cases.length, 42, "history reconciliation covers the complete 42-case library");
assert.equal(bilingualConflictEntries.length, 18, "HEM-P0-023 remains the fixed adjudication set");
assert.ok(cases.every((item) => item.medicalReview?.status === "needs_revision"), "engineering reconciliation must not approve cases");

assert.equal(slots.P001.pain.patientAnswerEn, "I have pain with it.", "HEM-P0-023 values stay frozen until adjudication");
assert.match(slots.P003.flank_pain.patientAnswerEn, /do not have flank pain/i);
assertBilingualUnknown("P004", "clots");
assert.match(slots.P005.hematuria_visibility.patientAnswerEn, /could see.*urine.*red/i);
assert.match(slots.P005.hematuria_visibility.patientAnswerEn, /urine test/i);
assert.match(slots.P006.clots.patientAnswerEn, /not noticed any blood clots/i);
assert.match(slots.P006.fever_chills.patientAnswerEn, /not had fever or chills/i);
assert.match(slots.P006.hematuria_visibility.patientAnswerEn, /could see.*pink/i);
assert.match(slots.P006.hematuria_visibility.patientAnswerEn, /urine test/i);
assert.match(slots.P007.fever_chills.patientAnswerEn, /not had fever/i);
assert.match(slots.P007.hematuria_visibility.patientAnswerEn, /could see.*urine.*red/i);
assert.match(slots.P007.hematuria_visibility.patientAnswerEn, /urine test/i);

const p002 = cases.find((item) => item.id === "P002");
assert.ok(p002, "P002 fixture");
for (const language of ["zh", "en"] as const) {
  const surgery = matchStructuredFacts(p002, language === "zh" ? "以前做过手术吗？" : "Have you had surgery?", language);
  assert.ok(surgery, `P002 surgery route (${language})`);
  assert.deepEqual(surgery.collectableSlotIds || [], [], "source-to-source conflict must not be collectable");
  assert.deepEqual(surgery.collectableFacts || [], [], "source-to-source conflict must not enter scoring facts");
  assert.equal(surgery.fallbackReason, "medical_history_pending_review");
  assert.match(surgery.replyText, language === "zh" ? /记不(?:太)?清|没特别注意/ : /cannot recall|not sure|did not notice/i);
}

console.log("History medical reconciliation regression passed for the first 7-case batch and blocked-source governance.");
