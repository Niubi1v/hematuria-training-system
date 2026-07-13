import assert from "node:assert/strict";

process.env.TRAINING_STATE_SECRET = "unit-test-training-state-secret-with-adequate-length";
process.env.TRAINING_DEPLOYMENT_TIER = "practice";

const handler = require("../api/training-action.js");
const { createAttemptState, signAttemptState, verifyAttemptState } = require("../server/trainingState.js");
const { resetMemoryAttemptStore, validateCurrentAttempt } = require("../server/trainingAttemptStore.js");
const orderCatalog = [
  ...require("../data/order_catalog_labs.json"),
  ...require("../data/order_catalog_imaging.json"),
  ...require("../data/order_catalog_procedures.json"),
  ...require("../data/order_catalog_perioperative.json")
];

type CallResult = {
  statusCode: number;
  payload: Record<string, unknown>;
  token: string;
};

let requestCounter = 0;

async function call(body: Record<string, unknown>, token = ""): Promise<CallResult> {
  let statusCode = 200;
  let payload: unknown = {};
  const headers: Record<string, string> = {};
  const requestBody = body.action && !body.requestId ? { ...body, requestId: `training-security-test-${++requestCounter}` } : body;
  const req = {
    method: "POST",
    body: requestBody,
    headers: token ? { "x-training-state": token } : {},
    socket: { remoteAddress: `training-security-${Math.random()}` }
  };
  const res = {
    setHeader(name: string, value: string) { headers[name.toLowerCase()] = String(value); },
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { payload = value; return this; },
    end() { return this; }
  };
  await handler(req, res);
  return { statusCode, payload: payload as Record<string, unknown>, token: headers["x-training-state"] || token };
}

async function init(attemptId: string, caseId = "P008") {
  return call({ action: "init-attempt", caseId, attemptId, mode: "free", language: "zh", requestId: `init-${attemptId}` });
}

async function main() {
  resetMemoryAttemptStore();
  const dedicated = process.env.TRAINING_STATE_SECRET;
  process.env.LLM_API_KEY = "provider-key-must-never-sign-training-state";
  delete process.env.TRAINING_STATE_SECRET;
  const practiceWithoutDedicatedSecret = await init("security-secret-separation");
  assert.equal(practiceWithoutDedicatedSecret.statusCode, 503, "practice must fail closed without TRAINING_STATE_SECRET");
  assert.equal(practiceWithoutDedicatedSecret.payload.error, "training_state_secret_missing");
  process.env.TRAINING_STATE_SECRET = dedicated;

  const weakSecret = process.env.TRAINING_STATE_SECRET;
  process.env.TRAINING_STATE_SECRET = "too-short";
  const weak = await init("security-weak-secret");
  assert.equal(weak.statusCode, 503, "weak training secrets must be rejected");
  process.env.TRAINING_STATE_SECRET = weakSecret;

  process.env.LLM_API_KEY = process.env.TRAINING_STATE_SECRET;
  const coupled = await init("security-coupled-secret");
  assert.equal(coupled.statusCode, 503, "provider and training secrets must not be identical");
  process.env.LLM_API_KEY = "separate-provider-key";

  const originalVercel = process.env.VERCEL;
  const originalStoreMode = process.env.TRAINING_ATTEMPT_STORE_MODE;
  const originalStoreUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalStoreToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.VERCEL = "1";
  delete process.env.TRAINING_ATTEMPT_STORE_MODE;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  const serverlessWithoutStore = await init("security-missing-durable-store");
  assert.equal(serverlessWithoutStore.statusCode, 503, "serverless attempts must fail closed without shared atomic storage");
  assert.equal(serverlessWithoutStore.payload.error, "training_attempt_store_unavailable");
  if (originalVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = originalVercel;
  if (originalStoreMode === undefined) delete process.env.TRAINING_ATTEMPT_STORE_MODE; else process.env.TRAINING_ATTEMPT_STORE_MODE = originalStoreMode;
  if (originalStoreUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL; else process.env.UPSTASH_REDIS_REST_URL = originalStoreUrl;
  if (originalStoreToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN; else process.env.UPSTASH_REDIS_REST_TOKEN = originalStoreToken;

  const stageAttempt = await init("security-stage-gate");
  assert.equal(stageAttempt.statusCode, 200);
  const initialState = verifyAttemptState(stageAttempt.token, { caseId: "P008", attemptId: "security-stage-gate" });
  assert.equal(initialState.version, 3);
  assert.equal(initialState.currentStage, 1);
  assert.ok(initialState.nonce && initialState.issuedAt, "signed state must include versioned anti-replay claims");
  const oversized = await call({
    action: "history-log", caseId: "P008", attemptId: "security-stage-gate", mode: "free",
    language: "zh", question: "x".repeat(100 * 1024), requestId: "oversized-training-body"
  }, stageAttempt.token);
  assert.equal(oversized.statusCode, 413, "oversized training actions must be rejected before state mutation");
  assert.equal(oversized.payload.error, "request_body_too_large");
  for (const order of orderCatalog) {
    const blocked = await call({
      action: "order", caseId: "P008", attemptId: "security-stage-gate", mode: "free",
      language: "zh", input: order.orderId, requestId: `early-catalog-${order.orderId}`
    }, stageAttempt.token);
    assert.equal(blocked.statusCode, 409, `stage 1 must block ${order.orderId}`);
    assert.deepEqual(blocked.payload, { error: "stage_not_unlocked" });
  }
  const earlyExam = await call({ action: "exam", caseId: "P008", attemptId: "security-stage-gate", mode: "free", language: "zh", input: "体温", requestId: "early-exam" }, stageAttempt.token);
  assert.equal(earlyExam.statusCode, 409);
  const earlyMdt = await call({ action: "mdt", caseId: "P008", attemptId: "security-stage-gate", mode: "free", language: "zh", departments: ["泌尿外科"], purpose: "会诊", requestId: "early-mdt" }, stageAttempt.token);
  assert.equal(earlyMdt.statusCode, 409);
  const earlyDiagnosis = await call({ action: "stage-feedback", caseId: "P008", attemptId: "security-stage-gate", mode: "free", language: "zh", stageKey: "diagnosis", submission: {}, requestId: "early-diagnosis" }, stageAttempt.token);
  assert.equal(earlyDiagnosis.statusCode, 409);
  const invalidStage = await call({ action: "stage-feedback", caseId: "P008", attemptId: "security-stage-gate", mode: "free", language: "zh", stageKey: "invalid", submission: {}, requestId: "invalid-stage" }, stageAttempt.token);
  assert.equal(invalidStage.statusCode, 400);
  assert.deepEqual(invalidStage.payload, { error: "invalid_stage" });
  const earlyOrder = await call({
    action: "order", caseId: "P008", attemptId: "security-stage-gate", mode: "free",
    language: "zh", input: "血常规", requestId: "early-order"
  }, stageAttempt.token);
  assert.equal(earlyOrder.statusCode, 409, "stage 1 must not release investigation results");
  assert.equal(earlyOrder.payload.error, "stage_not_unlocked");
  assert.doesNotMatch(JSON.stringify(earlyOrder.payload), /LAB-BL-001|血红蛋白|resultId/i);

  const earlyPathology = await call({
    action: "order", caseId: "P008", attemptId: "security-stage-gate", mode: "free",
    language: "zh", input: "TURBT病理", requestId: "early-pathology"
  }, stageAttempt.token);
  assert.equal(earlyPathology.statusCode, 409, "stage 1 must not release pathology");
  assert.doesNotMatch(JSON.stringify(earlyPathology.payload), /病理|pathology|resultId/i);

  const stageTwo = await call({
    action: "stage-feedback", caseId: "P008", attemptId: "security-stage-gate", mode: "free",
    language: "zh", stageKey: "history", submission: {}, requestId: "finish-history"
  }, stageAttempt.token);
  assert.equal(stageTwo.statusCode, 200);
  const legalOrderAfterRefresh = await call({
    action: "order", caseId: "P008", attemptId: "security-stage-gate", mode: "free",
    language: "zh", input: "血常规", requestId: "legal-stage-two-order"
  }, stageTwo.token);
  assert.equal(legalOrderAfterRefresh.statusCode, 200, "a restored signed stage-2 token must retain legitimate access");
  const resumedInit = await init("security-stage-gate");
  assert.equal(resumedInit.statusCode, 200, "an exact init retry may replay only its original response");
  assert.equal(resumedInit.token, stageAttempt.token, "an unauthenticated init replay must never disclose a later bearer token");
  const replayedInitialBearer = await call({
    action: "history-log", caseId: "P008", attemptId: "security-stage-gate", mode: "free",
    language: "zh", question: "疼不疼？", requestId: "replayed-initial-bearer"
  }, resumedInit.token);
  assert.equal(replayedInitialBearer.statusCode, 409, "the original init token must remain stale after the attempt advances");
  assert.equal(replayedInitialBearer.payload.error, "stale_attempt_token");

  let lateStage = await call({
    action: "stage-feedback", caseId: "P008", attemptId: "security-stage-gate", mode: "free",
    language: "zh", stageKey: "orders", submission: {}, requestId: "finish-orders-for-late-backfill"
  }, legalOrderAfterRefresh.token);
  for (const [stageKey, requestId] of [["diagnosis", "finish-diagnosis-for-late-backfill"], ["consult", "finish-consult-for-late-backfill"]] as const) {
    lateStage = await call({
      action: "stage-feedback", caseId: "P008", attemptId: "security-stage-gate", mode: "free",
      language: "zh", stageKey, submission: {}, requestId
    }, lateStage.token);
    assert.equal(lateStage.statusCode, 200);
  }
  const beforeLateBackfill = await validateCurrentAttempt({ caseId: "P008", attemptId: "security-stage-gate", token: lateStage.token });
  assert.equal(beforeLateBackfill.currentStage, 5);
  const lateBackfills = [
    { action: "history-log", question: "疼不疼？", requestId: "late-history-backfill" },
    { action: "order", input: "血常规", requestId: "late-order-backfill" },
    { action: "mdt", departments: ["泌尿外科"], purpose: "复核治疗计划", requestId: "late-mdt-backfill" }
  ];
  for (const backfill of lateBackfills) {
    const blocked = await call({
      ...backfill, caseId: "P008", attemptId: "security-stage-gate", mode: "free", language: "zh"
    }, lateStage.token);
    assert.equal(blocked.statusCode, 409, `${backfill.action} must not backfill validated evidence after its stage closes`);
    assert.deepEqual(blocked.payload, { error: "stage_not_unlocked" });
  }
  const afterLateBackfill = await validateCurrentAttempt({ caseId: "P008", attemptId: "security-stage-gate", token: lateStage.token });
  assert.deepEqual(afterLateBackfill, beforeLateBackfill, "rejected late evidence must not mutate authoritative state");

  let resubmission = await init("security-resubmission");
  for (const [index, stageKey] of ["history", "orders", "diagnosis"].entries()) {
    resubmission = await call({ action: "stage-feedback", caseId: "P008", attemptId: "security-resubmission", mode: "free", language: "zh", stageKey, submission: {}, requestId: `resubmit-forward-${index}` }, resubmission.token);
  }
  resubmission = await call({ action: "stage-feedback", caseId: "P008", attemptId: "security-resubmission", mode: "free", language: "zh", stageKey: "history", submission: {}, requestId: "resubmit-history" }, resubmission.token);
  const resubmittedState = await validateCurrentAttempt({ caseId: "P008", attemptId: "security-resubmission", token: resubmission.token });
  assert.equal(resubmittedState.currentStage, 2, "resubmitting history must return the attempt to stage 2");
  assert.deepEqual(Object.keys(resubmittedState.submissions), ["history"], "resubmitting a stage must invalidate all later submissions");

  const englishAttempt = await call({ action: "init-attempt", caseId: "P001", attemptId: "security-stage-en", mode: "free", language: "en" });
  const crossLanguageAction = await call({
    action: "history-log", caseId: "P001", attemptId: "security-stage-en", mode: "free",
    language: "zh", question: "Do you smoke?", requestId: "cross-language-action"
  }, englishAttempt.token);
  assert.equal(crossLanguageAction.statusCode, 409, "a request language must match the authoritative attempt language");
  assert.deepEqual(crossLanguageAction.payload, { error: "attempt_language_mismatch" });
  const englishEarlyImaging = await call({
    action: "order", caseId: "P001", attemptId: "security-stage-en", mode: "free",
    language: "en", input: "CT urography", requestId: "early-imaging-en"
  }, englishAttempt.token);
  assert.equal(englishEarlyImaging.statusCode, 409, "English flow must enforce the same stage boundary");
  assert.deepEqual(englishEarlyImaging.payload, { error: "stage_not_unlocked" });

  let replayAttempt = await init("security-replay");
  for (const [index, stageKey] of ["history", "orders", "diagnosis", "consult", "treatment", "perioperative", "debrief"].entries()) {
    replayAttempt = await call({
      action: "stage-feedback", caseId: "P008", attemptId: "security-replay", mode: "free",
      language: "zh", stageKey, submission: {}, requestId: `replay-stage-${index + 1}`
    }, replayAttempt.token);
    assert.equal(replayAttempt.statusCode, 200, `stage ${index + 1} must complete before replay test`);
  }
  const eligibleToken = replayAttempt.token;
  const scoreBody = {
    action: "score", caseId: "P008", attemptId: "security-replay", mode: "free",
    language: "zh", requestId: "score-once"
  };
  const [firstScore, repeatedScore] = await Promise.all([
    call(scoreBody, eligibleToken),
    call(scoreBody, eligibleToken)
  ]);
  assert.equal(firstScore.statusCode, 200, "the first eligible score request must succeed");
  assert.equal(repeatedScore.statusCode, 200, "an identical retry must return the stored score response");
  assert.equal(firstScore.token, repeatedScore.token, "concurrent identical requests must converge on one terminal token");
  assert.deepEqual(firstScore.payload, repeatedScore.payload, "concurrent identical requests must return one cached report");

  const replayedScore = await call({ ...scoreBody, requestId: "score-replay-different-key" }, eligibleToken);
  assert.equal(replayedScore.statusCode, 409, "a consumed eligible token must be rejected on replay");
  assert.equal(replayedScore.payload.error, "stale_attempt_token");

  const conflictingReuse = await call({ ...scoreBody, language: "en" }, eligibleToken);
  assert.equal(conflictingReuse.statusCode, 409, "one idempotency key cannot be reused with a different payload");
  assert.equal(conflictingReuse.payload.error, "idempotency_key_reused");

  const expiredState = createAttemptState({ attemptId: "expired", caseId: "P008", mode: "public-practice", language: "zh" });
  expiredState.expiresAt = Date.now() - 1;
  assert.throws(() => verifyAttemptState(signAttemptState(expiredState)), /expired_attempt_token/);

  console.log("Training secret separation, server-authoritative stage authorization, atomic replay rejection, and expiry gates passed.");
}

void main();
