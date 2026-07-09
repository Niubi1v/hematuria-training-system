import cases from "@/data/cases.json";
import casesEn from "@/data/cases_en.json";
import { simplifiedChiefComplaint } from "@/src/lib/chiefComplaint";
import type { CaseData } from "@/src/lib/types";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const allCases = cases as CaseData[];
const englishCases = casesEn as Array<{ id: string; chiefComplaint: string }>;

for (const item of allCases) {
  const zh = simplifiedChiefComplaint(item.studentChiefComplaint || item.chiefComplaint, "zh");
  assert(/^(血尿|小便颜色变红)/.test(zh), `${item.id} Chinese complaint should start with 血尿 or 小便颜色变红: ${zh}`);
  assert(/(?:[半\d一二两三四五六七八九十]+(?:小时|天|日|周|月|个月|年)(?:余|多|左右)?|数天)/.test(zh), `${item.id} Chinese complaint should include duration: ${zh}`);
  assert(!/无痛|全程|终末|起始|腰痛|排尿困难|尿频|尿急|尿痛|泡沫|皮疹|咽痛|体检发现|车祸|长跑/.test(zh), `${item.id} Chinese complaint leaked extra descriptors: ${zh}`);

  const enCase = englishCases.find((candidate) => candidate.id === item.id);
  const en = simplifiedChiefComplaint(item.studentChiefComplaint || item.chiefComplaint, "en", enCase?.chiefComplaint);
  assert(/^(Hematuria|Red urine) for /.test(en), `${item.id} English complaint should be simplified and translated: ${en}`);
  assert(!/[一二三四五六七八九十半]/.test(en), `${item.id} English complaint should not contain Chinese duration: ${en}`);
}

console.log("Chief complaint simplification tests passed.");
