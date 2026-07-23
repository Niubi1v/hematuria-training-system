import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

process.env.TRAINING_STATE_SECRET = "qa-data-agent-bilingual-secret-with-adequate-length";
process.env.TRAINING_ATTEMPT_STORE_MODE = "memory";
process.env.TRAINING_DEPLOYMENT_TIER = "practice";
process.env.TRAINING_API_RATE_LIMIT_PER_MINUTE = "10000";

const require = createRequire(import.meta.url);
const trainingHandler = require("../../api/training-action.js");
const { resetMemoryAttemptStore } = require("../../server/trainingAttemptStore.js");
const cases = require("../../data/cases.json");
const results = require("../../data/order_results_structured.json");
const catalog = [
  ...require("../../data/order_catalog_labs.json"),
  ...require("../../data/order_catalog_imaging.json"),
  ...require("../../data/order_catalog_procedures.json"),
  ...require("../../data/order_catalog_perioperative.json")
];

const CJK = /[\u3400-\u9fff]/u;
const visibleResultFields = [
  "orderCategory",
  "result",
  "value",
  "unit",
  "referenceRange",
  "impression",
  "abnormalLevel",
  "teachingExplanation"
];

function cliValue(name, fallback = "") {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function publicCaseId(caseData) {
  return String(caseData.displayCaseId || caseData.id);
}

function hasCjk(value) {
  return CJK.test(String(value || ""));
}

async function invoke(body, token, remoteAddress, sequence) {
  let statusCode = 200;
  let payload = {};
  const responseHeaders = {};
  const requestBody = {
    ...body,
    requestId: `qa-data-agent-en-${sequence}`
  };
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
    token: responseHeaders["x-training-state"] || token
  };
}

const reportPath = path.resolve(cliValue("report", "artifacts/exploratory-qa/reports/data-agent-bilingual-audit.json"));
const catalogByOrderId = new Map(catalog.map((item) => [item.orderId, item]));
const statusCounts = {};
const fieldCjkCounts = Object.fromEntries(visibleResultFields.map((field) => [field, 0]));
const caseSummaries = [];
let handlerFailureCount = 0;
let returnedResultCount = 0;
let matchedOrderDisplayNameCjkCount = 0;
let handlerMessageCjkCount = 0;
let affectedCaseCount = 0;

resetMemoryAttemptStore();
for (const caseData of cases) {
  const caseId = caseData.id;
  const displayCaseId = publicCaseId(caseData);
  const configured = results.filter((item) => item.caseId === caseId);
  const orderIds = [...new Set(configured.flatMap((item) => [item.orderId, ...(item.prerequisites || [])]))];
  const attemptId = `qa-data-agent-en-${displayCaseId.toLowerCase()}`;
  const remoteAddress = `qa-data-agent-${displayCaseId.toLowerCase()}`;
  let response = await invoke({
    action: "init-attempt",
    caseId,
    attemptId,
    mode: "free",
    language: "en"
  }, "", remoteAddress, `${displayCaseId}-init`);
  if (response.statusCode === 200) {
    response = await invoke({
      action: "stage-feedback",
      caseId,
      attemptId,
      mode: "free",
      language: "en",
      stageKey: "history",
      submission: {}
    }, response.token, remoteAddress, `${displayCaseId}-history`);
  }
  if (response.statusCode === 200) {
    response = await invoke({
      action: "order",
      caseId,
      attemptId,
      mode: "free",
      language: "en",
      input: orderIds.join(";")
    }, response.token, remoteAddress, `${displayCaseId}-order`);
  }

  const payload = response.payload || {};
  const returned = Array.isArray(payload.results) ? payload.results : [];
  const caseFieldCjkCounts = Object.fromEntries(visibleResultFields.map((field) => [field, 0]));
  for (const item of returned) {
    returnedResultCount += 1;
    statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
    for (const field of visibleResultFields) {
      if (hasCjk(item[field])) {
        fieldCjkCounts[field] += 1;
        caseFieldCjkCounts[field] += 1;
      }
    }
  }
  const displayNameCjkCount = (payload.matchedOrders || []).filter((item) => hasCjk(item.displayName)).length;
  const messageContainsCjk = hasCjk(payload.message);
  matchedOrderDisplayNameCjkCount += displayNameCjkCount;
  handlerMessageCjkCount += Number(messageContainsCjk);
  const caseHasCjk = displayNameCjkCount > 0
    || messageContainsCjk
    || Object.values(caseFieldCjkCounts).some((count) => count > 0);
  affectedCaseCount += Number(caseHasCjk);
  if (response.statusCode !== 200 || returned.length !== configured.length) handlerFailureCount += 1;
  caseSummaries.push({
    caseId: displayCaseId,
    statusCode: response.statusCode,
    configuredResultCount: configured.length,
    returnedResultCount: returned.length,
    matchedOrderDisplayNameCjkCount: displayNameCjkCount,
    handlerMessageContainsCjk: messageContainsCjk,
    visibleResultFieldCjkCounts: caseFieldCjkCounts
  });
}

const catalogDisplayNameCjkCount = catalog.filter((item) => hasCjk(item.displayName)).length;
const catalogPrimaryCategoryCjkCount = catalog.filter((item) => hasCjk(item.primaryCategory)).length;
const catalogSecondaryCategoryCjkCount = catalog.filter((item) => hasCjk(item.secondaryCategory)).length;
const catalogWithoutCjkFreeAliasCount = catalog.filter((item) => {
  const aliases = [item.displayName, ...(item.synonyms || [])];
  return !aliases.some((alias) => /[A-Za-z]/.test(String(alias)) && !hasCjk(alias));
}).length;
const visibleResultCjkCount = Object.values(fieldCjkCounts).reduce((sum, count) => sum + count, 0);
const cjkFailureCount = catalogDisplayNameCjkCount
  + catalogPrimaryCategoryCjkCount
  + catalogSecondaryCategoryCjkCount
  + matchedOrderDisplayNameCjkCount
  + handlerMessageCjkCount
  + visibleResultCjkCount;
const summary = {
  schemaVersion: 1,
  productionSha: "657ba5da8fc6460ad7d0deea882a010c40938b40",
  runtimeEquivalentSha: "3a16f9314d1b3cf50e30bc41dcfeaf19f4fa77a8",
  status: handlerFailureCount || cjkFailureCount ? "FAIL_LOCAL_QA" : "PASS_LOCAL",
  defectId: cjkFailureCount ? "HEM-P1-048" : null,
  language: "en",
  source: "production_training_action_local_contract",
  providerCalls: 0,
  caseCount: cases.length,
  catalogOrderCount: catalog.length,
  configuredResultCount: results.length,
  returnedResultCount,
  handlerFailureCount,
  affectedCaseCount,
  statusCounts,
  catalogDisplayNameCjkCount,
  catalogPrimaryCategoryCjkCount,
  catalogSecondaryCategoryCjkCount,
  catalogWithoutCjkFreeAliasCount,
  matchedOrderDisplayNameCjkCount,
  handlerMessageCjkCount,
  visibleResultFieldCjkCounts: fieldCjkCounts,
  visibleResultCjkCount,
  cjkFailureCount,
  caseSummaries,
  requestBodiesRetained: false,
  responseBodiesRetained: false,
  medicalValuesRetained: false
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(`Data Agent bilingual audit: cases=${summary.caseCount} results=${summary.returnedResultCount} affectedCases=${affectedCaseCount} cjkSignals=${cjkFailureCount} handlerFailures=${handlerFailureCount}.`);
if (handlerFailureCount || cjkFailureCount) process.exitCode = 1;
