import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

process.env.TRAINING_STATE_SECRET = "qa-stage-visibility-secret-with-adequate-length";
process.env.TRAINING_ATTEMPT_STORE_MODE = "memory";
process.env.TRAINING_DEPLOYMENT_TIER = "practice";
process.env.TRAINING_API_RATE_LIMIT_PER_MINUTE = "1000000";

const require = createRequire(import.meta.url);
const trainingHandler = require("../../api/training-action.js");
const { resetMemoryAttemptStore } = require("../../server/trainingAttemptStore.js");
const {
  containsCjk,
  presentExamResult,
  presentOrderCatalogItem
} = require("../../shared/dataAgentPresentation.js");
const cases = require("../../data/cases.json");
const examItems = require("../../data/physical_exam_items.json");
const examResults = require("../../data/physical_exam_results.json");
const structuredResults = require("../../data/order_results_structured.json");
const catalog = [
  ...require("../../data/order_catalog_labs.json"),
  ...require("../../data/order_catalog_imaging.json"),
  ...require("../../data/order_catalog_procedures.json"),
  ...require("../../data/order_catalog_perioperative.json")
];

const PRODUCTION_SHA = "c4ac9b5a59021bed10dc2d94c4ebf4d8f97badd2";
const languages = ["zh", "en"];
const catalogById = new Map(catalog.map((item) => [item.orderId, item]));
const caseById = new Map(cases.map((item) => [item.id, item]));
const forbiddenPayloadKeys = new Set([
  "teacherOnlyRationale",
  "teachingNote",
  "sourceUrl",
  "resultShouldInclude",
  "cautions",
  "synonyms",
  "scenario"
]);

function cliValue(name, fallback = "") {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function publicCaseId(caseId) {
  const item = caseById.get(caseId);
  return String(item?.displayCaseId || item?.id || caseId);
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function sameMembers(actual, expected) {
  return JSON.stringify(sortedUnique(actual)) === JSON.stringify(sortedUnique(expected));
}

function categoryForOrder(orderId) {
  if (String(orderId).startsWith("END-")) return "endoscopy";
  if (String(orderId).startsWith("LAB-PATH-")) return "pathology";
  if (String(orderId).startsWith("IMG-")) return "imaging";
  if (String(orderId).startsWith("LAB-")) return "laboratory";
  return "other";
}

function translationAvailable(orderId, language) {
  if (language !== "en") return true;
  const item = catalogById.get(orderId);
  return Boolean(item && presentOrderCatalogItem(item, "en").translationAvailable);
}

function englishEligibleResult(result) {
  return translationAvailable(result.orderId, "en")
    && (result.prerequisites || []).every((orderId) => translationAvailable(orderId, "en"));
}

function collectForbiddenKeys(value, found = new Set()) {
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    for (const item of value) collectForbiddenKeys(item, found);
    return found;
  }
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenPayloadKeys.has(key)) found.add(key);
    collectForbiddenKeys(child, found);
  }
  return found;
}

function visibleEnglishResultContainsCjk(payload) {
  const values = [
    payload?.message,
    ...(payload?.matchedOrders || []).flatMap((item) => [item.displayName]),
    ...(payload?.results || []).flatMap((item) => [
      item.orderCategory,
      item.result,
      item.value,
      item.unit,
      item.referenceRange,
      item.impression,
      item.abnormalLevel,
      item.teachingExplanation
    ])
  ];
  return values.some((value) => containsCjk(value));
}

async function invoke(body, token, remoteAddress, sequence) {
  let statusCode = 200;
  let payload = {};
  const responseHeaders = {};
  const requestBody = { ...body, requestId: `qa-data-stage-${sequence}` };
  const req = {
    method: "POST",
    body: requestBody,
    headers: token ? { "x-training-state": token } : {},
    socket: { remoteAddress }
  };
  const res = {
    setHeader(name, value) { responseHeaders[String(name).toLowerCase()] = String(value); },
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; },
    end() { return this; }
  };
  await trainingHandler(req, res);
  return {
    statusCode,
    payload,
    token: responseHeaders["x-training-state"] || token,
    tokenAdvanced: Boolean(responseHeaders["x-training-state"])
      && responseHeaders["x-training-state"] !== token
  };
}

const failureGroups = new Map();
function fail(kind, { caseId = "", language = "", actionId = "", actual = "" } = {}) {
  const key = JSON.stringify({ kind, language, actionId, actual });
  const group = failureGroups.get(key) || {
    kind,
    language,
    actionId,
    actual,
    count: 0,
    caseIds: new Set()
  };
  group.count += 1;
  if (caseId) group.caseIds.add(publicCaseId(caseId));
  failureGroups.set(key, group);
}

function expectStatus(response, statusCode, error, context) {
  if (response.statusCode !== statusCode || (error && response.payload?.error !== error)) {
    fail("unexpected_status", {
      ...context,
      actual: `${response.statusCode}:${response.payload?.error || ""}`
    });
    return false;
  }
  return true;
}

async function startStageTwo(caseId, language, suffix) {
  const attemptId = `qa-stage-${publicCaseId(caseId).toLowerCase()}-${language}-${suffix}`;
  const remoteAddress = `qa-stage-${publicCaseId(caseId).toLowerCase()}-${language}-${suffix}`;
  let response = await invoke({
    action: "init-attempt",
    caseId,
    attemptId,
    mode: "free",
    language
  }, "", remoteAddress, `${suffix}-init`);
  if (!expectStatus(response, 200, "", { caseId, language, actionId: "init-attempt" })) {
    return { attemptId, remoteAddress, response };
  }
  response = await invoke({
    action: "stage-feedback",
    caseId,
    attemptId,
    mode: "free",
    language,
    stageKey: "history",
    submission: {}
  }, response.token, remoteAddress, `${suffix}-history`);
  expectStatus(response, 200, "", { caseId, language, actionId: "history" });
  return { attemptId, remoteAddress, response };
}

const metrics = {
  caseLanguageSessions: 0,
  stagePermissionProbes: 0,
  stageValidationChecks: 0,
  examSelectionChecks: 0,
  configuredExamChecks: 0,
  unavailableExamChecks: 0,
  orderBatchChecks: 0,
  expectedResultChecks: 0,
  prerequisiteRecoveryScenarios: 0,
  prerequisiteControls: 0,
  prerequisiteRecoveryFailures: 0,
  prerequisiteControlFailures: 0,
  payloadLeakageFailures: 0,
  englishCjkFailures: 0
};
const resultCategoryChecks = {
  zh: { laboratory: 0, imaging: 0, endoscopy: 0, pathology: 0, other: 0 },
  en: { laboratory: 0, imaging: 0, endoscopy: 0, pathology: 0, other: 0 }
};

resetMemoryAttemptStore();

for (const caseData of cases) {
  const caseId = caseData.id;
  const configuredExams = new Map(examResults
    .filter((item) => item.caseId === caseId && item.studentVisibleAfterSelection)
    .map((item) => [item.examId, item]));
  const configuredResults = structuredResults.filter((item) => item.caseId === caseId);

  for (const language of languages) {
    metrics.caseLanguageSessions += 1;
    const attemptId = `qa-stage-matrix-${publicCaseId(caseId).toLowerCase()}-${language}`;
    const remoteAddress = `qa-stage-matrix-${publicCaseId(caseId).toLowerCase()}-${language}`;
    const context = { caseId, language };
    const firstOrderId = configuredResults[0]?.orderId || catalog[0].orderId;
    let response = await invoke({
      action: "init-attempt",
      caseId,
      attemptId,
      mode: "free",
      language
    }, "", remoteAddress, `${publicCaseId(caseId)}-${language}-init`);
    if (!expectStatus(response, 200, "", { ...context, actionId: "init-attempt" })) continue;

    const initialToken = response.token;
    for (const probe of [
      { action: "exam", input: examItems[0].displayName },
      { action: "order", input: firstOrderId }
    ]) {
      metrics.stagePermissionProbes += 1;
      const rejected = await invoke({
        action: probe.action,
        caseId,
        attemptId,
        mode: "free",
        language,
        input: probe.input
      }, response.token, remoteAddress, `${publicCaseId(caseId)}-${language}-early-${probe.action}`);
      expectStatus(rejected, 409, "stage_not_unlocked", { ...context, actionId: `early-${probe.action}` });
      if (rejected.tokenAdvanced || rejected.token !== response.token) {
        fail("rejected_action_advanced_token", { ...context, actionId: `early-${probe.action}` });
      }
    }

    response = await invoke({
      action: "validate-attempt",
      caseId,
      attemptId,
      mode: "free",
      language
    }, initialToken, remoteAddress, `${publicCaseId(caseId)}-${language}-validate-stage-1`);
    metrics.stageValidationChecks += 1;
    if (!expectStatus(response, 200, "", { ...context, actionId: "validate-stage-1" })
      || response.payload?.currentStage !== 1) {
      fail("unexpected_current_stage", { ...context, actionId: "validate-stage-1", actual: String(response.payload?.currentStage) });
    }

    response = await invoke({
      action: "stage-feedback",
      caseId,
      attemptId,
      mode: "free",
      language,
      stageKey: "history",
      submission: {}
    }, response.token, remoteAddress, `${publicCaseId(caseId)}-${language}-history`);
    if (!expectStatus(response, 200, "", { ...context, actionId: "history" })) continue;

    response = await invoke({
      action: "validate-attempt",
      caseId,
      attemptId,
      mode: "free",
      language
    }, response.token, remoteAddress, `${publicCaseId(caseId)}-${language}-validate-stage-2`);
    metrics.stageValidationChecks += 1;
    if (!expectStatus(response, 200, "", { ...context, actionId: "validate-stage-2" })
      || response.payload?.currentStage !== 2) {
      fail("unexpected_current_stage", { ...context, actionId: "validate-stage-2", actual: String(response.payload?.currentStage) });
    }

    for (const examItem of examItems) {
      response = await invoke({
        action: "exam",
        caseId,
        attemptId,
        mode: "free",
        language,
        input: examItem.displayName
      }, response.token, remoteAddress, `${publicCaseId(caseId)}-${language}-exam-${examItem.examId}`);
      metrics.examSelectionChecks += 1;
      if (!expectStatus(response, 200, "", { ...context, actionId: examItem.examId })) continue;
      const configured = configuredExams.get(examItem.examId);
      if (configured) {
        metrics.configuredExamChecks += 1;
        const expected = presentExamResult(configured.result, language);
        if (response.payload?.examId !== examItem.examId
          || response.payload?.result !== expected.text
          || response.payload?.translationStatus !== expected.translationStatus) {
          fail("configured_exam_mapping_failure", { ...context, actionId: examItem.examId });
        }
      } else {
        metrics.unavailableExamChecks += 1;
        const expectedResult = language === "en"
          ? "No configured result is available for this examination."
          : "当前查体项目暂无可返回结果。";
        if (response.payload?.examId !== examItem.examId
          || response.payload?.result !== expectedResult
          || response.payload?.translationStatus !== "not_available") {
          fail("unconfigured_exam_not_fail_closed", { ...context, actionId: examItem.examId });
        }
      }
      const forbidden = [...collectForbiddenKeys(response.payload)];
      if (forbidden.length) {
        metrics.payloadLeakageFailures += 1;
        fail("teacher_or_source_key_leakage", {
          ...context,
          actionId: examItem.examId,
          actual: forbidden.join(",")
        });
      }
      if (language === "en" && containsCjk(response.payload?.result)) {
        metrics.englishCjkFailures += 1;
        fail("english_exam_cjk_leakage", { ...context, actionId: examItem.examId });
      }
    }

    const eligibleRows = configuredResults.filter((item) => language !== "en" || englishEligibleResult(item));
    const selectedOrderIds = sortedUnique(eligibleRows.flatMap((item) => [
      item.orderId,
      ...(item.prerequisites || [])
    ]));
    const expectedRows = configuredResults.filter((item) => selectedOrderIds.includes(item.orderId)
      && (item.prerequisites || []).every((orderId) => selectedOrderIds.includes(orderId))
      && (language !== "en" || englishEligibleResult(item)));
    response = await invoke({
      action: "order",
      caseId,
      attemptId,
      mode: "free",
      language,
      input: selectedOrderIds.join(";")
    }, response.token, remoteAddress, `${publicCaseId(caseId)}-${language}-order-batch`);
    metrics.orderBatchChecks += 1;
    if (expectStatus(response, 200, "", { ...context, actionId: "order-batch" })) {
      const actualResultIds = (response.payload?.results || []).map((item) => item.resultId);
      const expectedResultIds = expectedRows.map((item) => item.resultId);
      const actualMatchedOrderIds = (response.payload?.matchedOrders || []).map((item) => item.orderId);
      if (!sameMembers(actualResultIds, expectedResultIds)) {
        fail("result_visibility_mismatch", {
          ...context,
          actionId: "order-batch",
          actual: `${actualResultIds.length}/${expectedResultIds.length}`
        });
      }
      if (!sameMembers(actualMatchedOrderIds, selectedOrderIds)) {
        fail("order_selection_mismatch", {
          ...context,
          actionId: "order-batch",
          actual: `${actualMatchedOrderIds.length}/${selectedOrderIds.length}`
        });
      }
      if ((response.payload?.results || []).some((item) => item.caseId !== caseId)) {
        fail("cross_case_result_leakage", { ...context, actionId: "order-batch" });
      }
      metrics.expectedResultChecks += expectedRows.length;
      for (const item of expectedRows) {
        resultCategoryChecks[language][categoryForOrder(item.orderId)] += 1;
      }
      const forbidden = [...collectForbiddenKeys(response.payload)];
      if (forbidden.length) {
        metrics.payloadLeakageFailures += 1;
        fail("teacher_or_source_key_leakage", {
          ...context,
          actionId: "order-batch",
          actual: forbidden.join(",")
        });
      }
      if (language === "en" && visibleEnglishResultContainsCjk(response.payload)) {
        metrics.englishCjkFailures += 1;
        fail("english_order_cjk_leakage", { ...context, actionId: "order-batch" });
      }
    }

    response = await invoke({
      action: "stage-feedback",
      caseId,
      attemptId,
      mode: "free",
      language,
      stageKey: "orders",
      submission: {}
    }, response.token, remoteAddress, `${publicCaseId(caseId)}-${language}-orders`);
    if (!expectStatus(response, 200, "", { ...context, actionId: "orders" })) continue;

    for (const probe of [
      { action: "exam", input: examItems[0].displayName },
      { action: "order", input: firstOrderId }
    ]) {
      metrics.stagePermissionProbes += 1;
      const rejected = await invoke({
        action: probe.action,
        caseId,
        attemptId,
        mode: "free",
        language,
        input: probe.input
      }, response.token, remoteAddress, `${publicCaseId(caseId)}-${language}-late-${probe.action}`);
      expectStatus(rejected, 409, "stage_not_unlocked", { ...context, actionId: `late-${probe.action}` });
      if (rejected.tokenAdvanced || rejected.token !== response.token) {
        fail("rejected_action_advanced_token", { ...context, actionId: `late-${probe.action}` });
      }
    }

    response = await invoke({
      action: "validate-attempt",
      caseId,
      attemptId,
      mode: "free",
      language
    }, response.token, remoteAddress, `${publicCaseId(caseId)}-${language}-validate-stage-3`);
    metrics.stageValidationChecks += 1;
    if (!expectStatus(response, 200, "", { ...context, actionId: "validate-stage-3" })
      || response.payload?.currentStage !== 3) {
      fail("unexpected_current_stage", { ...context, actionId: "validate-stage-3", actual: String(response.payload?.currentStage) });
    }
  }
}

const prerequisiteRows = structuredResults.filter((item) => (item.prerequisites || []).length === 1);
const prerequisiteScenarios = [
  ...prerequisiteRows.map((item) => ({ item, language: "zh" })),
  ...prerequisiteRows.filter(englishEligibleResult).map((item) => ({ item, language: "en" }))
];

for (const [index, scenario] of prerequisiteScenarios.entries()) {
  const { item, language } = scenario;
  const caseId = item.caseId;
  const prerequisiteId = item.prerequisites[0];
  const context = { caseId, language, actionId: item.orderId };
  metrics.prerequisiteRecoveryScenarios += 1;

  let started = await startStageTwo(caseId, language, `recovery-${index}`);
  let response = started.response;
  if (response.statusCode === 200) {
    response = await invoke({
      action: "order",
      caseId,
      attemptId: started.attemptId,
      mode: "free",
      language,
      input: item.orderId
    }, response.token, started.remoteAddress, `recovery-${index}-target-first`);
  }
  const targetWithheld = response.statusCode === 200
    && !(response.payload?.results || []).some((result) => result.resultId === item.resultId)
    && (response.payload?.unmetPrerequisites || []).includes(prerequisiteId);
  if (!targetWithheld) fail("prerequisite_not_enforced", context);

  if (response.statusCode === 200) {
    response = await invoke({
      action: "order",
      caseId,
      attemptId: started.attemptId,
      mode: "free",
      language,
      input: prerequisiteId
    }, response.token, started.remoteAddress, `recovery-${index}-prerequisite`);
  }
  if (!expectStatus(response, 200, "", { ...context, actionId: prerequisiteId })) continue;

  response = await invoke({
    action: "order",
    caseId,
    attemptId: started.attemptId,
    mode: "free",
    language,
    input: item.orderId
  }, response.token, started.remoteAddress, `recovery-${index}-target-retry`);
  const recovered = response.statusCode === 200
    && (response.payload?.results || []).some((result) => result.resultId === item.resultId);
  if (!recovered) {
    metrics.prerequisiteRecoveryFailures += 1;
    fail("prerequisite_retry_did_not_release_result", {
      ...context,
      actual: `duplicate=${(response.payload?.duplicateOrderIds || []).includes(item.orderId)}`
    });
  }

  metrics.prerequisiteControls += 1;
  started = await startStageTwo(caseId, language, `control-${index}`);
  response = started.response;
  if (response.statusCode === 200) {
    response = await invoke({
      action: "order",
      caseId,
      attemptId: started.attemptId,
      mode: "free",
      language,
      input: prerequisiteId
    }, response.token, started.remoteAddress, `control-${index}-prerequisite`);
  }
  if (response.statusCode === 200) {
    response = await invoke({
      action: "order",
      caseId,
      attemptId: started.attemptId,
      mode: "free",
      language,
      input: item.orderId
    }, response.token, started.remoteAddress, `control-${index}-target`);
  }
  const controlReleased = response.statusCode === 200
    && (response.payload?.results || []).some((result) => result.resultId === item.resultId);
  if (!controlReleased) {
    metrics.prerequisiteControlFailures += 1;
    fail("prerequisite_first_control_failed", context);
  }
}

const numericFinalLabs = structuredResults.filter((item) => item.status === "final"
  && String(item.orderId || "").startsWith("LAB-")
  && /[0-9]/.test(String(item.value || "")));
const blockedMedicalMetadataCount = numericFinalLabs.filter((item) => !String(item.unit || "").trim()
  || !String(item.referenceRange || "").trim()).length;
const untranslatedEnglishCatalog = catalog.filter((item) => !presentOrderCatalogItem(item, "en").translationAvailable);
const blockedEnglishResultRows = structuredResults.filter((item) => !englishEligibleResult(item));
const pendingEnglishExamRows = examResults.filter((item) => containsCjk(item.result));

const serializedFailureGroups = [...failureGroups.values()]
  .map((item) => ({
    kind: item.kind,
    language: item.language,
    actionId: item.actionId,
    actual: item.actual,
    count: item.count,
    caseIds: [...item.caseIds].sort()
  }))
  .sort((a, b) => `${a.kind}:${a.language}:${a.actionId}`.localeCompare(`${b.kind}:${b.language}:${b.actionId}`));
const totalFailures = serializedFailureGroups.reduce((sum, item) => sum + item.count, 0);
const nonRecoveryFailures = serializedFailureGroups
  .filter((item) => item.kind !== "prerequisite_retry_did_not_release_result")
  .reduce((sum, item) => sum + item.count, 0);

const report = {
  schemaVersion: 1,
  productionSha: PRODUCTION_SHA,
  status: totalFailures ? "FAIL_LOCAL_QA" : "PASS_LOCAL",
  defectId: metrics.prerequisiteRecoveryFailures ? "HEM-P1-055" : null,
  source: "production_training_action_local_blackbox",
  providerCalls: 0,
  matrix: {
    cases: cases.length,
    languages: languages.length,
    examItems: examItems.length,
    configuredExamRows: examResults.length,
    structuredResultRows: structuredResults.length,
    prerequisiteRows: prerequisiteRows.length,
    prerequisiteCases: new Set(prerequisiteRows.map((item) => item.caseId)).size,
    prerequisiteScenarios: prerequisiteScenarios.length,
    ...metrics,
    resultCategoryChecks
  },
  sourceGovernance: {
    blockedMedicalMetadataCount,
    untranslatedEnglishCatalogCount: untranslatedEnglishCatalog.length,
    blockedEnglishResultRowCount: blockedEnglishResultRows.length,
    pendingEnglishExamRowCount: pendingEnglishExamRows.length,
    statuses: {
      medicalMetadata: "BLOCKED_MEDICAL",
      englishNamesAndResultText: "BLOCKED_SOURCE_REVISION"
    }
  },
  result: {
    passed: totalFailures === 0,
    totalFailures,
    nonRecoveryFailures,
    failureGroupCount: serializedFailureGroups.length,
    failureGroups: serializedFailureGroups
  },
  safeguards: {
    requestBodiesRetained: false,
    responseBodiesRetained: false,
    medicalValuesRetained: false,
    teacherContentRetained: false,
    credentialsRetained: false
  }
};

const reportPath = path.resolve(cliValue(
  "report",
  "artifacts/exploratory-qa/reports/data-agent-stage-visibility-matrix.json"
));
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`DATA_AGENT_STAGE_VISIBILITY_EVIDENCE ${JSON.stringify({
  cases: report.matrix.cases,
  sessions: report.matrix.caseLanguageSessions,
  examChecks: report.matrix.examSelectionChecks,
  resultChecks: report.matrix.expectedResultChecks,
  stagePermissionProbes: report.matrix.stagePermissionProbes,
  prerequisiteScenarios: report.matrix.prerequisiteScenarios,
  prerequisiteRecoveryFailures: report.matrix.prerequisiteRecoveryFailures,
  nonRecoveryFailures,
  totalFailures
})}`);
if (totalFailures) process.exitCode = 1;
