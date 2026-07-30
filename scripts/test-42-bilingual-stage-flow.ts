import assert from "node:assert/strict";

process.env.TRAINING_STATE_SECRET = "test-only-42-stage-secret-with-adequate-length";
process.env.TRAINING_ATTEMPT_STORE_MODE = "memory";
process.env.TRAINING_DEPLOYMENT_TIER = "practice";

const handler = require("../api/training-action.js");
const { resetMemoryAttemptStore } = require("../server/trainingAttemptStore.js");
const { verifyAttemptState } = require("../server/trainingState.js");
const cases = require("../data/cases.json") as Array<{ id: string }>;
const publicCases = require("../data/cases_public.json") as Array<{ id: string; displayCaseId?: string }>;

const STAGES = ["history", "orders", "diagnosis", "consult", "treatment", "perioperative", "debrief"] as const;
let requestCounter = 0;

async function call(body: Record<string, unknown>, token = "", clientScope = "matrix") {
  let statusCode = 200;
  let payload: Record<string, unknown> = {};
  const headers: Record<string, string> = {};
  const requestId = String(body.requestId || `stage-matrix-${++requestCounter}`);
  const req = {
    method: "POST",
    body: { ...body, requestId },
    headers: {
      origin: "https://matrix.example.test",
      host: "matrix.example.test",
      "x-forwarded-proto": "https",
      "x-idempotency-key": requestId,
      ...(token ? { "x-training-state": token } : {})
    },
    socket: { remoteAddress: clientScope }
  };
  const res = {
    setHeader(name: string, value: string) { headers[name.toLowerCase()] = value; },
    status(code: number) { statusCode = code; return this; },
    json(value: Record<string, unknown>) { payload = value; return this; },
    end() { return this; }
  };
  await handler(req, res);
  return { statusCode, payload, token: headers["x-training-state"] || token, headers };
}

async function main() {
  assert.equal(cases.length, 42, "the authoritative case library must contain exactly 42 cases");
  assert.equal(publicCases.length, 42, "the public case library must contain exactly 42 cases");
  resetMemoryAttemptStore();

  const failures: Array<{ caseId: string; language: string; phase: string; status: number; error: string }> = [];
  const completed: Array<{ caseId: string; internalCaseId: string; language: string; stages: number; maxScore: number }> = [];
  let stageSubmissions = 0;
  let scoreReports = 0;

  for (const caseData of cases) {
    const publicCase = publicCases.find((item) => item.id === caseData.id);
    const caseId = publicCase?.displayCaseId || caseData.id;
    for (const language of ["zh", "en"] as const) {
      const attemptId = `matrix-${caseData.id}-${language}`;
      const clientScope = `matrix-${caseData.id}-${language}`;
      let response = await call({
        action: "init-attempt",
        caseId: caseData.id,
        attemptId,
        mode: "free",
        language,
        requestId: `${attemptId}-init`
      }, "", clientScope);
      if (response.statusCode !== 200) {
        failures.push({ caseId, language, phase: "init", status: response.statusCode, error: String(response.payload.error || "unknown_error") });
        continue;
      }

      let failed = false;
      for (const [index, stageKey] of STAGES.entries()) {
        response = await call({
          action: "stage-feedback",
          caseId: caseData.id,
          attemptId,
          mode: "free",
          language,
          stageKey,
          submission: {},
          requestId: `${attemptId}-stage-${index + 1}`
        }, response.token, clientScope);
        stageSubmissions += 1;
        if (response.statusCode !== 200) {
          failures.push({ caseId, language, phase: `stage-${index + 1}-${stageKey}`, status: response.statusCode, error: String(response.payload.error || "unknown_error") });
          failed = true;
          break;
        }
      }
      if (failed) continue;

      const claims = verifyAttemptState(response.token, { caseId: caseData.id, attemptId });
      assert.equal(claims.currentStage, 8, `${caseId}/${language} must reach scoring after seven stages`);
      const scored = await call({
        action: "score",
        caseId: caseData.id,
        attemptId,
        mode: "free",
        language,
        requestId: `${attemptId}-score`
      }, response.token, clientScope);
      scoreReports += 1;
      if (scored.statusCode !== 200) {
        failures.push({ caseId, language, phase: "score", status: scored.statusCode, error: String(scored.payload.error || "unknown_error") });
        continue;
      }
      assert.equal(scored.payload.max, 360, `${caseId}/${language} must use the unique 360-point maximum`);
      assert.equal(scored.payload.scoringVersion, "360-event-v1");
      assert.equal(scored.payload.reportVersion, 3);
      assert.equal(Number.isFinite(Number(scored.payload.total)), true);
      assert.match(scored.headers["server-timing"], /^score;dur=\d+\.\d$/);
      assert.equal(scored.headers["x-hematuria-timing"], scored.headers["server-timing"]);
      completed.push({ caseId, internalCaseId: caseData.id, language, stages: STAGES.length, maxScore: 360 });
    }
  }

  assert.deepEqual(failures, [], `42-case bilingual stage matrix failures: ${JSON.stringify(failures)}`);
  assert.equal(completed.length, 84);
  assert.equal(stageSubmissions, 42 * 2 * 7);
  assert.equal(scoreReports, 84);
  assert.equal(new Set(completed.map((item) => item.caseId)).size, 42);
  assert.equal(completed.filter((item) => item.language === "zh").length, 42);
  assert.equal(completed.filter((item) => item.language === "en").length, 42);

  console.log(`42-case bilingual seven-stage matrix passed: cases=42, journeys=${completed.length}, stageSubmissions=${stageSubmissions}, scoreReports=${scoreReports}, maxScore=360.`);
}

void main();
