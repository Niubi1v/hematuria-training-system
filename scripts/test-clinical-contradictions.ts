import fs from "node:fs";
import casesJson from "../data/cases.json";
import type { CaseData } from "../src/lib/types";

type Issue = { caseId: string; severity: "error" | "review"; field: string; message: string };
type CaseWithSource = CaseData & { sourceFacts?: { pastHistory?: string; personalHistory?: string; medication?: string } };

const cases = casesJson as CaseWithSource[];
const issues: Issue[] = [];
const add = (caseId: string, field: string, message: string, severity: Issue["severity"] = "error") => issues.push({ caseId, field, message, severity });

for (const caseData of cases) {
  const history = caseData.structuredHistory;
  if (!history) { add(caseData.id, "structuredHistory", "Missing structured history"); continue; }
  const source = `${caseData.sourceFacts?.pastHistory || ""}；${caseData.sourceFacts?.personalHistory || ""}；${caseData.sourceFacts?.medication || ""}`;
  if (/(?:青霉素|磺胺|清开灵|头孢)[^。；]{0,20}过敏/.test(source) && history.allergyHistory.status !== "present") add(caseData.id, "allergyHistory", "Explicit allergy was converted to no allergy");
  if (/换(?:过)?(?:机械)?瓣膜|支架植入|切除术|做过[^。；]{0,20}手术/.test(source) && history.surgeryHistory.status !== "present") add(caseData.id, "surgeryHistory", "Surgery/intervention history was converted to no surgery");

  const smoking = history.smokingHistory;
  if (smoking.cigarettesPerDay > 0 && smoking.years > 0) {
    const expected = Math.round((smoking.cigarettesPerDay / 20) * smoking.years * 10) / 10;
    if (Math.abs(expected - smoking.packYears) > 0.2) add(caseData.id, "smokingHistory.packYears", `Expected ${expected}, got ${smoking.packYears}`);
  }
  if (/包/.test(history.alcoholHistory.amount) || /包/.test(history.alcoholHistory.patientAnswerZh)) add(caseData.id, "alcoholHistory", "Smoking quantity leaked into alcohol history");

  const names = history.medicationList.map((item) => item.name);
  if (new Set(names).size !== names.length) add(caseData.id, "medicationList", "Duplicate medication names");
  const zh = history.medicationAnswerZh;
  if ((zh.match(/[（(]/g) || []).length !== (zh.match(/[）)]/g) || []).length) add(caseData.id, "medicationAnswerZh", "Unbalanced parentheses");
  if (/[\u3400-\u9fff]/.test(history.medicationAnswerEn)) add(caseData.id, "medicationAnswerEn", "Chinese medication name remains in English answer");

  for (const [field, fact] of Object.entries(history)) {
    if (fact && typeof fact === "object" && "teacherReviewRequired" in fact && fact.teacherReviewRequired) add(caseData.id, field, "Author-added simulation fact requires clinical confirmation", "review");
  }
}

function requireCase(id: string) {
  const found = cases.find((item) => item.id === id);
  if (!found) throw new Error(`Missing regression case ${id}`);
  return found;
}
const p002 = requireCase("P002").structuredHistory!;
if (p002.allergyHistory.status !== "present" || p002.surgeryHistory.status !== "present" || !/warfarin/i.test(p002.medicationAnswerEn)) add("P002", "fixedRegression", "Allergy, valve surgery, and warfarin facts must remain consistent");
const p003 = requireCase("P003").structuredHistory!;
if (p003.smokingHistory.packYears !== 30 || p003.surgeryHistory.status !== "present" || /[\u3400-\u9fff]/.test(p003.medicationAnswerEn)) add("P003", "fixedRegression", "30 pack-years, surgery, and English medications must be preserved");
const p005 = requireCase("P005").structuredHistory!;
if (p005.allergyHistory.status !== "present" || p005.surgeryHistory.status !== "present" || new Set(p005.medicationList.map((item) => item.name)).size !== p005.medicationList.length) add("P005", "fixedRegression", "Allergy, coronary stent, and deduplicated medications must be preserved");
const p008 = requireCase("P008").structuredHistory!;
if (p008.smokingHistory.cigarettesPerDay !== 10 || p008.smokingHistory.packYears !== 10 || /包/.test(p008.alcoholHistory.patientAnswerZh) || p008.allergyHistory.status !== "absent") add("P008", "fixedRegression", "Half-pack smoking, occasional alcohol, and no-known-allergy facts are inconsistent");

const report = { schemaVersion: "clinical-contradiction-v1", caseCount: cases.length, errorCount: issues.filter((item) => item.severity === "error").length, reviewCount: issues.filter((item) => item.severity === "review").length, issues };
fs.writeFileSync("data/clinical_contradiction_report.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (report.errorCount) throw new Error(`Clinical contradiction checks failed: ${report.errorCount}\n${issues.filter((item) => item.severity === "error").slice(0, 12).map((item) => `${item.caseId}.${item.field}: ${item.message}`).join("\n")}`);
console.log(`Clinical contradiction checks passed for ${cases.length} cases; ${report.reviewCount} author-added facts remain for expert review.`);
