import assert from "node:assert/strict";
import { projectStudentScoreText } from "../src/lib/studentScoreProjection";

process.env.TRAINING_STATE_SECRET = "test-only-42-stage-secret-with-adequate-length";
process.env.TRAINING_ATTEMPT_STORE_MODE = "memory";
process.env.TRAINING_DEPLOYMENT_TIER = "practice";

const handler = require("../api/training-action.js");
const { resetMemoryAttemptStore } = require("../server/trainingAttemptStore.js");
const { verifyAttemptState } = require("../server/trainingState.js");
const cases = require("../data/cases.json") as Array<{ id: string }>;
const publicCases = require("../data/cases_public.json") as Array<{ id: string; displayCaseId?: string }>;

const STAGES = ["history", "orders", "diagnosis", "consult", "treatment", "perioperative", "debrief"] as const;
const PUBLIC_STAGE_KEYS = ["comment", "evidenceOptions", "feedbackEvidence", "hits", "max", "misses", "practiceOnly", "score", "stageKey", "standardAnswer", "warnings"];
const FORBIDDEN_PUBLIC_KEYS = new Set(["canonical", "canonicalFactOrAction", "slot_answered", "provenance", "Provider", "intent", "requestedSlot", "answerSource", "local_ai", "rule_fallback", "runtimeSessionId", "stateStoreId", "attemptId", "token", "stateToken", "prompt", "reasoning", "raw360"]);
let requestCounter = 0;

function assertStudentPayload(value: unknown, label: string) {
  if (Array.isArray(value)) return value.forEach((item, index) => assertStudentPayload(item, `${label}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert(!FORBIDDEN_PUBLIC_KEYS.has(key), `${label} exposed internal key ${key}`);
    assertStudentPayload(child, `${label}.${key}`);
  }
}

function assertStagePayload(payload: Record<string, unknown>, label: string) {
  assert.deepEqual(Object.keys(payload).sort(), PUBLIC_STAGE_KEYS, `${label} stage response changed its public allowlist`);
  assertStudentPayload(payload, label);
  for (const option of (payload.evidenceOptions || []) as Array<Record<string, unknown>>) {
    assert.deepEqual(Object.keys(option).sort(), ["evidenceId", "label", "sourceStage"]);
    assert.match(String(option.evidenceId || ""), /^EV-[A-Za-z0-9-]+$/);
    assert(String(option.label || "").trim(), `${label} evidence label must be public text`);
  }
}

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
  const completed: Array<{ caseId: string; internalCaseId: string; language: string; stages: number; percentage: number }> = [];
  let stageSubmissions = 0;
  let scoreReports = 0;
  let reviewedEvidenceChecks = 0;

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

      const question = language === "en" ? "When did it start?" : "什么时候开始？";
      response = await call({
        action: "history-log", caseId: caseData.id, attemptId, mode: "free", language,
        question, requestId: `${attemptId}-history`
      }, response.token, clientScope);
      assert.equal(response.statusCode, 200, `${caseId}/${language} must record reviewed history through the real handler`);

      let failed = false;
      for (const [index, stageKey] of STAGES.entries()) {
        if (stageKey === "orders") {
          const exam = await call({
            action: "exam", caseId: caseData.id, attemptId, mode: "free", language,
            input: language === "en" ? "temperature" : "体温", requestId: `${attemptId}-exam`
          }, response.token, clientScope);
          assert.equal(exam.statusCode, 200, `${caseId}/${language} must execute a real examination`);
          response = await call({
            action: "order", caseId: caseData.id, attemptId, mode: "free", language,
            input: language === "en" ? "urinalysis" : "尿常规", requestId: `${attemptId}-order`
          }, exam.token, clientScope);
          assert.equal(response.statusCode, 200, `${caseId}/${language} must execute a real order`);
          const evidenceOptions = (response.payload.evidenceOptions || []) as Array<Record<string, unknown>>;
          assert(evidenceOptions.every((item) => item.sourceStage === 1 || item.sourceStage === 2));
          assert(evidenceOptions.every((item) => String(item.label || "").trim()), `${caseId}/${language} evidence must use reviewed public labels`);
          reviewedEvidenceChecks += 1;
        }
        const evidenceIds = ((response.payload.evidenceOptions || []) as Array<{ evidenceId: string }>).map((item) => item.evidenceId).slice(0, 2);
        const submission = stageKey === "history" ? { historySummary: language === "en" ? "Focused history recorded." : "已完成重点病史采集。", askedQuestions: [question] }
          : stageKey === "orders" ? { physicalExam: language === "en" ? "Temperature checked." : "已完成体温检查。", selectedOrders: [language === "en" ? "Urinalysis" : "尿常规"] }
            : stageKey === "diagnosis" ? { diagnosis: language === "en" ? "Working diagnosis" : "待定诊断", evidenceSelections: { primary: { diagnosis: "working", evidenceIds }, differentials: [1, 2, 3].map((number) => ({ diagnosis: `differential-${number}`, supportEvidenceIds: evidenceIds.slice(0, 1), opposeEvidenceIds: [] })) } }
              : stageKey === "consult" ? { consultNeeded: language === "en" ? "No consultation" : "暂不需要会诊" }
                : stageKey === "treatment" ? { immediateTreatment: language === "en" ? "Observe and reassess." : "观察并复评。", followUp: language === "en" ? "Outpatient review." : "门诊复查。" }
                  : stageKey === "perioperative" ? { perioperativePreparation: language === "en" ? "Safety checklist reviewed." : "已复核安全清单。" }
                    : { debriefReflection: language === "en" ? "Improve evidence integration." : "继续改进证据整合。" };
        response = await call({
          action: "stage-feedback",
          caseId: caseData.id,
          attemptId,
          mode: "free",
          language,
          stageKey,
          submission,
          requestId: `${attemptId}-stage-${index + 1}`
        }, response.token, clientScope);
        stageSubmissions += 1;
        if (response.statusCode !== 200) {
          failures.push({ caseId, language, phase: `stage-${index + 1}-${stageKey}`, status: response.statusCode, error: String(response.payload.error || "unknown_error") });
          failed = true;
          break;
        }
        assertStagePayload(response.payload, `${caseId}/${language}/${stageKey}`);
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
      const percentage = Math.round(Number(scored.payload.total) / Number(scored.payload.max) * 100);
      assert(Number.isFinite(percentage) && percentage >= 0 && percentage <= 100);
      assert.doesNotMatch(projectStudentScoreText(`${scored.payload.total}/${scored.payload.max}`, language), /360/);
      assertStudentPayload({ redFlags: scored.payload.redFlags }, `${caseId}/${language}/score-public-content`);
      assert.match(scored.headers["server-timing"], /^score;dur=\d+\.\d$/);
      assert.equal(scored.headers["x-hematuria-timing"], scored.headers["server-timing"]);
      completed.push({ caseId, internalCaseId: caseData.id, language, stages: STAGES.length, percentage });
    }
  }

  assert.deepEqual(failures, [], `42-case bilingual stage matrix failures: ${JSON.stringify(failures)}`);
  assert.equal(completed.length, 84);
  assert.equal(stageSubmissions, 42 * 2 * 7);
  assert.equal(scoreReports, 84);
  assert.equal(reviewedEvidenceChecks, 84);
  assert.equal(new Set(completed.map((item) => item.caseId)).size, 42);
  assert.equal(completed.filter((item) => item.language === "zh").length, 42);
  assert.equal(completed.filter((item) => item.language === "en").length, 42);

  console.log(`42-case bilingual seven-stage matrix passed: cases=42, journeys=${completed.length}, stageSubmissions=${stageSubmissions}, scoreReports=${scoreReports}, reviewedEvidenceChecks=${reviewedEvidenceChecks}, studentScale=percentage.`);
}

void main();
