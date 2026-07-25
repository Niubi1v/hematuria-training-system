import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const cases = require("../data/cases.json") as Array<{
  id: string;
  medicalReview?: { status?: string };
  medication?: string;
  sourceFacts?: { medication?: string };
  structuredHistory?: {
    anticoagulantUse?: { status?: string; provenance?: string; teacherReviewRequired?: boolean };
    antiplateletUse?: { status?: string; provenance?: string; teacherReviewRequired?: boolean };
    medicationList?: Array<{ name: string }>;
    medicationAnswerZh?: string;
    medicationAnswerEn?: string;
  };
}>;
const slots = require("../data/patient_slots_bilingual.json") as Record<string, Record<string, {
  patientAnswerZh: string;
  patientAnswerEn: string;
  provenance: string;
  teacherReviewRequired: boolean;
}>>;
const historyPolicy = require("../data/history_medical_reconciliation.json") as {
  blockedMedicalHistory: Array<{
    caseId: string;
    displayCaseId?: string;
    canonicalSlotId?: string;
    disposition: string;
    teacherReviewRequired: boolean;
    reviewStatus: string;
  }>;
};
const { matchStructuredFacts } = require("../server/structuredFacts.js") as {
  matchStructuredFacts(caseData: unknown, question: string, language: "zh" | "en"): {
    replyText: string;
    matchedSlotIds: string[];
    collectableSlotIds?: string[];
    collectableFacts?: string[];
    fallbackReason?: string;
  } | null;
};
const { matchCanonicalPatientFacts } = require("../server/canonicalFacts.js") as {
  matchCanonicalPatientFacts(caseId: string, question: string, language: "zh" | "en"): {
    replyText: string;
    matchedSlotIds: string[];
    collectableSlotIds?: string[];
    collectableFacts?: string[];
    unresolvedReason?: string;
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
assert.equal(historyPolicy.blockedMedicalHistory.length, 14, "all identified medical-history ambiguities remain explicitly blocked");
assert.ok(historyPolicy.blockedMedicalHistory.every((item) =>
  item.disposition === "BLOCKED_MEDICAL"
  && item.teacherReviewRequired
  && item.reviewStatus === "needs_review"
), "blocked medical history must require unresolved teacher review");

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

assert.match(slots.P008.pain.patientAnswerEn, /have pain/i);
assert.match(slots.P008.voiding_difficulty.patientAnswerEn, /difficulty|straining/i);
assert.match(slots.P009.hematuria_visibility.patientAnswerEn, /tea- or cola-colored/i);
assertBilingualUnknown("P009", "hematuria_phase");
assert.match(slots.P009.radiating_pain.patientAnswerEn, /radiates.*groin/i);
assert.match(slots.P010.flank_pain.patientAnswerEn, /have pain in my flank/i);
assertBilingualUnknown("P010", "clots");
assertBilingualUnknown("P011", "hematuria_phase");
assert.match(slots.P011.renal_colic.patientAnswerEn, /not had severe colicky/i);
assert.match(slots.P011.recent_uri.patientAnswerEn, /followed a recent cold|sore throat/i);
assertBilingualUnknown("P012", "hematuria_phase");
assertBilingualUnknown("P012", "fever_chills");
assert.match(slots.P012.recent_uri.patientAnswerEn, /followed a recent cold|sore throat/i);

assert.equal(slots["HX-ADD-001"].pain.patientAnswerEn, "I have pain with it.", "HEM-P0-023 pain value stays frozen");
assert.match(slots["HX-ADD-001"].dysuria.patientAnswerEn, /does not hurt/i);
assert.match(slots["HX-ADD-001"].urinary_frequency.patientAnswerEn, /not been urinating more often/i);
assert.match(slots["HX-ADD-001"].glomerular_features.patientAnswerEn, /not noticed foamy urine/i);
assert.match(slots["HX-ADD-001"].medications.patientAnswerEn, /amlodipine/i);
assert.match(slots["HX-ADD-002"].urinary_frequency.patientAnswerEn, /urinating more often/i);
assert.match(slots["HX-ADD-002"].voiding_difficulty.patientAnswerEn, /do not have difficulty/i);
assert.match(slots["HX-ADD-003"].flank_pain.patientAnswerEn, /have pain in my flank/i);
assert.match(slots["HX-ADD-003"].renal_colic.patientAnswerEn, /not had severe colicky/i);
assertBilingualUnknown("HX-ADD-003", "recent_uri");
assertBilingualUnknown("HX-ADD-004", "pain");
assert.match(slots["HX-ADD-004"].renal_colic.patientAnswerEn, /not had severe colicky/i);
assert.match(slots["HX-ADD-005"].medications.patientAnswerEn, /statin/i);
assert.match(slots["HX-ADD-006"].urinary_urgency.patientAnswerEn, /sudden urgent need/i);
assert.match(slots["HX-ADD-006"].voiding_difficulty.patientAnswerEn, /do not have difficulty/i);

assertBilingualUnknown("HX-ADD-007", "hematuria_visibility");
assertBilingualUnknown("HX-ADD-007", "hematuria_phase");
assert.match(slots["HX-ADD-007"].urine_color.patientAnswerEn, /looked normal|only on testing/i);
assert.match(slots["HX-ADD-007"].fever_chills.patientAnswerEn, /have had fever/i);
assertBilingualUnknown("HX-ADD-008", "radiating_pain");
assertBilingualUnknown("HX-ADD-010", "hematuria_phase");
assert.match(slots["HX-ADD-010"].urine_color.patientAnswerEn, /looked normal|only on testing/i);
assert.match(slots["HX-ADD-010"].fever_chills.patientAnswerEn, /have had fever/i);
assertBilingualUnknown("HX-ADD-012", "renal_colic");

assert.match(slots["HX-ADD-013"].hematuria_phase.patientAnswerEn, /near the end/i);
assert.match(slots["HX-ADD-013"].clots.patientAnswerEn, /noticed blood clots/i);
assert.match(slots["HX-ADD-013"].pain.patientAnswerEn, /have pain/i);
assert.match(slots["HX-ADD-014"].medications.patientAnswerEn, /diabetes medication/i);
assert.match(slots["HX-ADD-014"].medications.patientAnswerEn, /cannot recall the exact name/i);
assert.match(slots["HX-ADD-015"].renal_colic.patientAnswerEn, /have had severe colicky/i);
assert.match(slots["HX-ADD-015"].radiating_pain.patientAnswerEn, /radiates.*lower abdomen|radiates.*groin/i);
assert.match(slots["HX-ADD-015"].medications.patientAnswerEn, /allopurinol/i);
assert.match(slots["HX-ADD-015"].medications.patientAnswerEn, /not consistently/i);
assertBilingualUnknown("HX-ADD-016", "clots");
assertBilingualUnknown("HX-ADD-017", "clots");
assert.match(slots["HX-ADD-017"].anticoagulant.patientAnswerEn, /do not take anticoagulants/i);
assert.match(slots["HX-ADD-017"].antiplatelet.patientAnswerEn, /take antiplatelet/i);
assert.doesNotMatch(slots["HX-ADD-017"].medications.patientAnswerEn, /warfarin|rivaroxaban/i);
assert.match(slots["HX-ADD-017"].medications.patientAnswerEn, /aspirin/i);
assert.match(slots["HX-ADD-017"].medications.patientAnswerEn, /tamsulosin/i);
assertBilingualUnknown("HX-ADD-018", "hematuria_phase");
assert.match(slots["HX-ADD-018"].urine_color.patientAnswerEn, /looked normal|only on testing/i);

assert.match(slots["HX-ADD-019"].hematuria_visibility.patientAnswerEn, /tea- or cola-colored/i);
assert.match(slots["HX-ADD-019"].urine_color.patientAnswerEn, /tea- or cola-colored/i);
assert.match(slots["HX-ADD-019"].flank_pain.patientAnswerEn, /mild soreness/i);
assert.match(slots["HX-ADD-019"].glomerular_features.patientAnswerEn, /noticed unusually foamy urine/i);
assert.match(slots["HX-ADD-019"].glomerular_features.patientAnswerEn, /swelling around my eyes or legs/i);
assert.match(slots["HX-ADD-019"].recent_uri.patientAnswerEn, /recent cold|sore throat/i);
assertBilingualUnknown("HX-ADD-020", "fever_chills");
assert.match(slots["HX-ADD-020"].glomerular_features.patientAnswerEn, /noticed unusually foamy urine/i);
assert.match(slots["HX-ADD-020"].glomerular_features.patientAnswerEn, /swelling around my eyes or legs/i);
assert.match(slots["HX-ADD-020"].triggers.patientAnswerEn, /after a skin infection/i);
assert.match(slots["HX-ADD-021"].hematuria_visibility.patientAnswerEn, /could not see red urine/i);
assert.match(slots["HX-ADD-021"].hematuria_frequency.patientAnswerEn, /intermittent|present every time/i);
assertBilingualUnknown("HX-ADD-021", "hematuria_phase");
assert.match(slots["HX-ADD-021"].urine_color.patientAnswerEn, /looked normal|only on testing/i);
assertBilingualUnknown("HX-ADD-022", "hematuria_visibility");
assert.match(slots["HX-ADD-022"].hematuria_frequency.patientAnswerEn, /intermittent|present every time/i);
assertBilingualUnknown("HX-ADD-022", "hematuria_phase");
assert.match(slots["HX-ADD-022"].glomerular_features.patientAnswerEn, /did not pay close attention.*foamy/i);
assert.match(slots["HX-ADD-022"].glomerular_features.patientAnswerEn, /not noticed swelling/i);
assert.match(slots["HX-ADD-023"].hematuria_visibility.patientAnswerEn, /blood was found on testing/i);
assert.match(slots["HX-ADD-023"].hematuria_visibility.patientAnswerEn, /tea- or cola-colored/i);
assertBilingualUnknown("HX-ADD-023", "hematuria_phase");
assert.match(slots["HX-ADD-023"].urine_color.patientAnswerEn, /tea- or cola-colored/i);
assert.match(slots["HX-ADD-023"].glomerular_features.patientAnswerEn, /noticed unusually foamy urine/i);
assert.match(slots["HX-ADD-023"].glomerular_features.patientAnswerEn, /swelling around my eyes or legs/i);
assert.match(slots["HX-ADD-023"].fever_chills.patientAnswerEn, /low fever/i);
assert.match(slots["HX-ADD-024"].hematuria_frequency.patientAnswerEn, /only once/i);
assert.match(slots["HX-ADD-024"].triggers.patientAnswerEn, /after a long run|strenuous exercise/i);

assertBilingualUnknown("HX-ADD-025", "hematuria_visibility");
assert.match(slots["HX-ADD-025"].urine_color.patientAnswerEn, /menstruation|menstrual blood/i);
assert.match(slots["HX-ADD-025"].gynecologic_contamination.patientAnswerEn, /menstruating|contaminated/i);
assertBilingualUnknown("HX-ADD-026", "hematuria_frequency");
assertBilingualUnknown("HX-ADD-026", "clots");
assert.match(slots["HX-ADD-026"].triggers.patientAnswerEn, /traffic accident|direct blow/i);
assert.match(slots["HX-ADD-026"].urine_color.patientAnswerEn, /bright to dark red/i);
assert.match(slots["HX-ADD-027"].hematuria_frequency.patientAnswerEn, /intermittent|present every time/i);
assertBilingualUnknown("HX-ADD-027", "clots");
assertBilingualUnknown("HX-ADD-027", "renal_colic");
assert.match(slots["HX-ADD-027"].urine_color.patientAnswerEn, /tea-colored or pale red/i);
assert.match(slots["HX-ADD-027"].medications.patientAnswerEn, /ibuprofen/i);
assert.match(slots["HX-ADD-027"].medications.patientAnswerEn, /combination painkillers/i);
assert.match(slots["HX-ADD-027"].medications.patientAnswerEn, /cannot recall the exact amount or frequency/i);
assertBilingualUnknown("HX-ADD-028", "hematuria_frequency");
assertBilingualUnknown("HX-ADD-028", "clots");
assertBilingualUnknown("HX-ADD-029", "hematuria_visibility");
assert.match(slots["HX-ADD-029"].hematuria_frequency.patientAnswerEn, /intermittent|present every time/i);
assert.match(slots["HX-ADD-029"].pain.patientAnswerEn, /have pain/i);
assertBilingualUnknown("HX-ADD-029", "triggers");
assert.match(slots["HX-ADD-029"].gynecologic_contamination.patientAnswerEn, /between periods|no abnormal vaginal bleeding/i);
assert.match(slots["HX-ADD-030"].hematuria_visibility.patientAnswerEn, /could not see red urine/i);
assert.match(slots["HX-ADD-030"].hematuria_frequency.patientAnswerEn, /intermittent|present every time/i);
assertBilingualUnknown("HX-ADD-030", "hematuria_phase");
assert.match(slots["HX-ADD-030"].urine_color.patientAnswerEn, /looked normal|only on testing/i);
assert.match(slots["HX-ADD-030"].triggers.patientAnswerEn, /did not have exercise|trauma|urinary procedure/i);

const p026 = cases.find((item) => item.id === "HX-ADD-014");
assert.deepEqual(p026?.structuredHistory?.medicationList?.map((item) => item.name), ["降糖药"]);
const p027 = cases.find((item) => item.id === "HX-ADD-015");
assert.deepEqual(p027?.structuredHistory?.medicationList?.map((item) => item.name), ["别嘌醇"]);
const p029 = cases.find((item) => item.id === "HX-ADD-017");
assert.deepEqual(p029?.structuredHistory?.medicationList?.map((item) => item.name), ["阿司匹林", "坦索罗辛"]);
assert.equal(p029?.structuredHistory?.anticoagulantUse?.status, "absent");
assert.equal(p029?.structuredHistory?.anticoagulantUse?.provenance, "source");
assert.equal(p029?.structuredHistory?.anticoagulantUse?.teacherReviewRequired, false);
assert.equal(p029?.structuredHistory?.antiplateletUse?.status, "present");
assert.match(p029?.sourceFacts?.medication || "", /否认华法林、利伐沙班/);
const p039 = cases.find((item) => item.id === "HX-ADD-027");
assert.deepEqual(p039?.structuredHistory?.medicationList?.map((item) => item.name), ["布洛芬", "复方止痛药"]);
assert.match(p039?.sourceFacts?.medication || "", /长期自行服用布洛芬\/复方止痛药/);

const blockedQuestions: Record<string, { zh: string; en: string }> = {
  hematuria_visibility: { zh: "这是肉眼血尿还是镜下血尿？", en: "Was this visible blood or microscopic hematuria?" },
  renal_colic: { zh: "这是肾绞痛吗？", en: "Did you have renal colic?" },
  clots: { zh: "尿里有血块吗？", en: "Were there blood clots in the urine?" },
  flank_pain: { zh: "有没有腰痛或腰酸？", en: "Did you have flank pain or soreness?" },
  fever_chills: { zh: "有没有发热或寒战？", en: "Did you have fever or chills?" }
};
for (const blocked of historyPolicy.blockedMedicalHistory.filter((item) => item.canonicalSlotId)) {
  const question = blockedQuestions[blocked.canonicalSlotId || ""];
  assert.ok(question, `question fixture for blocked slot ${blocked.canonicalSlotId}`);
  const probe = { caseId: blocked.caseId, ...question };
  for (const language of ["zh", "en"] as const) {
    const governed = matchCanonicalPatientFacts(probe.caseId, probe[language], language);
    assert.ok(governed, `${probe.caseId} governed canonical route (${language})`);
    assert.deepEqual(governed.collectableSlotIds || [], [], `${probe.caseId} blocked medical fact must not be collectable`);
    assert.deepEqual(governed.collectableFacts || [], [], `${probe.caseId} blocked medical fact must not enter scoring`);
    assert.equal(governed.unresolvedReason, "medical_history_pending_review");
  }
}

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

console.log("History medical reconciliation regression passed for all 42 cases with blocked-source governance.");
