import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.HEMATURIA_RUNTIME_TARGET = "desktop";
process.env.TRAINING_STATE_SECRET = "desktop-clinical-triage-test-secret-with-adequate-length";
process.env.TRAINING_ATTEMPT_STORE_MODE = "memory";
process.env.TRAINING_DEPLOYMENT_TIER = "practice";
process.env.TRAINING_API_RATE_LIMIT_PER_MINUTE = "1000000";

const require = createRequire(import.meta.url);
const handler = require("../api/training-action.js");
const cases = require("../data/cases.json");
const { desktopClinicalTriageSummary } = require("../server/desktopClinicalContentProjection.js");
const { digest, loadAttempt, resetMemoryAttemptStore } = require("../server/trainingAttemptStore.js");

resetMemoryAttemptStore();
let requestCounter = 0;

async function call(body, token = "") {
  let statusCode = 200;
  let payload = {};
  const headers = {};
  const requestId = `desktop-clinical-triage-${++requestCounter}`;
  const req = {
    method: "POST",
    body: { ...body, requestId },
    headers: {
      "x-idempotency-key": requestId,
      ...(token ? { "x-training-state": token } : {})
    },
    socket: { remoteAddress: `desktop-clinical-triage-${requestCounter}` }
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

async function stage(response, caseId, attemptId, stageKey, submission) {
  const next = await call({
    action: "stage-feedback",
    caseId,
    attemptId,
    mode: "free",
    language: "zh",
    stageKey,
    submission
  }, response.token);
  assert.equal(next.statusCode, 200, `${caseId}/${stageKey}:${JSON.stringify(next.payload)}`);
  return next;
}

async function startStageTwo(caseId, suffix) {
  const attemptId = `triage-${caseId}-${suffix}`;
  let response = await call({ action: "init-attempt", caseId, attemptId, mode: "free", language: "zh" });
  assert.equal(response.statusCode, 200);
  for (const question of ["哪里不舒服？", "多久了？"]) {
    response = await call({ action: "history-log", caseId, attemptId, mode: "free", language: "zh", question }, response.token);
    assert.equal(response.statusCode, 200);
  }
  response = await stage(response, caseId, attemptId, "history", { askedQuestions: ["哪里不舒服？", "多久了？"] });
  return { attemptId, response };
}

async function placeOrder(response, caseId, attemptId, input) {
  const next = await call({ action: "order", caseId, attemptId, mode: "free", language: "zh", input }, response.token);
  assert.equal(next.statusCode, 200, `${caseId}/${input}:${JSON.stringify(next.payload)}`);
  return next;
}

function outcome(response, status) {
  return (response.payload.orderOutcomes || []).find((item) => item.status === status);
}

const summary = desktopClinicalTriageSummary();
assert.deepEqual(summary, {
  sourcePackSha256: "832cd6c0935a129258b5844db403f12a471949cabc36caecd6120173e8b68a46",
  sourceProjectionApplied: 66,
  sourceProjectionRejected: 59,
  safeSimulatedNormalApplied: 75,
  noSpecimenOrNotIndicated: 552,
  noReportOrNotIndicated: 952,
  medicalReviewPending: 961,
  medicalConflicts: 1
});

const representativeCases = [
  { caseId: "P001", cohort: "tumor" },
  { caseId: "P002", cohort: "female_tumor" },
  { caseId: "P006", cohort: "infection" },
  { caseId: "P009", cohort: "stone" },
  { caseId: "P011", cohort: "glomerular" }
];
const journeyResults = [];

for (const journey of representativeCases) {
  const caseData = cases.find((item) => item.id === journey.caseId);
  assert(caseData, `missing_case:${journey.caseId}`);
  const started = await startStageTwo(journey.caseId, journey.cohort);
  let { response } = started;
  const { attemptId } = started;

  response = await placeOrder(response, journey.caseId, attemptId, "LAB-UR-002");
  const projection = (response.payload.results || []).find((item) => item.provenance === "case_source_projection");
  assert(projection, `${journey.caseId}:source_projection_not_returned`);
  assert.equal(projection.scoringEligible, false);
  assert.equal(projection.diagnosticEligible, true);
  assert(outcome(response, "reported"));

  if (journey.caseId === "P001") {
    response = await call({ action: "exam", caseId: journey.caseId, attemptId, mode: "free", language: "zh", input: "腰部包块" }, response.token);
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.provenance, "simulated_normal");
    assert.equal(response.payload.scoringEligible, false);
    assert.equal(response.payload.diagnosticEligible, false);

    response = await placeOrder(response, journey.caseId, attemptId, "LAB-UR-005");
    assert(outcome(response, "no_specimen"));
    assert.equal((response.payload.results || []).length, 0);

    response = await placeOrder(response, journey.caseId, attemptId, "KUB腹部平片");
    assert(outcome(response, "no_indication"));
    assert.match(outcome(response, "no_indication").message, /无明确开立适应证.*未实施/u);
    assert.equal((response.payload.results || []).length, 0);

    response = await placeOrder(response, journey.caseId, attemptId, "LAB-UR-003");
    assert(outcome(response, "medical_review_pending"));
    assert.equal((response.payload.results || []).length, 0);
  }

  if (journey.caseId === "P006") {
    response = await placeOrder(response, journey.caseId, attemptId, "尿脱落细胞学");
    assert(outcome(response, "no_specimen"));
    assert.match(outcome(response, "no_specimen").message, /未取材.*无病理报告/u);
    assert.equal((response.payload.results || []).length, 0, "pathology must not fabricate a normal report without a specimen");
  }

  response = await stage(response, journey.caseId, attemptId, "orders", {});
  const evidenceOptions = response.payload.evidenceOptions || [];
  const historyEvidence = evidenceOptions.filter((item) => item.sourceStage === 1);
  const measurementEvidence = evidenceOptions.filter((item) => item.sourceStage === 2);
  assert(historyEvidence.length >= 1);
  assert(measurementEvidence.some((item) => /LAB-UR-002|红细胞|尿沉渣/u.test(item.label)), `${journey.caseId}:projection_not_in_evidence_graph`);
  assert(!evidenceOptions.some((item) => /双侧腰部未触及明显包块/u.test(item.label)), "simulated normal must not enter diagnostic evidence options");
  const selectedIds = [historyEvidence[0].evidenceId, measurementEvidence[0].evidenceId];

  response = await stage(response, journey.caseId, attemptId, "diagnosis", {
    diagnosis: caseData.diagnosis,
    differentials: "感染；结石；肿瘤",
    confirmatoryTests: "尿常规；影像检查",
    evidenceSelections: {
      primary: { diagnosis: caseData.diagnosis, evidenceIds: selectedIds },
      differentials: [
        { diagnosis: "感染", supportEvidenceIds: [selectedIds[0]], opposeEvidenceIds: [] },
        { diagnosis: "结石", supportEvidenceIds: [], opposeEvidenceIds: [selectedIds[1]] },
        { diagnosis: "肿瘤", supportEvidenceIds: [selectedIds[1]], opposeEvidenceIds: [] }
      ]
    }
  });
  response = await call({
    action: "mdt",
    caseId: journey.caseId,
    attemptId,
    mode: "free",
    language: "zh",
    departments: ["影像科"],
    purpose: "核对病例相关影像问题",
    consultRequests: [{ department: "影像科", purpose: "核对病例相关影像问题", question: "还需补充哪些证据？", evidenceIds: selectedIds }]
  }, response.token);
  assert.equal(response.statusCode, 200);
  response = await stage(response, journey.caseId, attemptId, "consult", {
    consultNeeded: "required",
    consultDepartments: ["影像科"],
    consultPurpose: "核对病例相关影像问题",
    consultQuestions: "还需补充哪些证据？"
  });
  response = await stage(response, journey.caseId, attemptId, "treatment", {
    immediateTreatment: "评估急诊与入院需要并监测生命体征",
    admissionTreatment: "依据病例证据给予支持处理并复查",
    definitiveTreatment: "明确诊断后制定确定性处理计划",
    followUp: "安排复查与出院安全网",
    patientEducation: "告知警示症状与随访要求"
  });
  response = await stage(response, journey.caseId, attemptId, "perioperative", {
    perioperativePreparation: "适应证；麻醉；心肺；肾功能与液体；感染；备血；凝血；VTE；导管引流；术后监测；并发症；ERAS；随访"
  });
  response = await stage(response, journey.caseId, attemptId, "debrief", {
    debriefReflection: "将检查结果与证据编号关联，复盘无适应证检查和等待医学审核的项目。"
  });
  const scored = await call({ action: "score", caseId: journey.caseId, attemptId, mode: "free", language: "zh" }, response.token);
  assert.equal(scored.statusCode, 200);
  assert.equal(scored.payload.max, 360);
  assert(scored.payload.clinicalTrajectory);
  if (journey.caseId === "P001") {
    assert((scored.payload.clinicalTrajectory.unnecessaryInvestigations || []).some((item) => /无明确开立适应证/u.test(item.result)));
  }

  const stored = await loadAttempt({
    caseId: journey.caseId,
    attemptId,
    token: scored.token,
    requestId: `inspect-${attemptId}`,
    requestDigest: digest(`inspect-${attemptId}`)
  });
  assert.equal(stored.state.status, "completed");
  const projectedNodes = stored.state.evidenceGraph.filter((node) => node.provenance === "case_source_projection");
  assert(projectedNodes.some((node) => node.eventType === "result_returned" && node.diagnosticEligible === true && node.scoringEligible === false));
  const simulatedNodes = stored.state.evidenceGraph.filter((node) => node.provenance === "simulated_normal");
  assert(simulatedNodes.every((node) => node.diagnosticEligible === false && node.scoringEligible === false && node.rubricMappings.length === 0));
  assert(!stored.state.evidenceGraph.some((node) => node.provenance === "medical_review_pending" && node.eventType === "result_returned"));
  journeyResults.push({ caseId: journey.caseId, cohort: journey.cohort, completed: true, evidenceNodes: stored.state.evidenceGraph.length });
}

const conflict = await startStageTwo("P004", "conflict");
const conflictOrder = await placeOrder(conflict.response, "P004", conflict.attemptId, "双肾+输尿管CT平扫+增强");
assert(outcome(conflictOrder, "medical_review_pending"));
assert.equal(outcome(conflictOrder, "medical_review_pending").provenance, "medical_conflict");
assert.equal((conflictOrder.payload.results || []).length, 0);

assert.doesNotMatch(JSON.stringify(journeyResults), /undefined|\[object Object\]/iu);
console.log(`DESKTOP_CLINICAL_TRIAGE_RESULT ${JSON.stringify({ summary, journeys: journeyResults, medicalConflictPreserved: 1 })}`);
