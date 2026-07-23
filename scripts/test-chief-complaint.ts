import cases from "@/data/cases.json";
import casesEn from "@/data/cases_en.json";
import { generatedChiefComplaintEn, simplifiedChiefComplaint } from "@/src/lib/chiefComplaint";
import type { CaseData } from "@/src/lib/types";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const allCases = cases as CaseData[];
const englishCases = casesEn as Array<{ id: string; chiefComplaint: string }>;

for (const item of allCases) {
  const zh = simplifiedChiefComplaint(item.studentChiefComplaint || item.chiefComplaint, "zh");
  const raw = item.studentChiefComplaint || item.chiefComplaint;
  assert(!/肉眼血尿/.test(zh), `${item.id} gross hematuria should use patient-facing wording: ${zh}`);
  if (!/(?:血尿|尿潜血|尿隐血|小便.*红|尿色.*红|茶色尿|可乐色尿|酱油色尿)/.test(raw)) {
    assert(zh === raw, `${item.id} complaint without a hematuria marker must not gain one: ${raw} -> ${zh}`);
  }
  if (!/(?:[半\d一二两三四五六七八九十]+(?:小时|天|日|周|月|个月|年)(?:余|多|左右)?|\d+次)/.test(raw)) {
    assert(!/(?:数天|several days)/i.test(zh), `${item.id} complaint without a duration must not gain one: ${zh}`);
  }

  const enCase = englishCases.find((candidate) => candidate.id === item.id);
  const en = simplifiedChiefComplaint(item.studentChiefComplaint || item.chiefComplaint, "en", enCase?.chiefComplaint);
  assert(!/[一二三四五六七八九十半]/.test(en), `${item.id} English complaint should not contain Chinese duration: ${en}`);
  if (!/(?:[半\d一二两三四五六七八九十]+(?:小时|天|日|周|月|个月|年)(?:余|多|左右)?|\d+次)/.test(raw)) {
    assert(!/for several days/i.test(en), `${item.id} English complaint without a duration must not gain one: ${en}`);
  }
}

const wordingContracts = [
  ["间断肉眼血尿2个月", "间断小便变红2个月", "Intermittent red urine for 2 months"],
  ["无痛性肉眼血尿3周", "小便变红3周", "Red urine for 3 weeks"],
  ["体检发现镜下血尿3年", "体检发现尿检异常3年", "A routine urine test has shown microscopic blood for 3 years"],
  ["体检尿潜血阳性1天", "体检发现尿潜血阳性1天", "A routine urine test has been positive for blood for 1 day"],
  ["反复镜下血尿伴听力下降", "反复尿检发现潜血伴听力下降", "Microscopic blood has repeatedly been found on urine testing"],
  ["皮肤感染后茶色尿伴眼睑水肿1周", "皮肤感染后茶色尿伴眼睑水肿1周", "Tea-colored urine for 1 week"],
  ["发热腰痛伴尿频尿痛3天", "发热腰痛伴尿频尿痛3天", "Chief complaint pending medical review"]
] as const;

for (const [raw, expectedZh, expectedEn] of wordingContracts) {
  assert(simplifiedChiefComplaint(raw, "zh") === expectedZh, `Chinese wording mismatch: ${raw}`);
  assert(simplifiedChiefComplaint(raw, "en", expectedEn) === expectedEn, `English wording mismatch: ${raw}`);
}

const generatedBaselineContracts = [
  ["间断肉眼血尿2个月", "Hematuria for 2 months"],
  ["小便颜色变红5个月余", "Red urine for more than 5 months"],
  ["发热腰痛伴尿频尿痛3天", "Hematuria for 3 days"],
  ["发热、尿痛伴会阴胀痛2天", "Hematuria for 2 days"]
] as const;

for (const [raw, expected] of generatedBaselineContracts) {
  assert(
    generatedChiefComplaintEn(raw) === expected,
    `Generated complaint baseline changed: ${raw}`
  );
}

console.log("Chief complaint simplification tests passed.");
