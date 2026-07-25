import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

process.env.TRAINING_STATE_SECRET = "qa-only-stage-return-secret-with-adequate-length";
process.env.TRAINING_ATTEMPT_STORE_MODE = "memory";
process.env.TRAINING_API_RATE_LIMIT_PER_MINUTE = "10000";

const require = createRequire(import.meta.url);
const handler = require("../../api/training-action.js");
const { resetMemoryAttemptStore } = require("../../server/trainingAttemptStore.js");
const cases = require("../../data/cases.json");
const publicCases = require("../../data/cases_public.json");

const outputArgIndex = process.argv.indexOf("--output");
const outputPath = outputArgIndex >= 0 ? process.argv[outputArgIndex + 1] : "";
const STAGES = ["history", "orders", "diagnosis", "consult", "treatment", "perioperative", "debrief"];
const RETURN_STAGES = ["diagnosis", "consult", "treatment", "perioperative"];
const STAGE_NUMBER = Object.fromEntries(STAGES.map((stage, index) => [stage, index + 1]));
const FEEDBACK_KEYS = ["comment", "hits", "max", "misses", "practiceOnly", "score", "stageKey", "standardAnswer", "warnings"];
const VALIDATE_KEYS = ["attemptId", "caseId", "currentStage", "language", "mode", "status"];
const SCORE_KEYS = ["calculation", "caseVersion", "generatedAt", "items", "max", "ragGuardrails", "redFlags", "reportVersion", "scoringVersion", "total"];
const SCORE_ITEM_KEYS = ["comment", "criticalErrors", "evidence", "improvements", "label", "max", "misses", "overuse", "rubricItems", "score", "sequenceIssues"];
const RUBRIC_ITEM_KEYS = ["eventId", "evidenceText", "max", "rubricItemId", "score", "status", "timestamp"];
let requestCounter = 0;

function keys(value) {
  return Object.keys(value || {}).sort();
}

function assertExactKeys(value, expected, label) {
  assert.deepEqual(keys(value), [...expected].sort(), `${label} exposed an unexpected response field`);
}

function assertAllowedKeys(value, allowed, required, label) {
  const actual = keys(value);
  assert.equal(actual.every((key) => allowed.includes(key)), true, `${label} exposed an unexpected response field`);
  assert.equal(required.every((key) => actual.includes(key)), true, `${label} omitted a required response field`);
}

function buildSubmissions(caseData) {
  const clinical = caseData.clinical || {};
  const differentials = [
    ...(caseData.differentialDiagnosis || []),
    ...String(clinical.mustDifferentials || "").split(/[；;、,，\n]/)
  ].filter(Boolean).slice(0, 3);
  return {
    history: {},
    orders: {},
    diagnosis: {
      diagnosis: String(caseData.diagnosis || ""),
      diagnosticEvidence: `${clinical.keyHistory || ""} ${clinical.diagnosticReasoning || ""}`,
      differentials: differentials.join("；"),
      differentialAnalysis: "QA matrix only",
      confirmatoryTests: `${clinical.requiredLabs || ""} ${clinical.imagingAndProcedures || ""}`
    },
    consult: {
      consultNeeded: "QA matrix only",
      consultDepartments: [],
      consultPurpose: "QA matrix only",
      consultQuestions: "QA matrix only",
      consultSummary: "QA matrix only"
    },
    treatment: {
      immediateTreatment: String(clinical.immediateTreatment || ""),
      admissionTreatment: `${clinical.immediateTreatment || ""} ${clinical.definitiveTreatment || ""}`,
      definitiveTreatment: String(clinical.definitiveTreatment || ""),
      followUp: String(clinical.followUp || ""),
      patientEducation: String(caseData.teachingPoints?.join(" ") || clinical.followUp || "")
    },
    perioperative: {
      perioperativePreparation: String(caseData.perioperativePlan || clinical.perioperative || clinical.consultQuestions || "")
    },
    debrief: {
      debriefReflection: "QA-only reflection text long enough to validate deterministic final-stage governance without medical claims."
    }
  };
}

async function call(body, token = "", clientScope = "stage-return") {
  let statusCode = 200;
  let payload = {};
  const responseHeaders = {};
  const requestId = String(body.requestId || `qa-stage-return-${++requestCounter}`);
  const requestBody = { ...body, requestId };
  const req = {
    method: "POST",
    body: requestBody,
    headers: {
      origin: "https://stage-return.example.test",
      host: "stage-return.example.test",
      "x-forwarded-proto": "https",
      "x-idempotency-key": requestId,
      ...(token ? { "x-training-state": token } : {})
    },
    socket: { remoteAddress: clientScope }
  };
  const res = {
    setHeader(name, value) { responseHeaders[String(name).toLowerCase()] = String(value); },
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; },
    end() { return this; }
  };
  await handler(req, res);
  return {
    statusCode,
    payload,
    token: responseHeaders["x-training-state"] || token,
    requestId
  };
}

async function initAttempt(caseData, language, suffix, mode = "free") {
  const attemptId = `qa-${caseData.id}-${language}-${suffix}`;
  const response = await call({
    action: "init-attempt",
    caseId: caseData.id,
    attemptId,
    mode,
    language,
    requestId: `${attemptId}-init`
  }, "", attemptId);
  return { ...response, attemptId, scope: attemptId };
}

async function validateAttempt(context, expectedStage, suffix) {
  const response = await call({
    action: "validate-attempt",
    caseId: context.caseData.id,
    attemptId: context.attemptId,
    mode: "free",
    language: context.language,
    requestId: `${context.attemptId}-validate-${suffix}`
  }, context.token, context.scope);
  assert.equal(response.statusCode, 200, `${context.caseData.id}/${context.language}/${suffix} validation failed`);
  assertExactKeys(response.payload, VALIDATE_KEYS, `${context.caseData.id}/${context.language}/${suffix} validation`);
  assert.equal(response.payload.currentStage, expectedStage);
  assert.equal(response.payload.status, "active");
  context.token = response.token;
  return response;
}

async function expectLocked(context, body, suffix, counters) {
  const response = await call({
    ...body,
    caseId: context.caseData.id,
    attemptId: context.attemptId,
    mode: "free",
    language: context.language,
    requestId: `${context.attemptId}-locked-${suffix}`
  }, context.token, context.scope);
  assert.equal(response.statusCode, 409, `${context.caseData.id}/${context.language}/${suffix} must be locked`);
  assert.deepEqual(response.payload, { error: "stage_not_unlocked" }, `${context.caseData.id}/${context.language}/${suffix} leaked data while locked`);
  assert.equal(response.token, context.token, `${context.caseData.id}/${context.language}/${suffix} changed token on rejection`);
  counters.lockedRejections += 1;
}

async function submitStage(context, stageKey, suffix, counters) {
  const response = await call({
    action: "stage-feedback",
    caseId: context.caseData.id,
    attemptId: context.attemptId,
    mode: "free",
    language: context.language,
    stageKey,
    submission: context.submissions[stageKey],
    requestId: `${context.attemptId}-${stageKey}-${suffix}`
  }, context.token, context.scope);
  assert.equal(response.statusCode, 200, `${context.caseData.id}/${context.language}/${stageKey}/${suffix} failed`);
  assertExactKeys(response.payload, FEEDBACK_KEYS, `${context.caseData.id}/${context.language}/${stageKey}/${suffix}`);
  assert.equal(response.payload.stageKey, stageKey);
  assert.equal(response.payload.practiceOnly, true);
  assert.equal(Array.isArray(response.payload.hits), true);
  assert.equal(Array.isArray(response.payload.misses), true);
  assert.equal(Array.isArray(response.payload.warnings), true);
  assert.equal(typeof response.payload.standardAnswer, "string");
  context.token = response.token;
  counters.stageFeedbacks += 1;
  if (RETURN_STAGES.includes(stageKey)) {
    counters.stageThreeToSixFeedbacks += 1;
    if (response.payload.standardAnswer) counters.postSubmitPracticeAnswers += 1;
  }
  return response;
}

function assertScoreShape(payload, label) {
  assertExactKeys(payload, SCORE_KEYS, label);
  assert.equal(payload.max, 360);
  assert.equal(payload.scoringVersion, "360-event-v1");
  assert.equal(payload.reportVersion, 3);
  assert.equal(Array.isArray(payload.items), true);
  assert.equal(payload.items.length, 8);
  for (const [index, item] of payload.items.entries()) {
    assertExactKeys(item, SCORE_ITEM_KEYS, `${label}/item-${index}`);
    assert.equal(Array.isArray(item.rubricItems), true);
    for (const [rubricIndex, rubricItem] of item.rubricItems.entries()) {
      assertAllowedKeys(
        rubricItem,
        RUBRIC_ITEM_KEYS,
        ["max", "rubricItemId", "score", "status"],
        `${label}/item-${index}/rubric-${rubricIndex}`
      );
    }
  }
}

function comparableScore(payload) {
  return {
    total: payload.total,
    max: payload.max,
    scoringVersion: payload.scoringVersion,
    reportVersion: payload.reportVersion,
    items: payload.items.map((item) => ({
      label: item.label,
      max: item.max,
      score: item.score,
      misses: item.misses,
      overuse: item.overuse,
      criticalErrors: item.criticalErrors,
      rubricItems: item.rubricItems.map((rubricItem) => ({
        rubricItemId: rubricItem.rubricItemId,
        status: rubricItem.status,
        score: rubricItem.score,
        max: rubricItem.max
      }))
    }))
  };
}

async function finishAndScore(context, suffix, counters) {
  await submitStage(context, "debrief", `${suffix}-debrief`, counters);
  const tokenBeforeScore = context.token;
  const scoreRequestId = `${context.attemptId}-${suffix}-score`;
  const scored = await call({
    action: "score",
    caseId: context.caseData.id,
    attemptId: context.attemptId,
    mode: "free",
    language: context.language,
    requestId: scoreRequestId
  }, tokenBeforeScore, context.scope);
  assert.equal(scored.statusCode, 200);
  assertScoreShape(scored.payload, `${context.caseData.id}/${context.language}/${suffix}/score`);
  counters.scoreRequests += 1;

  const duplicate = await call({
    action: "score",
    caseId: context.caseData.id,
    attemptId: context.attemptId,
    mode: "free",
    language: context.language,
    requestId: scoreRequestId
  }, tokenBeforeScore, context.scope);
  assert.equal(duplicate.statusCode, 200);
  assert.deepEqual(comparableScore(duplicate.payload), comparableScore(scored.payload));
  assert.equal(duplicate.token, scored.token);
  counters.duplicateScoreReplays += 1;

  const completedValidation = await call({
    action: "validate-attempt",
    caseId: context.caseData.id,
    attemptId: context.attemptId,
    mode: "free",
    language: context.language,
    requestId: `${context.attemptId}-${suffix}-validate-completed`
  }, scored.token, context.scope);
  assert.equal(completedValidation.statusCode, 401);
  assert.deepEqual(completedValidation.payload, { error: "attempt_already_completed" });
  counters.completedAttemptRejections += 1;
  return scored.payload;
}

async function completeControl(caseData, language, counters) {
  const initialized = await initAttempt(caseData, language, "control");
  assert.equal(initialized.statusCode, 200);
  const context = {
    caseData,
    language,
    attemptId: initialized.attemptId,
    scope: initialized.scope,
    token: initialized.token,
    submissions: buildSubmissions(caseData)
  };
  for (const stageKey of STAGES.slice(0, 6)) {
    await submitStage(context, stageKey, "control", counters);
  }
  await validateAttempt(context, 7, "control-stage-7");
  return finishAndScore(context, "control", counters);
}

async function completeReturnJourney(caseData, language, counters) {
  const initialized = await initAttempt(caseData, language, "return");
  assert.equal(initialized.statusCode, 200);
  const context = {
    caseData,
    language,
    attemptId: initialized.attemptId,
    scope: initialized.scope,
    token: initialized.token,
    submissions: buildSubmissions(caseData)
  };

  await expectLocked(context, { action: "stage-feedback", stageKey: "diagnosis", submission: context.submissions.diagnosis }, "diagnosis-before-history", counters);
  await expectLocked(context, { action: "score" }, "score-at-stage-1", counters);
  await submitStage(context, "history", "initial", counters);
  await expectLocked(context, { action: "stage-feedback", stageKey: "diagnosis", submission: context.submissions.diagnosis }, "diagnosis-before-orders", counters);
  await submitStage(context, "orders", "initial", counters);
  await expectLocked(context, { action: "mdt", departments: [], purpose: "QA matrix only" }, "mdt-before-stage-4", counters);
  await expectLocked(context, { action: "stage-feedback", stageKey: "treatment", submission: context.submissions.treatment }, "treatment-before-diagnosis", counters);
  await submitStage(context, "diagnosis", "initial", counters);
  await submitStage(context, "consult", "initial", counters);
  await expectLocked(context, { action: "mdt", departments: [], purpose: "QA matrix only" }, "mdt-after-stage-4", counters);
  await submitStage(context, "treatment", "initial", counters);
  await submitStage(context, "perioperative", "initial", counters);
  await validateAttempt(context, 7, "initial-stage-7");
  await expectLocked(context, { action: "exam", input: "QA matrix only" }, "exam-after-stage-2", counters);
  await expectLocked(context, { action: "order", input: "QA matrix only" }, "order-after-stage-2", counters);

  for (const returnStage of RETURN_STAGES) {
    const returnNumber = STAGE_NUMBER[returnStage];
    await submitStage(context, returnStage, `return-${returnStage}`, counters);
    counters.returnResubmissions += 1;
    await validateAttempt(context, returnNumber + 1, `after-return-${returnStage}`);
    if (returnNumber + 1 < 7) {
      const futureStage = STAGES[returnNumber + 1];
      await expectLocked(context, {
        action: "stage-feedback",
        stageKey: futureStage,
        submission: context.submissions[futureStage]
      }, `future-${futureStage}-after-return-${returnStage}`, counters);
    }
    for (let stageNumber = returnNumber + 1; stageNumber <= 6; stageNumber += 1) {
      const stageKey = STAGES[stageNumber - 1];
      await submitStage(context, stageKey, `rebuild-after-${returnStage}`, counters);
    }
    await validateAttempt(context, 7, `rebuilt-after-${returnStage}`);
  }
  return finishAndScore(context, "return", counters);
}

async function main() {
  assert.equal(cases.length, 42);
  assert.equal(publicCases.length, 42);
  assert.equal(cases.every((item) => item.medicalReview?.status === "needs_revision"), true);
  assert.equal(cases.every((item) => item.medicalReviewImport?.formalUseAllowed !== true), true);
  resetMemoryAttemptStore();

  const counters = {
    formalUseRejections: 0,
    lockedRejections: 0,
    stageFeedbacks: 0,
    stageThreeToSixFeedbacks: 0,
    postSubmitPracticeAnswers: 0,
    returnResubmissions: 0,
    scoreRequests: 0,
    duplicateScoreReplays: 0,
    completedAttemptRejections: 0,
    scoreDriftFailures: 0
  };

  process.env.TRAINING_DEPLOYMENT_TIER = "formal";
  for (const caseData of cases) {
    for (const language of ["zh", "en"]) {
      const formal = await initAttempt(caseData, language, "formal-block", "osce");
      assert.equal(formal.statusCode, 403);
      assert.deepEqual(formal.payload, { error: "case_not_clinically_approved" });
      counters.formalUseRejections += 1;
    }
  }

  process.env.TRAINING_DEPLOYMENT_TIER = "practice";
  for (const caseData of cases) {
    for (const language of ["zh", "en"]) {
      const control = await completeControl(caseData, language, counters);
      const returned = await completeReturnJourney(caseData, language, counters);
      if (JSON.stringify(comparableScore(control)) !== JSON.stringify(comparableScore(returned))) {
        counters.scoreDriftFailures += 1;
      }
    }
  }

  assert.equal(counters.formalUseRejections, 84);
  assert.equal(counters.returnResubmissions, 84 * 4);
  assert.equal(counters.scoreRequests, 84 * 2);
  assert.equal(counters.duplicateScoreReplays, 84 * 2);
  assert.equal(counters.completedAttemptRejections, 84 * 2);
  assert.equal(counters.scoreDriftFailures, 0);

  const summary = {
    schemaVersion: "exploratory-stage-3-6-return-governance-v1",
    productionBaseline: "77815862a0abebff67b8d958f66944a0e11b068f",
    status: "PASS_LOCAL_QA",
    cases: 42,
    languages: 2,
    practiceJourneys: 168,
    allCasesRemainNeedsRevision: true,
    formalUseApprovalChanged: false,
    ...counters,
    preSubmitLockedResponseShape: "error_only",
    stageFeedbackResponseShapeAllowlisted: true,
    scoreResponseShapeAllowlisted: true,
    medicalValuesRetained: false,
    responseBodiesRetained: false,
    requestIdsRetained: false,
    credentialsRetained: false
  };
  const serialized = `${JSON.stringify(summary, null, 2)}\n`;
  if (outputPath) {
    const resolved = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, serialized, "utf8");
  }
  process.stdout.write(serialized);
}

await main();
