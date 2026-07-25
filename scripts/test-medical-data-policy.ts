import assert from "node:assert/strict";
import casesJson from "../data/cases.json";
import historyMedicalPolicyJson from "../data/history_medical_reconciliation.json";
import orderCatalogImagingJson from "../data/order_catalog_imaging.json";
import orderCatalogLabsJson from "../data/order_catalog_labs.json";
import orderCatalogPerioperativeJson from "../data/order_catalog_perioperative.json";
import orderCatalogProceduresJson from "../data/order_catalog_procedures.json";
import orderResultsJson from "../data/order_results_structured.json";
import physicalExamItemsJson from "../data/physical_exam_items.json";
import physicalExamResultsJson from "../data/physical_exam_results.json";
import {
  MEDICAL_DATA_POLICY,
  detectCaseMedicalDataConflicts,
  governPhysicalExamResult,
  presentOrderResult
} from "../shared/dataAgentPresentation.js";
import type { CaseData, OrderCatalogItem, PhysicalExamItem, PhysicalExamResult } from "../src/lib/types";

type StructuredResult = {
  resultId: string;
  caseId: string;
  orderId: string;
  status: "final" | "not_available" | "not_performed";
  value: string;
  unit: string;
  referenceRange: string;
  impression: string;
  abnormalFlags: string[];
  availableAt: "immediate" | "delayed";
  prerequisites: string[];
  sourceVersion: string;
};

const cases = casesJson as CaseData[];
const examItems = physicalExamItemsJson as PhysicalExamItem[];
const examResults = physicalExamResultsJson as PhysicalExamResult[];
const orderResults = orderResultsJson as StructuredResult[];
const orderCatalog = [
  ...orderCatalogLabsJson,
  ...orderCatalogImagingJson,
  ...orderCatalogProceduresJson,
  ...orderCatalogPerioperativeJson
] as OrderCatalogItem[];

const requiredFields = [
  "value",
  "status",
  "unit",
  "referenceRange",
  "timepoint",
  "provenance",
  "reviewerStatus",
  "affectsDiagnosis",
  "affectsScore",
  "teacherReviewRequired",
  "expressionZh",
  "expressionEn"
] as const;

function assertEnvelope(item: Record<string, unknown>, label: string) {
  for (const field of requiredFields) assert.ok(Object.hasOwn(item, field), `${label} missing ${field}`);
  assert.equal(typeof item.expressionZh, "string", `${label} expressionZh`);
  assert.equal(typeof item.expressionEn, "string", `${label} expressionEn`);
  assert.equal(typeof item.affectsDiagnosis, "boolean", `${label} affectsDiagnosis`);
  assert.equal(typeof item.affectsScore, "boolean", `${label} affectsScore`);
}

function caseById(id: string) {
  const found = cases.find((item) => item.id === id);
  assert.ok(found, `missing case ${id}`);
  return found;
}

function itemById(id: string) {
  const found = examItems.find((item) => item.examId === id);
  assert.ok(found, `missing exam item ${id}`);
  return found;
}

function configured(caseId: string, examId: string) {
  const found = examResults.find((item) => item.caseId === caseId && item.examId === examId);
  assert.ok(found, `missing configured exam ${caseId}/${examId}`);
  return found;
}

function sourceExam(
  examId: string,
  value: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    examId,
    result: value,
    value,
    unit: "",
    referenceRange: "",
    timepoint: "current_encounter",
    provenance: "source",
    reviewerStatus: "not_required",
    teacherReviewRequired: false,
    affectsDiagnosis: true,
    affectsScore: false,
    abnormal: false,
    expressionZh: value,
    expressionEn: value,
    ...overrides
  };
}

assert.equal(MEDICAL_DATA_POLICY.version, "medical-data-policy-v1");
assert.deepEqual(MEDICAL_DATA_POLICY.simulatedNormal.allowedExamIds, []);
assert.deepEqual(MEDICAL_DATA_POLICY.simulatedNormal.approvedTemplates, {});
assert.equal(MEDICAL_DATA_POLICY.simulatedNormal.deterministicOnly, true);
assert.equal(MEDICAL_DATA_POLICY.simulatedNormal.mayExcludeEmergency, false);
assert.equal(MEDICAL_DATA_POLICY.simulatedNormal.mayAffectDiagnosis, false);
assert.equal(MEDICAL_DATA_POLICY.simulatedNormal.mayAffectScore, false);

const explicitBloodPressure = governPhysicalExamResult(
  caseById("P001"),
  itemById("PE002"),
  sourceExam("PE002", "132/78", {
    unit: "mmHg",
    expressionZh: "血压132/78 mmHg。",
    expressionEn: "Blood pressure is 132/78 mmHg."
  })
);
assert.equal(explicitBloodPressure.status, "measured", "explicit current measurement must win");
assert.equal(explicitBloodPressure.value, "132/78");
assert.equal(explicitBloodPressure.provenance, "source");

const controlledBloodPressure = governPhysicalExamResult(
  caseById("P001"),
  itemById("PE002"),
  configured("P001", "PE002")
);
assert.equal(controlledBloodPressure.status, "controlled");
assert.equal(controlledBloodPressure.value, "controlled");
assert.match(controlledBloodPressure.expressionZh, /控制平稳/);
assert.doesNotMatch(controlledBloodPressure.expressionZh, /\d{2,3}\s*\/\s*\d{2,3}/);

for (const caseId of ["P003", "HX-ADD-003"]) {
  const governed = governPhysicalExamResult(caseById(caseId), itemById("PE002"), configured(caseId, "PE002"));
  assert.equal(governed.status, "not_measured", `${caseId} treated hypertension with unknown control must not produce a number`);
  assert.doesNotMatch(governed.expressionZh, /\d{2,3}\s*\/\s*\d{2,3}/);
}

const untreatedHypertension = {
  ...caseById("P001"),
  sourceFacts: { pastHistory: "有高血压，尚未治疗，控制情况未知。" },
  structuredHistory: {
    ...caseById("P001").structuredHistory,
    hypertension: {
      status: "present",
      patientAnswerZh: "有高血压。",
      patientAnswerEn: "I have hypertension.",
      provenance: "source",
      teacherReviewRequired: false
    }
  }
};
const untreatedResult = governPhysicalExamResult(untreatedHypertension, itemById("PE002"), configured("P001", "PE002"));
assert.equal(untreatedResult.status, "not_measured");
assert.doesNotMatch(untreatedResult.expressionZh, /\d{2,3}\s*\/\s*\d{2,3}/);

const absentHypertension = governPhysicalExamResult(
  caseById("HX-ADD-006"),
  itemById("PE002"),
  configured("HX-ADD-006", "PE002")
);
assert.equal(absentHypertension.status, "not_measured");
assert.doesNotMatch(absentHypertension.expressionZh, /正常|128\/76/);

const needsReviewHypertension = {
  ...caseById("P001"),
  sourceFacts: { pastHistory: "高血压情况需核实。" },
  structuredHistory: {
    ...caseById("P001").structuredHistory,
    hypertension: {
      status: "present",
      patientAnswerZh: "记不清。",
      patientAnswerEn: "I cannot recall.",
      provenance: "author_added_for_simulation",
      teacherReviewRequired: true
    }
  }
};
const needsReviewResult = governPhysicalExamResult(needsReviewHypertension, itemById("PE002"), configured("P001", "PE002"));
assert.equal(needsReviewResult.reviewerStatus, "needs_review");
assert.equal(needsReviewResult.teacherReviewRequired, true);
assert.equal(needsReviewResult.affectsScore, false);

const febrileCase = {
  ...caseById("HX-ADD-008"),
  presentIllness: { ...caseById("HX-ADD-008").presentIllness, fever: "发热寒战" }
};
const feverConflict = governPhysicalExamResult(
  febrileCase,
  itemById("PE001"),
  sourceExam("PE001", "36.8", {
    unit: "℃",
    expressionZh: "体温36.8℃。",
    expressionEn: "Temperature is 36.8°C."
  })
);
assert.equal(feverConflict.status, "BLOCKED_MEDICAL");
assert.equal(feverConflict.blockedReason, "fever_current_temperature_conflict");
assert.equal(feverConflict.affectsDiagnosis, false);
assert.equal(feverConflict.affectsScore, false);

const afterAntipyretic = governPhysicalExamResult(
  febrileCase,
  itemById("PE001"),
  sourceExam("PE001", "36.8", {
    unit: "℃",
    timepoint: "current_after_antipyretic",
    postAntipyretic: true,
    expressionZh: "退热后体温36.8℃。",
    expressionEn: "Temperature after antipyretic treatment is 36.8°C."
  })
);
assert.equal(afterAntipyretic.status, "measured");

const uncontrolledCase = {
  ...caseById("P001"),
  sourceFacts: { pastHistory: "高血压未控制，近期控制不佳。" }
};
const pressureConflict = governPhysicalExamResult(
  uncontrolledCase,
  itemById("PE002"),
  sourceExam("PE002", "128/76", {
    unit: "mmHg",
    expressionZh: "血压128/76 mmHg。",
    expressionEn: "Blood pressure is 128/76 mmHg."
  })
);
assert.equal(pressureConflict.status, "BLOCKED_MEDICAL");
assert.equal(pressureConflict.blockedReason, "uncontrolled_hypertension_normal_pressure_conflict");

const retentionConflict = governPhysicalExamResult(
  {
    ...caseById("P007"),
    presentIllness: { ...caseById("P007").presentIllness, voidingDifficulty: "完全尿不出来，尿潴留。" }
  },
  itemById("PE104"),
  sourceExam("PE104", "耻骨上区无明显膀胱充盈。", {
    expressionEn: "No suprapubic bladder distension."
  })
);
assert.equal(retentionConflict.status, "BLOCKED_MEDICAL");
assert.equal(retentionConflict.blockedReason, "urinary_retention_bladder_exam_conflict");

const colicConflict = governPhysicalExamResult(
  {
    ...caseById("P009"),
    presentIllness: { ...caseById("P009").presentIllness, pain: "肾绞痛。" }
  },
  itemById("PE102"),
  sourceExam("PE102", "双肾区无叩击痛。", {
    expressionEn: "No costovertebral-angle tenderness."
  })
);
assert.equal(colicConflict.status, "BLOCKED_MEDICAL");
assert.equal(colicConflict.blockedReason, "renal_colic_renal_exam_conflict");

const rejectedSimulation = governPhysicalExamResult(
  caseById("P001"),
  itemById("PE403"),
  {
    ...configured("P001", "PE403"),
    provenance: "simulated_normal",
    reviewerStatus: "not_required",
    affectsDiagnosis: false,
    affectsScore: false,
    teacherReviewRequired: false
  }
);
assert.notEqual(rejectedSimulation.provenance, "simulated_normal");
assert.equal(rejectedSimulation.reviewerStatus, "needs_review");
assert.equal(rejectedSimulation.blockedReason, "simulated_normal_not_allowed");

let simulatedNormalCount = 0;
let blockedIncorrectNormalCount = 0;
let blockedUnsafeValueCount = 0;
let clinicalBlockedMedicalCount = 0;
for (const configuredExam of examResults) {
  const caseData = caseById(configuredExam.caseId);
  const examItem = itemById(configuredExam.examId);
  const governed = governPhysicalExamResult(caseData, examItem, configuredExam);
  assertEnvelope(governed as unknown as Record<string, unknown>, `${configuredExam.caseId}/${configuredExam.examId}`);
  for (const component of governed.components || []) {
    assertEnvelope(component as unknown as Record<string, unknown>, `${configuredExam.caseId}/${configuredExam.examId}/component`);
  }
  if (governed.provenance === "simulated_normal") simulatedNormalCount += 1;
  blockedIncorrectNormalCount += governed.blockedIncorrectNormalCount || 0;
  blockedUnsafeValueCount += governed.blockedUnsafeValueCount || 0;
  if (governed.status === "BLOCKED_MEDICAL") clinicalBlockedMedicalCount += 1;
  if (configuredExam.provenance !== "source") {
    assert.notEqual(governed.value, configuredExam.result, `${configuredExam.caseId}/${configuredExam.examId} leaked an unsupported generated value`);
  }
}
assert.equal(simulatedNormalCount, 0);
assert.ok(blockedIncorrectNormalCount > 0);
assert.ok(blockedUnsafeValueCount >= examResults.length);

let pendingMetadata = 0;
let bilingualStatusMismatches = 0;
for (const result of orderResults) {
  const order = orderCatalog.find((candidate) => candidate.orderId === result.orderId);
  assert.ok(order, `${result.resultId} missing catalog`);
  const zh = presentOrderResult(order, result, "zh");
  const en = presentOrderResult(order, result, "en");
  assertEnvelope(zh as unknown as Record<string, unknown>, `${result.resultId}/zh`);
  assertEnvelope(en as unknown as Record<string, unknown>, `${result.resultId}/en`);
  if (zh.status !== en.status || zh.provenance !== en.provenance || zh.affectsDiagnosis !== en.affectsDiagnosis) {
    bilingualStatusMismatches += 1;
  }
  if (zh.metadataStatus === "awaiting_reviewed_metadata") {
    pendingMetadata += 1;
    assert.equal(zh.reviewerStatus, "needs_review");
    assert.notEqual(zh.abnormalLevel, "normal");
  }
}
assert.equal(pendingMetadata, 28);
assert.equal(bilingualStatusMismatches, 0);

const realOrderConflicts = cases.flatMap((caseData) =>
  detectCaseMedicalDataConflicts(caseData, orderResults.filter((result) => result.caseId === caseData.id))
    .map((conflict) => ({ caseId: caseData.id, ...conflict }))
);
const syntheticUtiConflict = detectCaseMedicalDataConflicts(
  { diagnosis: "急性膀胱炎" },
  [
    { resultId: "urine", status: "final", provenance: "source", value: "尿白细胞阴性", impression: "" },
    { resultId: "culture", status: "final", provenance: "source", value: "尿培养阳性，E. coli生长", impression: "" }
  ]
);
assert.equal(syntheticUtiConflict.length, 1);
assert.equal(syntheticUtiConflict[0]?.code, "uti_urinalysis_culture_conflict");

const existingHistoryBlockedMedical = (historyMedicalPolicyJson as {
  blockedMedicalHistory: unknown[];
}).blockedMedicalHistory.length;

const evidence = {
  cases: cases.length,
  configuredPhysicalExamResults: examResults.length,
  governedPhysicalExamResults: examResults.length,
  simulatedNormalCount,
  blockedIncorrectNormalCount,
  blockedUnsafeValueCount,
  clinicalBlockedMedicalCount,
  orderSourceConflictCount: realOrderConflicts.length,
  existingHistoryBlockedMedical,
  pendingReviewedMetadata: pendingMetadata,
  bilingualStatusMismatches,
  syntheticConstraintChecks: 10
};
console.log(`MEDICAL_DATA_POLICY_EVIDENCE ${JSON.stringify(evidence)}`);
