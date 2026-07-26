import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.TRAINING_STATE_SECRET = "unit-test-training-state-secret-with-adequate-length";

const require = createRequire(import.meta.url);
const catalogs = [
  ...require("../data/order_catalog_labs.json"),
  ...require("../data/order_catalog_imaging.json"),
  ...require("../data/order_catalog_procedures.json"),
  ...require("../data/order_catalog_perioperative.json")
] as Array<{
  orderId: string;
  primaryCategory: string;
  secondaryCategory: string;
  displayName: string;
  synonyms: string[];
  priority: string;
  studentDisplayHint: string;
}>;
const results = require("../data/order_results_structured.json") as Array<{
  caseId: string;
  orderId: string;
  resultId: string;
  status: "final" | "not_available" | "not_performed";
  value: string;
  unit: string;
  referenceRange: string;
  impression: string;
  abnormalFlags: string[];
}>;
const physicalExamItems = require("../data/physical_exam_items.json") as Array<{
  examId: string;
  category: string;
  displayName: string;
  synonyms: string[];
  studentHint?: string;
}>;
const physicalExamResults = require("../data/physical_exam_results.json") as Array<{
  caseId: string;
  examId: string;
  result: string;
  provenance?: string;
  sourceRef?: string;
}>;
const handler = require("../api/training-action.js");
const {
  ENGLISH_METADATA_PLACEHOLDER,
  ENGLISH_ORDER_PLACEHOLDER,
  MEDICAL_DATA_POLICY,
  clinicalResultAvailability,
  containsCjk,
  presentPhysicalExamResult,
  presentOrderCatalogItem,
  presentOrderResult,
  presentPhysicalExamItem,
  reportStatusPresentation
} = require("../shared/dataAgentPresentation.js") as {
  ENGLISH_METADATA_PLACEHOLDER: string;
  ENGLISH_ORDER_PLACEHOLDER: string;
  MEDICAL_DATA_POLICY: { simulatedNormalExamIds: readonly string[] };
  clinicalResultAvailability(result: Record<string, unknown>): { release: boolean; status: string; reason: string };
  containsCjk(value: unknown): boolean;
  presentPhysicalExamResult(result: Record<string, unknown>, language: "zh" | "en"): {
    text: string;
    authorityStatus: string;
    provenanceStatus: string;
  };
  presentOrderCatalogItem(order: Record<string, unknown>, language: "zh" | "en"): Record<string, unknown>;
  presentOrderResult(order: Record<string, unknown>, result: Record<string, unknown>, language: "zh" | "en"): Record<string, unknown>;
  presentPhysicalExamItem(item: Record<string, unknown>, language: "zh" | "en"): Record<string, unknown>;
  reportStatusPresentation(item: Record<string, unknown>, language: "zh" | "en"): { state: string; label: string };
};

assert.equal(catalogs.length, 60, "data-agent presentation gate must cover all 60 configured orders");
assert.equal(results.length, 257, "data-agent presentation gate must cover all 257 configured results");

const presentedCatalog = catalogs.map((item) => presentOrderCatalogItem(item, "en"));
const orderIdsBefore = catalogs.map((item) => item.orderId).sort();
const orderIdsAfter = presentedCatalog.map((item) => String(item.orderId)).sort();
assert.deepEqual(orderIdsAfter, orderIdsBefore, "presentation must preserve every order ID");
for (const item of presentedCatalog) {
  for (const field of ["displayName", "primaryCategoryLabel", "secondaryCategoryLabel", "priorityLabel", "studentDisplayHintLabel"]) {
    assert.equal(containsCjk(item[field]), false, `${item.orderId}/${field} must not expose CJK in an English attempt`);
  }
}
const unavailableEnglishNames = presentedCatalog.filter((item) => item.translationAvailable === false);
assert.equal(unavailableEnglishNames.length, 23, "orders without a source English alias must stay explicitly unavailable");
assert(unavailableEnglishNames.every((item) => item.displayName === ENGLISH_ORDER_PLACEHOLDER));

let pendingMetadataCount = 0;
for (const result of results) {
  const order = catalogs.find((item) => item.orderId === result.orderId);
  assert(order, `${result.resultId} must retain its configured order`);
  const presented = presentOrderResult(order!, result, "en");
  assert.equal(presented.caseId, result.caseId, `${result.resultId} case binding changed`);
  assert.equal(presented.orderId, result.orderId, `${result.resultId} order binding changed`);
  assert.equal(presented.resultId, result.resultId, `${result.resultId} result identity changed`);
  assert.equal(presented.status, result.status, `${result.resultId} status changed`);
  for (const field of ["orderCategory", "result", "value", "impression", "abnormalLevel"]) {
    assert.equal(containsCjk(presented[field]), false, `${result.resultId}/${field} must not expose CJK in English`);
  }
  assert.equal(containsCjk((presented.abnormalFlags as string[] || []).join(" ")), false, `${result.resultId}/abnormalFlags must not expose CJK`);
  if (presented.metadataStatus === "awaiting_reviewed_metadata") pendingMetadataCount += 1;
}
assert.equal(pendingMetadataCount, 28, "all 28 numeric final lab results with missing metadata must fail closed");
assert.equal(containsCjk(ENGLISH_METADATA_PLACEHOLDER), false);

const presentedExams = physicalExamItems.map((item) => presentPhysicalExamItem(item, "en"));
assert.equal(presentedExams.length, physicalExamItems.length, "physical examination item count must remain stable");
for (const item of presentedExams) {
  assert.equal(containsCjk(item.displayName), false, `${item.examId}/displayName must not expose CJK in English`);
  assert.equal(containsCjk(item.category), false, `${item.examId}/category must not expose CJK in English`);
  assert.equal(containsCjk(item.studentHint), false, `${item.examId}/studentHint must not expose CJK in English`);
}

for (const language of ["zh", "en"] as const) {
  assert.deepEqual(reportStatusPresentation({ status: "final", abnormalFlags: ["positive"], abnormalLevel: "positive" }, language), {
    state: "abnormal",
    label: language === "en" ? "Abnormal" : "异常"
  });
  const final = reportStatusPresentation({ status: "final", abnormalFlags: [], abnormalLevel: "final" }, language);
  assert.equal(final.state, "reported");
  assert.equal(final.label, language === "en" ? "Reported" : "已出报告");
  assert.equal(reportStatusPresentation({ status: "not_available" }, language).label, language === "en" ? "Not available in this case" : "当前病例未提供");
  assert.equal(reportStatusPresentation({ status: "not_performed" }, language).label, language === "en" ? "Not performed" : "未实施");
  assert.equal(
    reportStatusPresentation({ status: "not_available", abnormalFlags: ["normal"], abnormalLevel: "normal" }, language).state,
    "not-available",
    "missing data must never be presented as normal"
  );
  assert.equal(
    reportStatusPresentation({ status: "not_performed", abnormalFlags: ["normal"], abnormalLevel: "normal" }, language).state,
    "not-performed",
    "an unperformed test must never be presented as normal"
  );
}

const delayed = results.find((item) => (item as Record<string, unknown>).availableAt === "delayed" && item.status === "final");
assert(delayed, "a delayed final result fixture is required");
assert.deepEqual(clinicalResultAvailability(delayed), {
  release: false,
  status: "pending",
  reason: "result_not_available_at_current_timepoint"
});

const unboundBloodPressure = physicalExamResults.find((item) => item.examId === "PE002" && !item.provenance && !item.sourceRef);
assert(unboundBloodPressure, "an unbound blood-pressure fixture is required");
for (const language of ["zh", "en"] as const) {
  const presented = presentPhysicalExamResult(unboundBloodPressure, language);
  assert.equal(presented.authorityStatus, "needs_review");
  assert.equal(presented.provenanceStatus, "missing");
  assert.doesNotMatch(presented.text, /\d+\s*\/\s*\d+/, "unbound blood pressure must not be exposed as a current measurement");
  const inferredFromHistory = presentPhysicalExamResult({
    ...unboundBloodPressure,
    hypertensionHistory: "absent",
    medicationList: ["antihypertensive"]
  }, language);
  assert.equal(inferredFromHistory.authorityStatus, "needs_review", "history or medication must not infer a current normal blood pressure");
}
assert.deepEqual(MEDICAL_DATA_POLICY.simulatedNormalExamIds, [], "simulated normal examination values require an explicit policy allow-list");
const simulatedNormal = presentPhysicalExamResult({
  caseId: "P008",
  examId: "PE002",
  result: "血压120/80 mmHg。",
  provenance: "simulated_normal",
  sourceRef: "test-policy-probe"
}, "zh");
assert.equal(simulatedNormal.authorityStatus, "needs_review");
assert.doesNotMatch(simulatedNormal.text, /120\s*\/\s*80/);
const sourceBoundExam = presentPhysicalExamResult({
  caseId: "TEST",
  examId: "PE002",
  result: "血压148/86 mmHg。",
  provenance: "source",
  sourceRef: "synthetic-source-binding"
}, "zh");
assert.equal(sourceBoundExam.authorityStatus, "source_bound");
assert.match(sourceBoundExam.text, /148\s*\/\s*86/);

let requestCounter = 0;
async function call(body: Record<string, unknown>, token = "") {
  let statusCode = 200;
  let payload: unknown;
  const headers: Record<string, string> = {};
  const requestBody = body.action && !body.requestId ? { ...body, requestId: `data-agent-presentation-${++requestCounter}` } : body;
  const req = {
    method: "POST",
    body: requestBody,
    headers: token ? { "x-training-state": token } : {},
    socket: { remoteAddress: `data-agent-presentation-${requestCounter}` }
  };
  const res = {
    setHeader(name: string, value: string) { headers[name.toLowerCase()] = value; },
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { payload = value; return this; },
    end() { return this; }
  };
  await handler(req, res);
  return { statusCode, payload: payload as Record<string, unknown>, token: headers["x-training-state"] || token };
}

async function main() {
  const attemptId = `data-agent-presentation-${Date.now()}`;
  let response = await call({ action: "init-attempt", caseId: "P008", attemptId, mode: "free", language: "en" });
  assert.equal(response.statusCode, 200);
  response = await call({ action: "stage-feedback", caseId: "P008", attemptId, mode: "free", language: "en", stageKey: "history", submission: {} }, response.token);
  assert.equal(response.statusCode, 200);
  response = await call({ action: "order", caseId: "P008", attemptId, mode: "free", language: "en", input: "CBC" }, response.token);
  assert.equal(response.statusCode, 200);
  assert.equal((response.payload.results as unknown[]).length, 1, "P008 CBC must retain one exact configured report");
  assert.equal(containsCjk(JSON.stringify(response.payload)), false, "English API payload must not expose CJK");

  const examAttemptId = `data-agent-exam-${Date.now()}`;
  let examResponse = await call({ action: "init-attempt", caseId: "P008", attemptId: examAttemptId, mode: "free", language: "zh" });
  examResponse = await call({ action: "stage-feedback", caseId: "P008", attemptId: examAttemptId, mode: "free", language: "zh", stageKey: "history", submission: {} }, examResponse.token);
  examResponse = await call({ action: "exam", caseId: "P008", attemptId: examAttemptId, mode: "free", language: "zh", input: "血压" }, examResponse.token);
  assert.equal(examResponse.statusCode, 200);
  assert.equal(examResponse.payload.authorityStatus, "needs_review");
  assert.doesNotMatch(String(examResponse.payload.result || ""), /\d+\s*\/\s*\d+/, "API must not expose an unbound blood pressure value");

  const delayedAttemptId = `data-agent-delayed-${Date.now()}`;
  let delayedResponse = await call({ action: "init-attempt", caseId: "HX-ADD-006", attemptId: delayedAttemptId, mode: "free", language: "zh" });
  delayedResponse = await call({ action: "stage-feedback", caseId: "HX-ADD-006", attemptId: delayedAttemptId, mode: "free", language: "zh", stageKey: "history", submission: {} }, delayedResponse.token);
  delayedResponse = await call({ action: "order", caseId: "HX-ADD-006", attemptId: delayedAttemptId, mode: "free", language: "zh", input: "尿培养" }, delayedResponse.token);
  assert.equal(delayedResponse.statusCode, 200);
  assert.equal((delayedResponse.payload.results as unknown[]).length, 0, "delayed result must not be released at the order timepoint");
  assert.equal((delayedResponse.payload.pendingResults as unknown[]).length, 1, "delayed result must remain visibly pending");
  assert.doesNotMatch(JSON.stringify(delayedResponse.payload.pendingResults), /支持感染|培养阳性/, "pending payload must not leak the future result");

  console.log(JSON.stringify({
    orders: catalogs.length,
    results: results.length,
    unavailableEnglishOrderNames: unavailableEnglishNames.length,
    pendingReviewedMetadata: pendingMetadataCount,
    physicalExamItems: physicalExamItems.length,
    englishApiCjkSignals: 0,
    dataChanged: false
  }));
}

void main();
