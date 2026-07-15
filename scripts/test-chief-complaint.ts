import cases from "@/data/cases.json";
import casesEn from "@/data/cases_en.json";
import policy from "@/data/chief_complaint_wording.json";
import { chiefComplaintForCase, patientOpeningForCase } from "@/src/lib/chiefComplaint";
import type { CaseData } from "@/src/lib/types";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const allCases = cases as CaseData[];
const englishCases = casesEn as Array<{ id: string; chiefComplaint: string }>;

for (const item of allCases) {
  const enCase = englishCases.find((candidate) => candidate.id === item.id);
  const zh = chiefComplaintForCase(item.id, item.studentChiefComplaint || item.chiefComplaint, "zh", enCase?.chiefComplaint);
  const en = chiefComplaintForCase(item.id, item.studentChiefComplaint || item.chiefComplaint, "en", enCase?.chiefComplaint);
  const openingZh = patientOpeningForCase(item.id, item.studentChiefComplaint || item.chiefComplaint, "zh", enCase?.chiefComplaint);
  assert(zh.length > 0 && en.length > 0 && openingZh.length > 0, `${item.id} complaint projection is empty`);
  assert(!/[+＋]/.test(`${zh}${en}${openingZh}`), `${item.id} patient-facing complaint contains a plus sign`);
  const update = (policy.updates as Record<string, { zh: string; en: string; openingZh: string }>)[item.id];
  if (update) {
    assert(zh === update.zh && en === update.en && openingZh === update.openingZh, `${item.id} does not match the audited wording policy`);
  }
}

console.log("Chief complaint patient-wording tests passed.");
