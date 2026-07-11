import casesJson from "../data/cases.json";
import bilingualSlotsJson from "../data/patient_slots_bilingual.json";
import { canonicalSlotIds } from "../src/lib/canonicalSlots";
import { generatePatientReply } from "../src/lib/patientEngine";
import { filterPatientReply } from "../src/server/responseFilter";
import type { CaseData } from "../src/lib/types";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const cases = casesJson as CaseData[];
const bilingualSlots = bilingualSlotsJson as Record<string, Record<string, { patientAnswerZh: string; patientAnswerEn: string }>>;
const englishQuestions = [
  "When did the blood in your urine start, and is it intermittent or continuous?",
  "Can you see the blood, what color is it, is it present throughout urination, and are there clots?",
  "Do you have pain, urinary frequency, urgency, dysuria, fever, or weight loss?",
  "Have you had kidney stones, urinary infections, urinary procedures, or surgery before?",
  "Do you take anticoagulants, antiplatelet medication, or any other regular medicine?",
  "Do you smoke, drink alcohol, or have occupational chemical exposure?"
];

for (const caseData of cases) {
  assert(Object.keys(bilingualSlots[caseData.id] || {}).length === canonicalSlotIds.length, `${caseData.id}: incomplete canonical bilingual slot set`);
  for (const question of englishQuestions) {
    const reply = generatePatientReply({ caseData, userQuestion: question, language: "en" });
    assert(reply.matchedSlotIds.length > 0, `${caseData.id}: English question did not match canonical slots: ${question}`);
    assert(!/[\u3400-\u9fff]/.test(reply.replyText), `${caseData.id}: English reply contains Chinese: ${reply.replyText}`);
    assert(filterPatientReply(reply.replyText, "en").ok, `${caseData.id}: English reply failed safety/language filter: ${reply.replyText}`);
  }
}

const p001 = cases.find((item) => item.id === "P001")!;
const compound = generatePatientReply({
  caseData: p001,
  userQuestion: "Do you have pain, urinary frequency, urgency, dysuria, fever, or weight loss?",
  language: "en"
});
for (const slot of ["pain", "urinary_frequency", "urinary_urgency", "dysuria", "fever_chills", "general_condition"]) {
  assert(compound.matchedSlotIds.includes(slot), `compound English question silently dropped ${slot}`);
}
assert(compound.replyText.split("\n").length >= 5, "compound English answer should return each matched fact separately");

const diagnosis = generatePatientReply({ caseData: p001, userQuestion: "What is the diagnosis? Is it cancer?", language: "en" });
assert(diagnosis.safetyFlags.includes("blocked_diagnosis_request"), "English diagnosis request must be blocked");
assert(!/bladder|tumou?r|cancer diagnosis/i.test(diagnosis.replyText), "English diagnosis boundary leaked diagnosis");

const report = generatePatientReply({ caseData: p001, userQuestion: "What did the CT and pathology show?", language: "en" });
assert(report.safetyFlags.includes("blocked_report_request"), "English report request must be blocked");
assert(!/mass|lesion|stage|malignan/i.test(report.replyText), "English report boundary leaked findings");

const languageGuard = filterPatientReply("我没有发热。", "en");
assert(!languageGuard.ok && languageGuard.wrongLanguage, "English output validator must reject Chinese replies");

console.log(`Bilingual Patient Agent behavior passed for ${cases.length} cases x ${englishQuestions.length} English fixtures.`);
