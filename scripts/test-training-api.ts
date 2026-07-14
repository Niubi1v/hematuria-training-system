import assert from "node:assert/strict";

process.env.TRAINING_STATE_SECRET = "unit-test-training-state-secret-with-adequate-length";
const handler = require("../api/training-action.js");
const { initSession } = require("../server/patientSession.js");
const { verifyAttemptState } = require("../server/trainingState.js");
const { digest, loadAttempt, resetMemoryAttemptStore } = require("../server/trainingAttemptStore.js");
const serverCases = require("../data/cases.json") as Array<{
  id: string;
  medicalReview?: { status?: string; [key: string]: unknown };
  medicalReviewImport?: { formalUseAllowed?: boolean; [key: string]: unknown };
}>;

let requestCounter = 0;

async function call(body: Record<string, unknown>, token = "", requestHeaders: Record<string, string> = {}) {
  let statusCode = 200;
  let payload: unknown;
  const headers: Record<string, string> = {};
  const requestBody = body.action && !body.requestId ? { ...body, requestId: `training-api-test-${++requestCounter}` } : body;
  const req = { method: "POST", body: requestBody, headers: { ...(token ? { "x-training-state": token } : {}), ...requestHeaders }, socket: { remoteAddress: `test-${Math.random()}` } };
  const res = {
    setHeader(name: string, value: string) { headers[name.toLowerCase()] = value; },
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { payload = value; return this; },
    end() { return this; }
  };
  await handler(req, res);
  return { statusCode, payload: payload as Record<string, unknown>, token: headers["x-training-state"] || token, headers };
}

async function submitStage(response: Awaited<ReturnType<typeof call>>, attemptId: string, stageKey: string) {
  return call({ action: "stage-feedback", caseId: "P008", attemptId, mode: "free", language: "zh", stageKey, submission: {} }, response.token);
}

async function main() {
  resetMemoryAttemptStore();
  const sameOrigin = await call({}, "", { origin: "https://goal-preview.example", host: "goal-preview.example", "x-forwarded-proto": "https" });
  assert.notEqual(sameOrigin.statusCode, 403, "training API must accept an exact same-origin Preview hostname");
  const crossOrigin = await call({}, "", { origin: "https://evil.example", host: "goal-preview.example", "x-forwarded-proto": "https" });
  assert.equal(crossOrigin.statusCode, 403, "training API must reject a mismatched Origin and host");

  const attemptId = `api-test-${Date.now()}`;
  let response = await call({ action: "init-attempt", caseId: "P008", attemptId, mode: "free", language: "zh" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.practiceOnly, true);
  assert.ok(response.token, "practice attempt must receive a signed state token");

  const conflictAttemptId = `conflict-api-test-${Date.now()}`;
  const conflictInit = await call({ action: "init-attempt", caseId: "P001", attemptId: conflictAttemptId, mode: "free", language: "en" });
  const conflictHistory = await call({ action: "history-log", caseId: "P001", attemptId: conflictAttemptId, mode: "free", language: "en", question: "Do you have urinary urgency?", requestId: "conflict-history-test" }, conflictInit.token);
  assert.equal(conflictHistory.payload.reason, "medical_bilingual_conflict_pending_review");
  assert.deepEqual(conflictHistory.payload.quarantinedSlotIds, ["urinary_urgency"]);
  verifyAttemptState(conflictHistory.token, { caseId: "P001", attemptId: conflictAttemptId });
  const conflictStored = await loadAttempt({
    caseId: "P001", attemptId: conflictAttemptId, token: conflictHistory.token,
    requestId: "inspect-conflict-state", requestDigest: digest("inspect-conflict-state")
  });
  assert.equal(conflictStored.state.events.some((event: { slotId?: string }) => event.slotId === "urinary_urgency"), false, "quarantined bilingual facts must not enter authoritative scoring state");
  const conflictSubmission = await call({
    action: "stage-feedback", caseId: "P001", attemptId: conflictAttemptId, mode: "free", language: "en",
    stageKey: "history", submission: { askedQuestions: ["Do you have urinary urgency?"] }, requestId: "conflict-history-submit-test"
  }, conflictHistory.token);
  assert.equal(conflictSubmission.statusCode, 200);
  assert.equal((conflictSubmission.payload.hits as string[]).some((item) => /urgency|尿急/i.test(item)), false, "stage submission recovery must not score quarantined bilingual facts");

  const recoveryAttemptId = `history-recovery-${Date.now()}`;
  const recoveryInit = await call({ action: "init-attempt", caseId: "P001", attemptId: recoveryAttemptId, mode: "free", language: "zh" });
  const recoveredHistory = await call({
    action: "stage-feedback", caseId: "P001", attemptId: recoveryAttemptId, mode: "free", language: "zh",
    stageKey: "history", submission: { askedQuestions: ["您吸烟吗？"] }, requestId: "history-recovery-submit-test"
  }, recoveryInit.token);
  assert.equal(recoveredHistory.statusCode, 200);
  assert.ok(Number(recoveredHistory.payload.score) > 0, "server-validated submitted questions must restore history evidence after a lost attempt record");
  assert.match((recoveredHistory.payload.hits as string[]).join(" "), /吸烟/);

  for (const language of ["zh", "en"] as const) {
    const bilingualAttemptId = `p001-seven-stage-${language}-${Date.now()}`;
    let bilingual = await call({
      action: "init-attempt", caseId: "P001", attemptId: bilingualAttemptId,
      mode: "free", language, requestId: `${bilingualAttemptId}-init`
    });
    assert.equal(bilingual.statusCode, 200, `P001 ${language} attempt must initialize`);
    for (const [index, stageKey] of ["history", "orders", "diagnosis", "consult", "treatment", "perioperative", "debrief"].entries()) {
      bilingual = await call({
        action: "stage-feedback", caseId: "P001", attemptId: bilingualAttemptId,
        mode: "free", language, stageKey, submission: {}, requestId: `${bilingualAttemptId}-stage-${index + 1}`
      }, bilingual.token);
      assert.equal(bilingual.statusCode, 200, `P001 ${language} stage ${index + 1} must submit`);
    }
    const completedStages = verifyAttemptState(bilingual.token, { caseId: "P001", attemptId: bilingualAttemptId });
    assert.equal(completedStages.currentStage, 8, `P001 ${language} must advance to scoring after seven stages`);
    const bilingualScore = await call({
      action: "score", caseId: "P001", attemptId: bilingualAttemptId,
      mode: "free", language, requestId: `${bilingualAttemptId}-score`
    }, bilingual.token);
    assert.equal(bilingualScore.statusCode, 200, `P001 ${language} score must complete`);
    assert.equal(bilingualScore.payload.max, 360);
  }

  const originalToken = response.token;
  const historyBody = { action: "history-log", caseId: "P008", attemptId, mode: "free", language: "zh", question: "idempotent history question", requestId: "history-idempotency-test" };
  const firstHistory = await call(historyBody, originalToken);
  const repeatedHistory = await call(historyBody, originalToken);
  assert.equal(firstHistory.statusCode, 200);
  assert.equal(repeatedHistory.statusCode, 200);
  assert.match(firstHistory.headers["server-timing"], /^history;dur=\d+\.\d$/);
  assert.match(firstHistory.headers["access-control-expose-headers"], /Server-Timing/);
  assert.equal(firstHistory.token, repeatedHistory.token, "repeating one history requestId from the same state must be idempotent");
  response = firstHistory;
  response = await submitStage(response, attemptId, "history");

  response = await call({ action: "order", caseId: "P008", attemptId, input: "血常规", language: "zh" }, response.token);
  assert.deepEqual((response.payload.matchedOrders as Array<{ orderId: string }>).map((item) => item.orderId), ["LAB-BL-001"]);
  assert.equal((response.payload.results as Array<{ orderId: string }>).every((item) => item.orderId === "LAB-BL-001"), true);

  response = await call({ action: "order", caseId: "P008", attemptId, input: "血常规", previousOrderIds: [], language: "zh" }, response.token);
  assert.deepEqual(response.payload.duplicateOrderIds, ["LAB-BL-001"]);
  assert.equal((response.payload.results as unknown[]).length, 0);

  response = await call({ action: "order", caseId: "P008", attemptId, input: "肾功能/eGFR", language: "zh" }, response.token);
  assert.equal((response.payload.results as Array<{ orderId: string }>).every((item) => item.orderId === "LAB-BL-003"), true);
  response = await call({ action: "order", caseId: "P008", attemptId, input: "CTU评估上尿路", previousOrderIds: ["FORGED-ORDER"], language: "zh" }, response.token);
  assert.equal((response.payload.results as Array<{ orderId: string }>).every((item) => item.orderId === "IMG-CT-002"), true);
  response = await call({ action: "order", caseId: "P008", attemptId, input: "TURBT病理", language: "zh" }, response.token);
  assert.doesNotMatch(JSON.stringify(response.payload), /乳果糖|肠道准备|前列腺体积/);

  for (const stageKey of ["orders", "diagnosis", "consult", "treatment", "perioperative", "debrief"]) {
    response = await submitStage(response, attemptId, stageKey);
  }

  const forged = await call({ action: "score", caseId: "P008", attemptId, mode: "free", events: [{ type: "diagnosis_supported", actionId: "primary", metadata: { validated: true } }] }, response.token);
  assert.ok(Number(forged.payload.total) < 360, "forged client events must not create a perfect score");
  assert.equal(forged.payload.scoringVersion, "360-event-v1", "score reports must use the repository-wide public scoring identifier");
  assert.equal(forged.payload.reportVersion, 3, "reportVersion tracks implementation evolution independently of scoringVersion");
  assert.match(forged.headers["server-timing"], /^score;dur=\d+\.\d$/);

  const changedMode = await call({ action: "score", caseId: "P008", attemptId, mode: "osce" }, response.token);
  assert.equal(changedMode.statusCode, 409, "client must not change a practice attempt into formal mode");

  const formal = await call({ action: "init-attempt", caseId: "P008", attemptId: "formal-test", mode: "osce", language: "zh" });
  assert.equal(formal.statusCode, 403);

  process.env.TRAINING_DEPLOYMENT_TIER = "formal";
  for (const caseData of serverCases) {
    const blocked = await call({ action: "init-attempt", caseId: caseData.id, attemptId: `formal-current-${caseData.id}`, mode: "osce", language: "zh" });
    assert.equal(blocked.statusCode, 403, `current case ${caseData.id} must remain blocked from formal attempts`);
    assert.equal(blocked.token, "", `blocked formal case ${caseData.id} must not receive a signed state token`);
  }

  const formalCase = serverCases.find((item) => item.id === "P008")!;
  const originalReview = formalCase.medicalReview;
  const originalReviewImport = formalCase.medicalReviewImport;
  formalCase.medicalReview = { ...(formalCase.medicalReview || {}), status: "approved" };

  const statusOnly = await call({ action: "init-attempt", caseId: "P008", attemptId: "formal-status-only-test", mode: "osce", language: "zh" });
  assert.equal(statusOnly.statusCode, 403, "reviewed/approved status alone must not bypass explicit formal-use governance");

  formalCase.medicalReviewImport = { ...(formalCase.medicalReviewImport || {}), formalUseAllowed: true };
  const dedicatedSecret = process.env.TRAINING_STATE_SECRET;
  process.env.LLM_API_KEY = "legacy-practice-signing-fallback-only";
  delete process.env.TRAINING_STATE_SECRET;
  const missingFormalSecret = await call({ action: "init-attempt", caseId: "P008", attemptId: "formal-missing-secret-test", mode: "osce", language: "zh" });
  assert.equal(missingFormalSecret.statusCode, 503, "formal tier must not sign state with the LLM_API_KEY fallback");
  assert.equal(missingFormalSecret.payload.error, "training_state_secret_missing");
  process.env.TRAINING_STATE_SECRET = dedicatedSecret;

  let approvedFormal = await call({ action: "init-attempt", caseId: "P008", attemptId: "formal-approved-test", mode: "osce", language: "zh" });
  assert.equal(approvedFormal.statusCode, 200);
  approvedFormal = await call({ action: "stage-feedback", caseId: "P008", attemptId: "formal-approved-test", mode: "osce", stageKey: "history", submission: {} }, approvedFormal.token);
  approvedFormal = await call({ action: "stage-feedback", caseId: "P008", attemptId: "formal-approved-test", mode: "osce", stageKey: "orders", submission: {} }, approvedFormal.token);
  approvedFormal = await call({ action: "stage-feedback", caseId: "P008", attemptId: "formal-approved-test", mode: "osce", stageKey: "diagnosis", submission: {
    diagnosis: "膀胱结石，前列腺增生", diagnosticEvidence: "终末血尿、排尿中断且改变体位后恢复", differentials: "前列腺癌；膀胱颈挛缩；尿道狭窄", confirmatoryTests: "尿常规、盆腔CT和膀胱镜"
  } }, approvedFormal.token);
  assert.equal(approvedFormal.payload.standardAnswer, "", "formal attempt must not release the standard answer before completion");
  const formalDowngrade = await call({ action: "score", caseId: "P008", attemptId: "formal-approved-test", mode: "free" }, approvedFormal.token);
  assert.equal(formalDowngrade.statusCode, 409, "formal mode cannot be bypassed by changing client mode to free");
  formalCase.medicalReview = originalReview;
  formalCase.medicalReviewImport = originalReviewImport;
  process.env.TRAINING_DEPLOYMENT_TIER = "practice";

  const practiceSecret = process.env.TRAINING_STATE_SECRET;
  delete process.env.TRAINING_STATE_SECRET;
  const legacyPractice = await call({ action: "init-attempt", caseId: "P008", attemptId: "practice-legacy-secret-test", mode: "free", language: "zh" });
  assert.equal(legacyPractice.statusCode, 503, "practice tier must fail closed instead of reusing LLM_API_KEY");
  assert.equal(legacyPractice.payload.error, "training_state_secret_missing");
  assert.equal(legacyPractice.token, "");
  process.env.TRAINING_STATE_SECRET = practiceSecret;

  const revisionId = `revision-${Date.now()}`;
  let revision = await call({ action: "init-attempt", caseId: "P001", attemptId: revisionId, mode: "free", language: "zh" });
  revision = await call({ action: "stage-feedback", caseId: "P001", attemptId: revisionId, mode: "free", language: "zh", stageKey: "history", submission: {} }, revision.token);
  revision = await call({ action: "stage-feedback", caseId: "P001", attemptId: revisionId, mode: "free", language: "zh", stageKey: "orders", submission: {} }, revision.token);
  revision = await call({ action: "stage-feedback", caseId: "P001", attemptId: revisionId, stageKey: "diagnosis", submission: {
    diagnosis: "急性阑尾炎", diagnosticEvidence: "右下腹痛", differentials: "胃炎；胆囊炎；胰腺炎", confirmatoryTests: "腹部平片"
  } }, revision.token);
  assert.equal(revision.payload.score, 0);
  assert.equal(revision.payload.practiceOnly, true);
  assert.ok(String(revision.payload.standardAnswer).includes("膀胱"), "practice feedback may release an explicitly practice-only standard answer");
  revision = await call({ action: "stage-feedback", caseId: "P001", attemptId: revisionId, stageKey: "diagnosis", submission: {
    diagnosis: "膀胱恶性肿瘤", diagnosticEvidence: "反复无痛性全程肉眼血尿伴血块，符合膀胱肿瘤警示特征",
    differentials: "尿路感染；膀胱结石；上尿路尿路上皮癌", confirmatoryTests: "尿常规、CTU、膀胱镜并TURBT病理"
  } }, revision.token);
  assert.ok(Number(revision.payload.score) > 0, "a corrected resubmission should receive improved formative feedback");

  process.env.LLM_ENABLE_AI_AGENTS = "false";
  process.env.LLM_ENABLE_AI_PATIENT = "false";
  const session = await initSession({ caseId: "P008", mode: "training", language: "zh" });
  assert.equal("completedPatientFacingProfile" in session, false);
  assert.equal("teacherOnlyData" in session, false);
  assert.equal(typeof session.sessionId, "string");

  console.log("Training API signed state, exact release, anti-forgery, formal governance, independent-secret, and mode-lock gates passed.");
}

void main();
