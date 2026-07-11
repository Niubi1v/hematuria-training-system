import fs from "node:fs";

type RuntimeCase = {
  id: string;
  displayCaseId?: string;
  diseaseCategory?: string;
  diagnosis?: string;
  sourceFacts?: Record<string, unknown>;
};

type AuditFact = Record<string, unknown> & {
  caseId: string;
  原字段: string;
  当前内容: string;
  来源: string;
};

type ReviewIssue = { caseId: string; severity: string; field: string };

const cases = JSON.parse(fs.readFileSync("data/cases.json", "utf8")) as RuntimeCase[];
const normalized = JSON.parse(fs.readFileSync("data/hematuria_release_v14_normalized.json", "utf8")) as { facts: AuditFact[] };
const contradictions = JSON.parse(fs.readFileSync("data/clinical_contradiction_report.json", "utf8")) as { issues: ReviewIssue[] };
const byRuntimeId = new Map(cases.map((item) => [item.id, item]));
const displayId = (runtimeId: string) => byRuntimeId.get(runtimeId)?.displayCaseId || runtimeId;
const auditByKey = new Map(normalized.facts.map((item) => [`${item.caseId}|${item.原字段}`, item]));

const highPriority = new Set(["anticoagulantUse", "antiplateletUse", "allergyHistory", "pregnancyHistory", "coronaryDisease", "stroke", "surgeryHistory"]);
const diagnosticPriority = new Set(["smokingHistory", "occupation", "occupationalExposure", "stoneHistory", "urinaryInfectionHistory", "traumaHistory", "urinaryProcedureHistory", "malignancyHistory", "familyHistory", "menstrualHistory"]);

function reviewers(caseData: RuntimeCase, field: string) {
  const category = String(caseData.diseaseCategory || "");
  if (field === "menstrualHistory" || field === "pregnancyHistory") return ["妇产科", "医学教育"];
  if (["anticoagulantUse", "antiplateletUse", "coronaryDisease"].includes(field)) return ["心内科/血液科", "泌尿外科"];
  if (field === "stroke") return ["神经内科", "泌尿外科"];
  if (/肾小球|肾病/.test(category)) return [caseData.displayCaseId === "P011" ? "儿童肾内科" : "肾内科", "医学教育"];
  if (/感染/.test(category)) return ["泌尿外科/感染科", "医学教育"];
  return ["泌尿外科", "医学教育"];
}

function sourceExcerpt(caseData: RuntimeCase) {
  const source = caseData.sourceFacts || {};
  return [source.pastHistory, source.personalHistory, source.familyHistory, source.medication]
    .filter((value) => typeof value === "string" && value.trim())
    .join("；");
}

const activeIssues = contradictions.issues.filter((item) => item.severity === "review");
const queue = activeIssues.map((issue, index) => {
  const caseData = byRuntimeId.get(issue.caseId);
  if (!caseData) throw new Error(`Missing runtime case ${issue.caseId}`);
  const caseId = displayId(issue.caseId);
  const audit = auditByKey.get(`${caseId}|${issue.field}`);
  if (!audit) throw new Error(`Missing audit fact ${caseId}.${issue.field}`);
  const parsed = JSON.parse(String(audit.当前内容 || "{}")) as Record<string, unknown>;
  const [primaryReviewer, secondaryReviewer] = reviewers(caseData, issue.field);
  return {
    reviewItemId: `MR-${String(index + 1).padStart(4, "0")}`,
    caseId,
    runtimeCaseId: issue.caseId,
    diseaseCategory: caseData.diseaseCategory || "",
    diagnosisForReviewer: caseData.diagnosis || "",
    field: issue.field,
    priority: highPriority.has(issue.field) ? "P0-安全相关" : diagnosticPriority.has(issue.field) ? "P1-诊断评分相关" : "P2-背景完整性",
    primaryReviewer,
    secondaryReviewer,
    patientAnswerZh: String(parsed.patientAnswerZh || ""),
    patientAnswerEn: String(parsed.patientAnswerEn || ""),
    sourceExcerpt: sourceExcerpt(caseData),
    affectsDiagnosis: String(audit["是否影响诊断"] || "待确认"),
    affectsScoring: String(audit["是否影响评分"] || "待确认"),
    conflictCheck: String(audit["是否与其他字段矛盾"] || ""),
    provenance: "author_added_for_simulation",
    decision: "待确认",
    correctedAnswerZh: "",
    correctedAnswerEn: "",
    evidenceOrGuideline: "",
    reviewerName: "",
    reviewerSpecialty: "",
    reviewDate: "",
    reviewNotes: ""
  };
});

const reconciled = [
  { caseId: "P003", field: "transfusionHistory", reason: "原始资料明确记录输血史，运行时已按 source 处理" },
  { caseId: "P005", field: "coronaryDisease", reason: "原始资料明确记录冠脉支架史，运行时已按 source 处理" }
];

const sourceTrace = normalized.facts
  .filter((item) => item.来源 === "source" || reconciled.some((entry) => entry.caseId === item.caseId && entry.field === item.原字段))
  .map((item) => ({ caseId: item.caseId, field: item.原字段, source: "source", currentContent: item.当前内容 }));

const output = {
  schemaVersion: "medical-review-queue-v1",
  generatedFrom: "hematuria_release_v14_normalized + runtime structuredHistory",
  caseCount: cases.length,
  trackedFactCount: normalized.facts.length,
  sourceTraceCount: sourceTrace.length,
  activeExpertReviewCount: queue.length,
  reconciledCount: reconciled.length,
  approvalPolicy: "No fact is approved until decision, evidence, reviewerName, reviewerSpecialty and reviewDate are completed.",
  formalUseAllowed: false,
  reconciled,
  sourceTrace,
  queue
};

if (output.trackedFactCount !== 572 || output.sourceTraceCount !== 153 || output.activeExpertReviewCount !== 419 || output.reconciledCount !== 2) {
  throw new Error(`Unexpected review totals: ${JSON.stringify({ tracked: output.trackedFactCount, source: output.sourceTraceCount, active: output.activeExpertReviewCount, reconciled: output.reconciledCount })}`);
}

fs.writeFileSync("data/medical_review_queue.json", `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log("Medical review queue built: 572 tracked = 153 source-trace + 419 expert-review; 2 stale provenance records reconciled.");
