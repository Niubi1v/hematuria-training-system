import assert from "node:assert/strict";

process.env.TRAINING_STATE_SECRET = "unit-test-data-agent-authority-secret-with-adequate-length";
process.env.TRAINING_ATTEMPT_STORE_MODE = "memory";
process.env.TRAINING_DEPLOYMENT_TIER = "practice";
process.env.TRAINING_API_RATE_LIMIT_PER_MINUTE = "1000000";

const catalogs = [
  ...require("../data/order_catalog_labs.json"),
  ...require("../data/order_catalog_imaging.json"),
  ...require("../data/order_catalog_procedures.json"),
  ...require("../data/order_catalog_perioperative.json")
] as Array<{ orderId: string; [key: string]: unknown }>;
const results = require("../data/order_results_structured.json") as Array<{
  caseId: string;
  orderId: string;
  resultId: string;
  prerequisites?: string[];
}>;
const rubrics = require("../data/event_rubrics.json") as Array<{
  caseId: string;
  dimensions?: Array<{
    requirements?: Array<{
      id: string;
      eventType: string;
      key: string;
    }>;
  }>;
}>;
const { presentOrderCatalogItem } = require("../shared/dataAgentPresentation.js") as {
  presentOrderCatalogItem(
    item: Record<string, unknown>,
    language: "zh" | "en"
  ): Record<string, unknown> & { translationAvailable: boolean };
};
const handler = require("../api/training-action.js");
const { resetMemoryAttemptStore } = require("../server/trainingAttemptStore.js");

type Response = {
  statusCode: number;
  payload: Record<string, unknown>;
  token: string;
};

let requestCounter = 0;

async function call(body: Record<string, unknown>, token = ""): Promise<Response> {
  let statusCode = 200;
  let payload: Record<string, unknown> = {};
  const headers: Record<string, string> = {};
  const requestId = `data-agent-authority-${++requestCounter}`;
  const req = {
    method: "POST",
    body: { ...body, requestId },
    headers: token ? { "x-training-state": token } : {},
    socket: { remoteAddress: requestId }
  };
  const res = {
    setHeader(name: string, value: string) { headers[name.toLowerCase()] = value; },
    status(code: number) { statusCode = code; return this; },
    json(value: Record<string, unknown>) { payload = value; return this; },
    end() { return this; }
  };
  await handler(req, res);
  return { statusCode, payload, token: headers["x-training-state"] || token };
}

async function startStageTwo(
  caseId: string,
  language: "zh" | "en",
  suffix: string
): Promise<{ attemptId: string; response: Response }> {
  const attemptId = `data-agent-authority-${caseId}-${language}-${suffix}-${requestCounter}`;
  let response = await call({
    action: "init-attempt",
    caseId,
    attemptId,
    mode: "free",
    language
  });
  assert.equal(response.statusCode, 200);
  response = await call({
    action: "stage-feedback",
    caseId,
    attemptId,
    mode: "free",
    language,
    stageKey: "history",
    submission: {}
  }, response.token);
  assert.equal(response.statusCode, 200);
  return { attemptId, response };
}

async function order(
  attemptId: string,
  caseId: string,
  language: "zh" | "en",
  input: string,
  response: Response
): Promise<Response> {
  const next = await call({
    action: "order",
    caseId,
    attemptId,
    mode: "free",
    language,
    input
  }, response.token);
  assert.equal(next.statusCode, 200);
  return next;
}

function ids(payload: Record<string, unknown>, key: string): string[] {
  return ((payload[key] || []) as Array<{ orderId?: string; resultId?: string } | string>)
    .map((item) => typeof item === "string" ? item : String(item.orderId || item.resultId || ""));
}

function resultIds(payload: Record<string, unknown>): string[] {
  return ((payload.results || []) as Array<{ resultId?: string }>)
    .map((item) => String(item.resultId || ""));
}

async function testUnreviewedEnglishOrderAuthority() {
  const unreviewedOrders = catalogs.filter(
    (item) => presentOrderCatalogItem(item, "en").translationAvailable === false
  );
  assert.equal(unreviewedOrders.length, 23);
  assert.equal(
    unreviewedOrders.filter((item) => presentOrderCatalogItem(item, "zh").translationAvailable).length,
    23
  );

  let chineseMatches = 0;
  for (const [index, item] of unreviewedOrders.entries()) {
    const configured = results.find((result) => result.orderId === item.orderId);
    const caseId = configured?.caseId || "P001";

    const english = await startStageTwo(caseId, "en", `blocked-${index}`);
    const blocked = await order(english.attemptId, caseId, "en", item.orderId, english.response);
    assert.deepEqual(ids(blocked.payload, "matchedOrders"), []);
    assert.deepEqual(ids(blocked.payload, "results"), []);
    assert.deepEqual(ids(blocked.payload, "acceptedOrderIds"), []);
    assert.equal(blocked.payload.unavailableOrderCount, 1);

    const chinese = await startStageTwo(caseId, "zh", `allowed-${index}`);
    const allowed = await order(chinese.attemptId, caseId, "zh", item.orderId, chinese.response);
    assert.deepEqual(ids(allowed.payload, "matchedOrders"), [item.orderId]);
    chineseMatches += 1;
  }

  const scoringLinks = rubrics.flatMap((rubric) =>
    (rubric.dimensions || []).flatMap((dimension) =>
      (dimension.requirements || [])
        .filter((requirement) => requirement.eventType === "order_placed"
          && unreviewedOrders.some((item) => item.orderId === requirement.key))
        .map((requirement) => ({
          caseId: rubric.caseId,
          orderId: requirement.key,
          rubricItemId: requirement.id
        }))
    )
  );
  assert.equal(new Set(scoringLinks.map((item) => item.orderId)).size, 4);
  assert.equal(scoringLinks.length, 29);

  let earned = 0;
  for (const [index, link] of scoringLinks.entries()) {
    const started = await startStageTwo(link.caseId, "en", `score-${index}`);
    let response = await order(started.attemptId, link.caseId, "en", link.orderId, started.response);
    for (const stageKey of ["orders", "diagnosis", "consult", "treatment", "perioperative", "debrief"]) {
      response = await call({
        action: "stage-feedback",
        caseId: link.caseId,
        attemptId: started.attemptId,
        mode: "free",
        language: "en",
        stageKey,
        submission: {}
      }, response.token);
      assert.equal(response.statusCode, 200);
    }
    const scored = await call({
      action: "score",
      caseId: link.caseId,
      attemptId: started.attemptId,
      mode: "free",
      language: "en"
    }, response.token);
    assert.equal(scored.statusCode, 200);
    const item = ((scored.payload.items || []) as Array<{ rubricItems?: Array<{ rubricItemId: string; status: string }> }>)
      .flatMap((dimension) => dimension.rubricItems || [])
      .find((candidate) => candidate.rubricItemId === link.rubricItemId);
    if (item?.status === "earned") earned += 1;
  }
  assert.equal(earned, 0);
  return { blockedEnglishOrders: unreviewedOrders.length, chineseMatches, scoringLinks: scoringLinks.length };
}

async function testPrerequisiteRecovery() {
  const eligibleInEnglish = (item: { orderId: string; prerequisites?: string[] }) =>
    presentOrderCatalogItem(
      catalogs.find((orderItem) => orderItem.orderId === item.orderId) || {},
      "en"
    ).translationAvailable
    && (item.prerequisites || []).every((prerequisiteId) =>
      presentOrderCatalogItem(
        catalogs.find((orderItem) => orderItem.orderId === prerequisiteId) || {},
        "en"
      ).translationAvailable);

  const rows = results.filter((item) => (item.prerequisites || []).length === 1);
  const scenarios = [
    ...rows.map((item) => ({ item, language: "zh" as const })),
    ...rows.filter(eligibleInEnglish).map((item) => ({ item, language: "en" as const }))
  ];
  assert.equal(scenarios.length, 58);

  for (const [index, { item, language }] of scenarios.entries()) {
    const prerequisiteId = item.prerequisites?.[0] || "";
    const recovery = await startStageTwo(item.caseId, language, `recovery-${index}`);
    let response = await order(
      recovery.attemptId,
      item.caseId,
      language,
      item.orderId,
      recovery.response
    );
    assert.equal(resultIds(response.payload).includes(item.resultId), false);
    assert.equal(ids(response.payload, "unmetPrerequisites").includes(prerequisiteId), true);
    assert.equal(ids(response.payload, "acceptedOrderIds").includes(item.orderId), false);

    response = await order(recovery.attemptId, item.caseId, language, prerequisiteId, response);
    response = await order(recovery.attemptId, item.caseId, language, item.orderId, response);
    assert.equal(resultIds(response.payload).includes(item.resultId), true);
    assert.equal(ids(response.payload, "duplicateOrderIds").includes(item.orderId), false);

    const control = await startStageTwo(item.caseId, language, `control-${index}`);
    let controlResponse = await order(
      control.attemptId,
      item.caseId,
      language,
      prerequisiteId,
      control.response
    );
    controlResponse = await order(
      control.attemptId,
      item.caseId,
      language,
      item.orderId,
      controlResponse
    );
    assert.equal(resultIds(controlResponse.payload).includes(item.resultId), true);
  }
  return { prerequisiteRecoveryScenarios: scenarios.length, positiveControls: scenarios.length };
}

async function main() {
  resetMemoryAttemptStore();
  const authority = await testUnreviewedEnglishOrderAuthority();
  const recovery = await testPrerequisiteRecovery();
  console.log("Data Agent authority gates passed.", { ...authority, ...recovery });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : "data_agent_authority_test_failed");
  process.exitCode = 1;
});
