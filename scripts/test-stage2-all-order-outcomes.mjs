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
const medicalAuthor = require("../desktop/medical-author-approved-stage2-results.json");
const { buildStudentOrderCatalog, orderApplicableForCase, sourceOrderId } = require("../shared/dataAgentPresentation.js");
const { desktopTeachingSimulation } = require("../server/desktopClinicalContentProjection.js");
const { digest, loadAttempt, resetMemoryAttemptStore } = require("../server/trainingAttemptStore.js");

const catalog = buildStudentOrderCatalog([...labs, ...imaging, ...procedures, ...perioperative]);
const forbidden = /等待医学审核|等待审核元数据|awaiting medical review|simulated|provenance|medical_review_pending|diagnosticEligible|scoringEligible|affectsDiagnosis|affectsScore/iu;
const introducedLaterality = /左侧|右侧|左肾|右肾|左输尿管|右输尿管|\bleft\b|\bright\b/iu;
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
let generatedCombinationCount = 0;
let sexConflictCount = 0;
let lateralityConflictCount = 0;
let sourceConflictCount = 0;
let secondDiagnosisCount = 0;
let governanceLeakCount = 0;
let invalidUnitCount = 0;
let unitAuditCount = 0;
const catalogCombinations = new Set();
const unitCandidate = /\d(?:[\d.<>≥–]*)\s*(?:\/HPF|g\/g|g\/24 h|×10\^9\/L|mg\/L|ng\/mL|μmol\/L|mL\/min\/1\.73 m²|mmol\/L|U\/L|g\/L|mL\/s|mL|L|s|%)/gu;
const allowedUnit = /(?:\/HPF|g\/g|g\/24 h|×10\^9\/L|mg\/L|ng\/mL|μmol\/L|mL\/min\/1\.73 m²|mmol\/L|U\/L|g\/L|mL\/s|mL|L|s|%)$/u;
const classifications = {
  REAL_REPORT: 0,
  SHARED_REAL_REPORT: 0,
  SIMULATED_REPORT: 0,
  TEACHING_SIMULATION_MEDICAL_AUTHOR_APPROVED: 0,
  SOURCE_DERIVED_REPORT: 0,
  NOT_PERFORMED_OR_NOT_APPLICABLE: 0,
  NO_CASE_RESULT: 0
};
const authorTypes = new Map(medicalAuthor.items.map((item) => [`${item.caseId}:${item.orderId}`, item.finalTerminalType]));
for (const caseData of cases) {
  const applicable = catalog.filter((order) => orderApplicableForCase(order, caseData));
  const ids = [...new Set(applicable.map(sourceOrderId))];
  const attemptId = `all-orders-${caseData.id}`;
  let response = await call({ action: "init-attempt", caseId: caseData.id, attemptId, mode: "free", language: "zh" });
  response = await call({ action: "stage-feedback", caseId: caseData.id, attemptId, mode: "free", language: "zh", stageKey: "history", submission: {} }, response.token);
  response = await call({ action: "order", caseId: caseData.id, attemptId, mode: "free", language: "zh", input: ids.join(";") }, response.token);
  for (const order of applicable) {
    const combination = `${caseData.id}:${sourceOrderId(order)}:${order.displayName}`;
    assert(!catalogCombinations.has(combination), `${combination}:duplicate_catalog_combination`);
    catalogCombinations.add(combination);
    response = await call({ action: "order", caseId: caseData.id, attemptId, mode: "free", language: "zh", input: order.displayName }, response.token);
    const outcomes = response.payload.orderOutcomes || [];
    assert.equal(response.payload.recognizedOrderCount, 1, `${caseData.id}/${order.displayName}:recognized`);
    assert.equal(outcomes.length, 1, `${caseData.id}/${order.displayName}:outcomes`);
    assert.doesNotMatch(JSON.stringify(response.payload), forbidden, `${caseData.id}/${order.displayName}:public_boundary`);
    const reports = response.payload.results || [];
    const outcome = outcomes[0];
    const report = reports.find((item) => item.orderId === outcome.orderId || item.coveredOrderIds?.includes(outcome.orderId));
    const authorType = authorTypes.get(`${caseData.id}:${outcome.orderId}`);
    const generated = String(report?.resultId || "").startsWith("TCH-");
    const classification = generated
      ? "TEACHING_SIMULATION_MEDICAL_AUTHOR_APPROVED"
      : authorType === "SIMULATED_REPORT"
      ? "SIMULATED_REPORT"
      : authorType === "SOURCE_DERIVED_REPORT"
        ? "SOURCE_DERIVED_REPORT"
        : authorType === "NOT_PERFORMED"
          ? "NOT_PERFORMED_OR_NOT_APPLICABLE"
          : report
            ? report.orderId !== outcome.orderId && report.coveredOrderIds?.includes(outcome.orderId)
              ? "SHARED_REAL_REPORT"
              : "REAL_REPORT"
            : ["not_performed", "no_indication", "no_specimen", "not_provided"].includes(outcome.status)
              ? "NOT_PERFORMED_OR_NOT_APPLICABLE"
              : "NO_CASE_RESULT";
    classifications[classification] += 1;
    if (generated) {
      generatedCombinationCount += 1;
      const text = String(report?.result || report?.value || report?.impression || "");
      const expected = desktopTeachingSimulation({ caseData, orderId: report.orderId, displayName: order.displayName });
      const replay = desktopTeachingSimulation({ caseData, orderId: report.orderId, displayName: order.displayName });
      assert.deepEqual({ resultId: report.resultId, result: text }, { resultId: expected.resultId, result: expected.result }, `${combination}:deterministic_report`);
      assert.deepEqual(replay, expected, `${combination}:deterministic_replay`);
      const unitCandidates = text.match(unitCandidate) || [];
      unitAuditCount += unitCandidates.length;
      invalidUnitCount += unitCandidates.filter((item) => !allowedUnit.test(item.trim())).length;
      if (caseData.sex === "女" && /前列腺|PSA/iu.test(text)) sexConflictCount += 1;
      if (introducedLaterality.test(text)) lateralityConflictCount += 1;
      if (reports.filter((item) => item.orderId === outcome.orderId || item.coveredOrderIds?.includes(outcome.orderId)).length !== 1) sourceConflictCount += 1;
      if (/诊断为|考虑为|符合.{0,8}(?:第二|另有|新发)/u.test(text)) secondDiagnosisCount += 1;
    }
    total += 1;
    if (!String(outcome.status || "").trim()) missingTerminal += 1;
    if (!String(outcome.message || "").trim()) blank += 1;
    if (/等待医学审核|等待审核元数据|awaiting medical review/iu.test(String(outcome.message || ""))) waiting += 1;
    if (["reported", "existing_report"].includes(outcome.status)) {
      assert(reports.some((report) => report.orderId === outcome.orderId || report.coveredOrderIds?.includes(outcome.orderId)), `${caseData.id}/${outcome.orderId}:visible_report_missing`);
    }
    assert(!reports.some((report) => report.caseId && report.caseId !== caseData.id), `${caseData.id}/${outcome.orderId}:case_leak`);
  }
  const stored = await loadAttempt({ caseId: caseData.id, attemptId, token: response.token, requestId: `audit-${caseData.id}`, requestDigest: digest(`audit-${caseData.id}`) });
  const generatedReports = stored.state.releasedReports.filter((item) => String(item.resultId || "").startsWith("TCH-"));
  for (const report of generatedReports) {
    if (report.provenance !== "teaching_simulation_medical_author_approved"
      || report.diagnosticEligible !== false || report.scoringEligible !== false
      || report.affectsDiagnosis !== false || report.affectsScore !== false) governanceLeakCount += 1;
  }
  for (const event of stored.state.events.filter((item) => item.type === "result_returned" && String(item.eventId || "").includes("TCH-"))) {
    if (event.metadata?.validated !== false || event.metadata?.diagnosticEligible !== false || event.metadata?.scoringEligible !== false) governanceLeakCount += 1;
  }
}

console.log(`STAGE2_ALL_ORDER_PRECHECK ${JSON.stringify({ total, classifications, generatedCombinationCount, catalogCombinations: catalogCombinations.size, unitAuditCount, invalidUnitCount, sexConflictCount, lateralityConflictCount, sourceConflictCount, secondDiagnosisCount, governanceLeakCount, missingTerminal, blank, waiting })}`);
assert.equal(total, 2692);
assert.equal(missingTerminal, 0);
assert.equal(blank, 0);
assert.equal(waiting, 0);
assert.equal(generatedCombinationCount, 2508);
assert.equal(catalogCombinations.size, 2692);
assert(unitAuditCount > 1000);
assert.equal(invalidUnitCount, 0);
assert.equal(classifications.NOT_PERFORMED_OR_NOT_APPLICABLE, 0);
assert.equal(classifications.NO_CASE_RESULT, 0);
assert.equal(sexConflictCount, 0);
assert.equal(lateralityConflictCount, 0);
assert.equal(sourceConflictCount, 0);
assert.equal(secondDiagnosisCount, 0);
assert.equal(governanceLeakCount, 0);
assert.equal(Object.values(classifications).reduce((sum, count) => sum + count, 0), total);
console.log(JSON.stringify({
  totalOrders: total,
  classifications,
  generatedCombinationCount,
  caseOrderUnique: catalogCombinations.size === total,
  unitsReasonable: invalidUnitCount === 0,
  unitAuditCount,
  invalidUnitCount,
  sexConflictCount,
  lateralityConflictCount,
  sourceConflictCount,
  secondDiagnosisCount,
  governanceLeakCount,
  missingTerminal,
  blankResults: blank,
  waitingReviewCopy: waiting,
  visibleReportCards: total
}));
