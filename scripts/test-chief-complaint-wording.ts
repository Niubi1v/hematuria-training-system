import casesJson from "../data/cases.json";
import casesEnJson from "../data/cases_en.json";
import publicCasesJson from "../data/cases_public.json";
import policyJson from "../data/chief_complaint_wording.json";
import runtimeWordingJson from "../data/chief_complaint_wording_runtime.json";
import slotsJson from "../data/patient_slots_bilingual.json";
import { patientOpeningForCase } from "../src/lib/chiefComplaint";
const { bilingualConflictEntries } = require("../server/bilingualConflictQuarantine.js") as {
  bilingualConflictEntries: Array<{ caseId: string; field: string; reviewItemId: string }>;
};
const { buildRawPatientFacingProfile } = require("../server/patientSession.js") as {
  buildRawPatientFacingProfile: (caseData: CaseLike, language: "zh" | "en") => {
    patient_opening_statement: { value: string };
  };
};

type Update = {
  displayCaseId: string;
  classification: string;
  zh: string;
  en: string;
  openingZh: string;
  openingEn: string;
  durationZh: string[];
  durationEn: string[];
};

type CaseLike = {
  id: string;
  displayCaseId?: string;
  studentChiefComplaint: string;
  chiefComplaint?: string;
  patientAnswers?: { opening?: string };
  patientFacingProfile?: { chiefComplaint?: string };
  medicalReview?: { status?: string };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const cases = casesJson as CaseLike[];
const casesEn = casesEnJson as Array<{ id: string; chiefComplaint: string; studentChiefComplaint: string }>;
const publicCases = publicCasesJson as Array<{ id: string; displayCaseId: string; studentChiefComplaint: string; chiefComplaintEn: string } & Record<string, unknown>>;
const policy = policyJson as {
  classifications: Record<string, string[]>;
  blockedMedical: Record<string, string>;
  updates: Record<string, Update>;
};
const runtimeWording = runtimeWordingJson as { updates: Record<string, Omit<Update, "displayCaseId" | "classification" | "durationZh" | "durationEn">> };
const slots = slotsJson as Record<string, { chief_complaint?: { patientAnswerZh?: string; patientAnswerEn?: string } }>;

const classified = Object.values(policy.classifications).flat();
assert(classified.length === 42, `classification matrix should contain 42 rows, got ${classified.length}`);
assert(new Set(classified).size === 42, "classification matrix contains duplicate case IDs");
assert(cases.every((item) => classified.includes(item.id)), "classification matrix does not cover every runtime case");
assert(Object.keys(policy.updates).length === 27, "automatic update queue should contain 27 cases");
assert(Object.keys(runtimeWording.updates).length === 27, "patient-visible runtime wording should contain 27 cases");
assert(Object.keys(policy.blockedMedical).length === 15, "BLOCKED_MEDICAL queue should contain 15 cases");
assert(Object.keys(policy.updates).every((id) => !policy.blockedMedical[id]), "a blocked case was added to the automatic update queue");
for (const item of publicCases) {
  assert(!/[+＋]/.test(`${item.studentChiefComplaint}${item.chiefComplaintEn}`), `${item.id} public complaint contains a plus sign`);
  assert(!("diagnosis" in item) && !("finalDiagnosis" in item) && !("title" in item), `${item.id} public catalog leaks diagnosis fields`);
}

for (const [id, update] of Object.entries(policy.updates)) {
  const item = cases.find((candidate) => candidate.id === id);
  const en = casesEn.find((candidate) => candidate.id === id);
  const publicCase = publicCases.find((candidate) => candidate.id === id);
  const chiefSlot = slots[id]?.chief_complaint;
  assert(item && en && publicCase && chiefSlot, `${id} is missing a required complaint projection`);
  const runtime = runtimeWording.updates[id];
  assert(runtime?.zh === update.zh && runtime.en === update.en && runtime.openingZh === update.openingZh && runtime.openingEn === update.openingEn, `${id} patient-visible runtime wording drifted from the audited policy`);

  assert(item.studentChiefComplaint === update.zh, `${id} Chinese complaint was not updated`);
  assert(item.chiefComplaint === update.zh, `${id} canonical Chinese complaint was not updated`);
  if (item.patientFacingProfile) assert(item.patientFacingProfile.chiefComplaint === update.zh, `${id} patient profile complaint was not updated`);
  assert(en.chiefComplaint === update.en && en.studentChiefComplaint === update.en, `${id} English complaint was not updated`);
  assert(publicCase.studentChiefComplaint === update.zh && publicCase.chiefComplaintEn === update.en, `${id} public catalog is stale`);
  assert(chiefSlot.patientAnswerZh === update.zh && chiefSlot.patientAnswerEn === update.en, `${id} Patient Agent chief slot is stale`);
  assert(item.patientAnswers?.opening === update.openingZh, `${id} Patient Agent opening was not updated`);
  assert(patientOpeningForCase(id, item.studentChiefComplaint, "zh", en.chiefComplaint) === update.openingZh, `${id} client Chinese opening is stale`);
  assert(patientOpeningForCase(id, item.studentChiefComplaint, "en", en.chiefComplaint) === update.openingEn, `${id} client English opening is stale`);
  assert(buildRawPatientFacingProfile(item, "zh").patient_opening_statement.value === update.openingZh, `${id} server Chinese opening is stale`);
  assert(buildRawPatientFacingProfile(item, "en").patient_opening_statement.value === update.openingEn, `${id} server English opening is stale`);

  assert(!/[+＋]/.test(`${update.zh}${update.en}${update.openingZh}${update.openingEn}`), `${id} contains a plus sign`);
  for (const token of update.durationZh) assert(update.zh.includes(token) || update.openingZh.includes(token), `${id} lost Chinese duration ${token}`);
  for (const token of update.durationEn) assert(update.en.includes(token) || update.openingEn.includes(token), `${id} lost English duration ${token}`);

  if (update.classification === "visible_gross_hematuria") {
    assert(/小便(?:变红|发红)/.test(update.zh), `${id} visible hematuria is not patient-worded`);
    assert(!/(?:^|伴|、)肉眼血尿|(?:^|伴|、)血尿/.test(update.zh), `${id} retains medical hematuria wording`);
    assert(/red urine|red-tinged urine/i.test(update.en), `${id} English visible complaint is not patient-worded`);
  }
  if (update.classification === "microscopic_non_visible_hematuria") {
    assert(!/小便(?:变红|发红)/.test(update.zh), `${id} microscopic case was upgraded to visible red urine`);
    assert(!/^Red urine|red-tinged urine/i.test(update.en), `${id} English microscopic case was upgraded to visible red urine`);
    assert(!/看到.*(?:红|血)|小便.*(?:变红|发红)/.test(update.openingZh), `${id} microscopic opening claims visible red urine`);
  }
  if (update.classification === "tea_or_cola_colored_urine") {
    assert(/茶色|酱油色|可乐色/.test(update.zh), `${id} lost the source urine color`);
    assert(/tea-colored|cola-colored|pale red/i.test(update.en), `${id} English complaint lost the source urine color`);
  }
  if (update.classification === "menstrual_or_genital_contamination") {
    assert(/经期/.test(update.zh) && !/小便(?:变红|发红)/.test(update.zh), `${id} contamination case was upgraded to visible hematuria`);
  }
}

const conflictCaseIds = new Set<string>(bilingualConflictEntries.map((item) => item.caseId));
assert(conflictCaseIds.size === 11, `HEM-P0-023 should cover 11 cases, got ${conflictCaseIds.size}`);
for (const id of conflictCaseIds) assert(policy.blockedMedical[id]?.includes("HEM-P0-023"), `${id} HEM-P0-023 case is not blocked`);
for (const item of cases) assert(item.medicalReview?.status === "needs_revision", `${item.id} medical review status changed`);

console.log("Chief complaint wording matrices passed for 42 Chinese cases, 42 English cases, openings, bilingual meaning, durations, colors, contamination, and review isolation.");
