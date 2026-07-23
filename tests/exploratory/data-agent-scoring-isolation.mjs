import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

process.env.TRAINING_STATE_SECRET = "qa-only-data-agent-scoring-isolation-secret";

const require = createRequire(import.meta.url);
const catalogs = [
  ...require("../../data/order_catalog_labs.json"),
  ...require("../../data/order_catalog_imaging.json"),
  ...require("../../data/order_catalog_procedures.json"),
  ...require("../../data/order_catalog_perioperative.json")
];
const results = require("../../data/order_results_structured.json");
const rubrics = require("../../data/event_rubrics.json");
const { presentOrderCatalogItem } = require("../../shared/dataAgentPresentation.js");
const handler = require("../../api/training-action.js");

const PRODUCTION_SHA = process.env.QA_PRODUCTION_SHA || "unknown";
const REPORT_PATH = path.resolve(
  process.env.QA_DATA_AGENT_SCORING_REPORT
    || "artifacts/exploratory-qa/reports/data-agent-scoring-isolation.json"
);
const stages = ["history", "orders", "diagnosis", "consult", "treatment", "perioperative", "debrief"];
let requestCounter = 0;

async function call(body, token = "") {
  let statusCode = 200;
  let payload;
  const headers = {};
  const requestId = `qa-data-score-${++requestCounter}`;
  const req = {
    method: "POST",
    body: { ...body, requestId },
    headers: token ? { "x-training-state": token } : {},
    socket: { remoteAddress: requestId }
  };
  const res = {
    setHeader(name, value) { headers[String(name).toLowerCase()] = value; },
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; },
    end() { return this; }
  };
  await handler(req, res);
  return { statusCode, payload, token: headers["x-training-state"] || token };
}

async function openAttempt(caseId, suffix) {
  const attemptId = `qa-data-score-${caseId}-${suffix}-${Date.now()}-${requestCounter}`;
  const initialized = await call({
    action: "init-attempt",
    caseId,
    attemptId,
    mode: "free",
    language: "en"
  });
  assert.equal(initialized.statusCode, 200);
  const history = await call({
    action: "stage-feedback",
    caseId,
    attemptId,
    mode: "free",
    language: "en",
    stageKey: "history",
    submission: {}
  }, initialized.token);
  assert.equal(history.statusCode, 200);
  return { attemptId, token: history.token };
}

async function placeUnreviewedOrder(caseId, orderId, suffix) {
  const attempt = await openAttempt(caseId, suffix);
  const ordered = await call({
    action: "order",
    caseId,
    attemptId: attempt.attemptId,
    mode: "free",
    language: "en",
    input: orderId
  }, attempt.token);
  assert.equal(ordered.statusCode, 200);
  return { ...attempt, token: ordered.token, payload: ordered.payload };
}

const unreviewedOrders = catalogs.filter(
  (item) => presentOrderCatalogItem(item, "en").translationAvailable === false
);
assert.equal(unreviewedOrders.length, 23);

let untranslatedOrdersExercised = 0;
let untranslatedOrdersMatchedByApi = 0;
let untranslatedOrdersReturnedResults = 0;
for (const order of unreviewedOrders) {
  const configured = results.find((item) => item.orderId === order.orderId);
  const placed = await placeUnreviewedOrder(configured?.caseId || "P001", order.orderId, "catalog");
  untranslatedOrdersExercised += 1;
  if ((placed.payload?.matchedOrders || []).some((item) => item.orderId === order.orderId)) {
    untranslatedOrdersMatchedByApi += 1;
  }
  if ((placed.payload?.results || []).some((item) => item.orderId === order.orderId)) {
    untranslatedOrdersReturnedResults += 1;
  }
}

const scoringLinks = [];
for (const row of rubrics) {
  for (const dimension of row.dimensions || []) {
    for (const requirement of dimension.requirements || []) {
      if (requirement.eventType === "order_placed"
        && unreviewedOrders.some((item) => item.orderId === requirement.key)) {
        scoringLinks.push({
          caseId: row.caseId,
          orderId: requirement.key,
          rubricItemId: requirement.id
        });
      }
    }
  }
}

let scoredLinks = 0;
let scoredPoints = 0;
for (const [index, link] of scoringLinks.entries()) {
  const placed = await placeUnreviewedOrder(link.caseId, link.orderId, `score-${index}`);
  let token = placed.token;
  for (const stageKey of stages.slice(1)) {
    const stage = await call({
      action: "stage-feedback",
      caseId: link.caseId,
      attemptId: placed.attemptId,
      mode: "free",
      language: "en",
      stageKey,
      submission: {}
    }, token);
    assert.equal(stage.statusCode, 200);
    token = stage.token;
  }
  const score = await call({
    action: "score",
    caseId: link.caseId,
    attemptId: placed.attemptId,
    mode: "free",
    language: "en"
  }, token);
  assert.equal(score.statusCode, 200);
  const rubricItem = (score.payload?.items || [])
    .flatMap((item) => item.rubricItems || [])
    .find((item) => item.rubricItemId === link.rubricItemId);
  if (rubricItem?.status === "earned") {
    scoredLinks += 1;
    scoredPoints += Number(rubricItem.score || 0);
  }
}

const summary = {
  schemaVersion: 1,
  productionSha: PRODUCTION_SHA,
  source: "public_training_handler_local_blackbox",
  medicalTruthAdjudicated: false,
  medicalValuesRetained: false,
  orderNamesRetained: false,
  credentialsRetained: false,
  unreviewedEnglishOrderNames: unreviewedOrders.length,
  untranslatedOrdersExercised,
  untranslatedOrdersMatchedByApi,
  untranslatedOrdersReturnedResults,
  scoringRelevantOrderCount: new Set(scoringLinks.map((item) => item.orderId)).size,
  scoringRuleLinksExercised: scoringLinks.length,
  scoringRuleLinksEarned: scoredLinks,
  scoringPointsEarned: scoredPoints,
  expected: {
    untranslatedOrdersMatchedByApi: 0,
    untranslatedOrdersReturnedResults: 0,
    scoringRuleLinksEarned: 0,
    scoringPointsEarned: 0
  }
};

await mkdir(path.dirname(REPORT_PATH), { recursive: true });
await writeFile(REPORT_PATH, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(`Data Agent scoring isolation: unreviewed=${unreviewedOrders.length} matched=${untranslatedOrdersMatchedByApi} results=${untranslatedOrdersReturnedResults} scoringLinks=${scoredLinks}/${scoringLinks.length} scoredPoints=${scoredPoints}.`);

assert.equal(untranslatedOrdersMatchedByApi, 0, "an unreviewed English order name remained callable by internal ID");
assert.equal(untranslatedOrdersReturnedResults, 0, "an unreviewed English order returned a deterministic report");
assert.equal(scoredLinks, 0, "an unreviewed English order entered deterministic scoring");
assert.equal(scoredPoints, 0, "an unreviewed English order earned deterministic points");
