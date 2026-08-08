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
const handler = require("../api/training-action.js");
const { assessClinicalResult } = require("../shared/clinicalResultSemantics.js") as {
  assessClinicalResult(input: Record<string, unknown>): { compatible: boolean; reason: string; normalizedResult: string };
};
const {
  ENGLISH_METADATA_PLACEHOLDER,
  ENGLISH_ORDER_PLACEHOLDER,
  containsCjk,
  presentOrderCatalogItem,
  presentOrderResult,
  presentPhysicalExamItem,
  reportStatusPresentation
} = require("../shared/dataAgentPresentation.js") as {
  ENGLISH_METADATA_PLACEHOLDER: string;
  ENGLISH_ORDER_PLACEHOLDER: string;
  containsCjk(value: unknown): boolean;
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
assert.equal(pendingMetadataCount, 26, "all 26 genuinely numeric final lab results with missing metadata must fail closed; numbered narrative items are not measurements");
assert.equal(containsCjk(ENGLISH_METADATA_PLACEHOLDER), false);

const p001UrinalysisSource = results.find((item) => item.caseId === "P001" && item.orderId === "LAB-UR-001");
const p001UrinalysisOrder = catalogs.find((item) => item.orderId === "LAB-UR-001");
assert(p001UrinalysisSource && p001UrinalysisOrder);
const p001Urinalysis = presentOrderResult(p001UrinalysisOrder, p001UrinalysisSource, "zh");
assert.equal(p001Urinalysis.value, "红细胞 5562个/μl");
assert.equal(p001Urinalysis.impression, "");
assert.equal(p001Urinalysis.result, "红细胞 5562个/μl");
assert.equal((String(p001Urinalysis.result).match(/红细胞\s*5562个\/μl/gu) || []).length, 1);
assert.doesNotMatch(String(p001Urinalysis.result), /尿检\s*[:：]/u);

const semanticallyUnsafeConfiguredResults = [
  ["P001", "LAB-BL-001"],
  ["P002", "LAB-BL-001"],
  ["P006", "LAB-BL-001"],
  ["P006", "LAB-UR-008"],
  ["P009", "LAB-BL-001"],
  ["P011", "LAB-UR-001"],
  ["P011", "LAB-UR-003"],
  ["P011", "LAB-BL-003"],
  ["P011", "IMG-US-001"]
] as const;
for (const [caseId, orderId] of semanticallyUnsafeConfiguredResults) {
  const result = results.find((item) => item.caseId === caseId && item.orderId === orderId);
  const order = catalogs.find((item) => item.orderId === orderId);
  assert(result && order, `${caseId}/${orderId}:missing_fixture_binding`);
  const assessment = assessClinicalResult({
    domain: order.primaryCategory === "检验" ? "laboratory" : "",
    itemId: orderId,
    displayName: order.displayName,
    result: [result.value, result.impression].filter(Boolean).join("\n")
  });
  assert.equal(assessment.compatible, false, `${caseId}/${orderId}:unsafe_result_not_isolated`);
}

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
  assert.deepEqual(reportStatusPresentation({ status: "not_available" }, language), { state: "unavailable", label: language === "en" ? "No result available" : "暂无可显示结果" });
  assert.equal(reportStatusPresentation({ status: "not_performed" }, language).label, language === "en" ? "Not performed" : "未实施");
}

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
  assert.equal((response.payload.results as unknown[]).length, 0, "P008 unavailable CBC placeholder must not be presented as a report");
  assert.deepEqual((response.payload.orderOutcomes as Array<{ status: string }>).map((item) => item.status), ["unavailable"]);
  assert.doesNotMatch(JSON.stringify(response.payload), /provenance|reviewStatus|medical_review_pending|scoringEligible|diagnosticEligible|awaiting review/i);
  assert.equal(containsCjk(JSON.stringify(response.payload)), false, "English API payload must not expose CJK");

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
