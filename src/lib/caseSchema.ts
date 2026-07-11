import type { CaseData } from "./types";

export const CASE_SCHEMA_VERSION = "2.2.0";

export type CaseValidationIssue = {
  caseId: string;
  path: string;
  severity: "error" | "warning";
  message: string;
};

const allowedDifficulties = new Set(["基础", "标准", "挑战"]);
const allowedMajorCategories = new Set([
  "泌尿系肿瘤",
  "感染",
  "结石",
  "前列腺疾病",
  "肾小球疾病",
  "外伤",
  "假性血尿",
  "药物/凝血相关",
  "功能性血尿",
  "肾实质/结构性疾病",
  "血管性疾病"
]);

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function requireText(issues: CaseValidationIssue[], caseId: string, path: string, value: unknown) {
  if (!text(value)) issues.push({ caseId, path, severity: "error", message: `${path}不能为空。` });
}

export function validateCase(caseData: CaseData): CaseValidationIssue[] {
  const issues: CaseValidationIssue[] = [];
  const id = text(caseData.id) || "<missing-id>";
  requireText(issues, id, "id", caseData.id);
  requireText(issues, id, "caseVersion", caseData.caseVersion);
  requireText(issues, id, "difficulty", caseData.difficulty);
  requireText(issues, id, "diseaseCategory", caseData.diseaseCategory);
  requireText(issues, id, "diseaseSubcategory", caseData.diseaseSubcategory);
  requireText(issues, id, "age", caseData.age);
  requireText(issues, id, "sex", caseData.sex);
  requireText(issues, id, "studentChiefComplaint", caseData.studentChiefComplaint);
  requireText(issues, id, "standardChiefComplaint", caseData.standardChiefComplaint);
  requireText(issues, id, "diagnosis", caseData.diagnosis);
  requireText(issues, id, "standardSummary", caseData.standardSummary);
  requireText(issues, id, "pastHistory", caseData.pastHistory);
  requireText(issues, id, "personalHistory", caseData.personalHistory);
  requireText(issues, id, "familyHistory", caseData.familyHistory);
  requireText(issues, id, "medication", caseData.medication);
  if (!caseData.structuredHistory) {
    issues.push({ caseId: id, path: "structuredHistory", severity: "error", message: "缺少标准化患者结构化生活史/既往史。" });
  } else {
    const requiredFacts = ["smokingHistory", "alcoholHistory", "occupation", "occupationalExposure", "hypertension", "diabetes", "stoneHistory", "urinaryInfectionHistory", "surgeryHistory", "transfusionHistory", "allergyHistory", "familyHistory"] as const;
    requiredFacts.forEach((key) => {
      const fact = caseData.structuredHistory?.[key];
      if (!fact?.patientAnswerZh || !fact?.patientAnswerEn) issues.push({ caseId: id, path: `structuredHistory.${key}`, severity: "error", message: "结构化事实必须包含中英文患者答案。" });
      if (/未诉|需追问|需主动询问|原表未记录|训练中若被问及/.test(`${fact?.patientAnswerZh || ""}${fact?.patientAnswerEn || ""}`)) issues.push({ caseId: id, path: `structuredHistory.${key}`, severity: "error", message: "患者答案不得包含作者端占位语。" });
    });
  }

  if (!allowedDifficulties.has(caseData.difficulty || "")) {
    issues.push({ caseId: id, path: "difficulty", severity: "error", message: `难度必须为基础、标准或挑战，当前为${caseData.difficulty || "空"}。` });
  }
  if (!allowedMajorCategories.has(caseData.diseaseCategory || "")) {
    issues.push({ caseId: id, path: "diseaseCategory", severity: "error", message: `疾病大类未标准化：${caseData.diseaseCategory || "空"}。` });
  }
  if (!Array.isArray(caseData.differentialDiagnosis) || caseData.differentialDiagnosis.filter(Boolean).length < 3) {
    issues.push({ caseId: id, path: "differentialDiagnosis", severity: "error", message: "至少需要3项合理鉴别诊断。" });
  }
  if (!Array.isArray(caseData.questionSlotIds) || caseData.questionSlotIds.length === 0) {
    issues.push({ caseId: id, path: "questionSlotIds", severity: "error", message: "缺少可追问信息槽位。" });
  }
  if (!Array.isArray(caseData.medicalReview?.references) || caseData.medicalReview.references.length === 0) {
    issues.push({ caseId: id, path: "medicalReview.references", severity: "warning", message: "尚未关联医学依据。" });
  }
  if (!new Set(["reviewed", "approved"]).has(caseData.medicalReview?.status || "")) {
    issues.push({ caseId: id, path: "medicalReview.status", severity: "warning", message: "病例仍需教师/临床专家终审。" });
  }
  (caseData.medicalReview?.references || []).forEach((reference, index) => {
    if (!reference.title) issues.push({ caseId: id, path: `medicalReview.references.${index}.title`, severity: "error", message: "医学依据缺少标题。" });
    if (reference.status && !["pending_clinical_review", "reviewed", "approved"].includes(reference.status)) {
      issues.push({ caseId: id, path: `medicalReview.references.${index}.status`, severity: "error", message: "医学依据审核状态无效。" });
    }
  });

  const collision = `${caseData.pastHistory}\n${caseData.personalHistory}`;
  if (/家族史[:：]/.test(caseData.personalHistory || "")) {
    issues.push({ caseId: id, path: "personalHistory", severity: "error", message: "个人史中混入家族史。" });
  }
  if ((caseData.pastHistory || "") === (caseData.personalHistory || "") || collision.includes("问诊重点：")) {
    issues.push({ caseId: id, path: "history", severity: "error", message: "病史字段重复或混入评分说明。" });
  }
  if (/IGA肾病/.test(JSON.stringify(caseData))) {
    issues.push({ caseId: id, path: "terminology", severity: "error", message: "应统一写作IgA肾病。" });
  }
  return issues;
}

export function validateCaseLibrary(cases: CaseData[]) {
  const issues = cases.flatMap(validateCase);
  const seen = new Set<string>();
  for (const item of cases) {
    if (seen.has(item.id)) issues.push({ caseId: item.id, path: "id", severity: "error", message: "病例ID重复。" });
    seen.add(item.id);
  }
  return {
    schemaVersion: CASE_SCHEMA_VERSION,
    caseCount: cases.length,
    errorCount: issues.filter((item) => item.severity === "error").length,
    warningCount: issues.filter((item) => item.severity === "warning").length,
    issues
  };
}

export function assertValidCaseLibrary(cases: CaseData[]) {
  const report = validateCaseLibrary(cases);
  if (report.errorCount > 0) {
    const summary = report.issues.filter((item) => item.severity === "error").slice(0, 12).map((item) => `${item.caseId}.${item.path}: ${item.message}`).join("\n");
    throw new Error(`病例库校验失败（${report.errorCount}项）：\n${summary}`);
  }
  return report;
}
