import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.TRAINING_STATE_SECRET = "stage2-all-orders-deterministic-audit-secret";
process.env.TRAINING_ATTEMPT_STORE_MODE = "memory";
process.env.TRAINING_DEPLOYMENT_TIER = "practice";
process.env.TRAINING_API_RATE_LIMIT_PER_MINUTE = "100000";
process.env.HEMATURIA_RUNTIME_TARGET = "desktop";

const handler = require("../api/training-action.js");
const cases = require("../data/cases.json");
const labs = require("../data/order_catalog_labs.json");
const imaging = require("../data/order_catalog_imaging.json");
const procedures = require("../data/order_catalog_procedures.json");
const perioperative = require("../data/order_catalog_perioperative.json");
const { buildStudentOrderCatalog, orderApplicableForSex, sourceOrderId } = require("../shared/dataAgentPresentation.js");
const { resetMemoryAttemptStore } = require("../server/trainingAttemptStore.js");

const catalog = buildStudentOrderCatalog([...labs, ...imaging, ...procedures, ...perioperative]);
const forbidden = /等待医学审核|等待审核元数据|awaiting medical review|simulated|provenance|medical_review_pending|diagnosticEligible|scoringEligible|affectsDiagnosis|affectsScore/iu;
let requestCounter = 0;

async function call(body, token = "") {
  let statusCode = 200;
  let payload = {};
  const headers = {};
  const req = { method: "POST", body: { ...body, requestId: `all-orders-${++requestCounter}` }, headers: token ? { "x-training-state": token } : {}, socket: { remoteAddress: `all-orders-${requestCounter}` } };
  const res = { setHeader(name, value) { headers[name.toLowerCase()] = value; }, status(code) { statusCode = code; return this; }, json(value) { payload = value; return this; }, end() { return this; } };
  await handler(req, res);
  assert.equal(statusCode, 200, JSON.stringify(payload));
  return { payload, token: headers["x-training-state"] || token };
}

resetMemoryAttemptStore();
let total = 0;
let blank = 0;
let missingTerminal = 0;
let waiting = 0;
for (const caseData of cases) {
  const applicable = catalog.filter((order) => orderApplicableForSex(order, caseData.sex));
  const ids = [...new Set(applicable.map(sourceOrderId))];
  const attemptId = `all-orders-${caseData.id}`;
  let response = await call({ action: "init-attempt", caseId: caseData.id, attemptId, mode: "free", language: "zh" });
  response = await call({ action: "stage-feedback", caseId: caseData.id, attemptId, mode: "free", language: "zh", stageKey: "history", submission: {} }, response.token);
  response = await call({ action: "order", caseId: caseData.id, attemptId, mode: "free", language: "zh", input: ids.join(";") }, response.token);
  for (const order of applicable) {
    response = await call({ action: "order", caseId: caseData.id, attemptId, mode: "free", language: "zh", input: order.displayName }, response.token);
    const outcomes = response.payload.orderOutcomes || [];
    assert.equal(response.payload.recognizedOrderCount, 1, `${caseData.id}/${order.displayName}:recognized`);
    assert.equal(outcomes.length, 1, `${caseData.id}/${order.displayName}:outcomes`);
    assert.doesNotMatch(JSON.stringify(response.payload), forbidden, `${caseData.id}/${order.displayName}:public_boundary`);
    const reports = response.payload.results || [];
    const outcome = outcomes[0];
    total += 1;
    if (!String(outcome.status || "").trim()) missingTerminal += 1;
    if (!String(outcome.message || "").trim()) blank += 1;
    if (/等待医学审核|等待审核元数据|awaiting medical review/iu.test(String(outcome.message || ""))) waiting += 1;
    if (["reported", "existing_report"].includes(outcome.status)) {
      assert(reports.some((report) => report.orderId === outcome.orderId || report.coveredOrderIds?.includes(outcome.orderId)), `${caseData.id}/${outcome.orderId}:visible_report_missing`);
    }
    assert(!reports.some((report) => report.caseId && report.caseId !== caseData.id), `${caseData.id}/${outcome.orderId}:case_leak`);
  }
}

assert.equal(total, 2742);
assert.equal(missingTerminal, 0);
assert.equal(blank, 0);
assert.equal(waiting, 0);
console.log(JSON.stringify({ totalOrders: total, missingTerminal, blankResults: blank, waitingReviewCopy: waiting, visibleOutcome: total }));
