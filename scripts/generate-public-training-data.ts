import fs from "node:fs";
import path from "node:path";
import cases from "../data/cases.json";
import casesEn from "../data/cases_en.json";
import { caseRubric } from "../src/lib/eventScoring";
import type { CaseData } from "../src/lib/types";

const root = path.resolve(process.cwd(), "data");
const englishById = new Map((casesEn as Array<Record<string, unknown>>).map((item) => [String(item.id), item]));
const publicCases = (cases as CaseData[]).map((item) => {
  const en = englishById.get(item.id) || {};
  return {
    id: item.id,
    displayCaseId: item.displayCaseId || item.id,
    age: item.age,
    sex: item.sex,
    sexEn: String(en.sex || (item.sex === "女" ? "Female" : "Male")),
    difficulty: item.difficulty || "",
    difficultyEn: String(en.difficulty || ""),
    studentChiefComplaint: item.studentChiefComplaint || item.chiefComplaint,
    chiefComplaintEn: String(en.chiefComplaint || "Hematuria"),
    caseVersion: item.caseVersion || "unknown",
    medicalReviewStatus: item.medicalReview?.status || "needs_revision",
    sourceGroup: item.id.startsWith("HX-ADD") ? "supplementary" : "v2-core"
  };
});

const rubric = (cases as CaseData[]).map((item) => ({
  caseId: item.id,
  caseVersion: item.caseVersion || "unknown",
  medicalReviewStatus: item.medicalReview?.status || "needs_revision",
  dimensions: caseRubric(item),
  guideline: {
    guidelineTitle: "Hematuria clinical reasoning teaching rubric",
    year: 2026,
    section: "360-point structured event scoring",
    reviewer: "",
    reviewDate: "",
    status: "pending_clinical_review"
  }
}));

fs.writeFileSync(path.join(root, "cases_public.json"), `${JSON.stringify(publicCases, null, 2)}\n`);
fs.writeFileSync(path.join(root, "event_rubrics.json"), `${JSON.stringify(rubric, null, 2)}\n`);
fs.writeFileSync(path.join(root, "guideline_registry.json"), `${JSON.stringify({
  version: "guideline-registry-v1",
  formalUseAllowed: false,
  note: "All scoring rules, order indications and pathways require named specialist review before formal OSCE/RCT use.",
  fields: ["guidelineTitle", "year", "section", "reviewer", "reviewDate", "status"],
  defaultReview: { guidelineTitle: "", year: 0, section: "", reviewer: "", reviewDate: "", status: "pending_clinical_review" }
}, null, 2)}\n`);
console.log(`Generated ${publicCases.length} public case shells and ${rubric.length} server scoring rubrics.`);
