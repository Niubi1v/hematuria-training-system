import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.TRAINING_STATE_SECRET = "best-practice-alignment-test-secret-with-adequate-length";
process.env.TRAINING_ATTEMPT_STORE_MODE = "memory";
process.env.TRAINING_DEPLOYMENT_TIER = "practice";
process.env.TRAINING_API_RATE_LIMIT_PER_MINUTE = "1000000";
process.env.LLM_ENABLE_AI_AGENTS = "false";
process.env.LLM_ENABLE_AI_PATIENT = "false";
process.env.PATIENT_SEMANTIC_CLASSIFIER_ENABLED = "false";

const require = createRequire(import.meta.url);
const handler = require("../api/training-action.js");
const cases = require("../data/cases.json");
const { generatePatientAnswer, initSession } = require("../server/patientSession.js");
const { digest, loadAttempt, resetMemoryAttemptStore } = require("../server/trainingAttemptStore.js");

const journeys = [
  { caseId: "P001", language: "zh", cohort: "tumor", orderId: "LAB-UR-001", department: "肿瘤科" },
  { caseId: "P001", language: "en", cohort: "tumor", orderId: "LAB-BL-001", department: "Oncology", expectedOrderStatus: "medical_review_pending" },
  { caseId: "P006", language: "zh", cohort: "infection_female", orderId: "LAB-UR-001", department: "感染科" },
  { caseId: "P009", language: "zh", cohort: "stone_female", orderId: "IMG-US-001", department: "影像科" },
  { caseId: "P002", language: "zh", cohort: "tumor_female", orderId: "IMG-US-001", department: "肿瘤科", expectedOrderStatus: "medical_review_pending" }
];

const questions = {
  zh: [
    { text: "哪里不舒服？", intent: "chief_complaint", slot: "chief_complaint", contextual: false },
    { text: "多久了？", intent: "hematuria_onset", slot: "hematuria_onset", contextual: true }
  ],
  en: [
    { text: "What brings you in?", intent: "chief_complaint", slot: "chief_complaint", contextual: false },
    { text: "How long has it been going on?", intent: "hematuria_onset", slot: "hematuria_onset", contextual: true }
  ]
};

let requestCounter = 0;

async function call(body, token = "", scope = "best-practice") {
  let statusCode = 200;
  let payload = {};
  const headers = {};
  const requestId = String(body.requestId || `best-practice-${++requestCounter}`);
  const req = {
    method: "POST",
    body: { ...body, requestId },
    headers: {
      "x-idempotency-key": requestId,
      ...(token ? { "x-training-state": token } : {})
    },
    socket: { remoteAddress: scope }
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

async function stage(response, journey, attemptId, stageKey, submission) {
  const next = await call({
    action: "stage-feedback",
    caseId: journey.caseId,
    attemptId,
    mode: "free",
    language: journey.language,
    stageKey,
    submission
  }, response.token, attemptId);
  assert.equal(next.statusCode, 200, `${attemptId}/${stageKey} failed: ${JSON.stringify(next.payload)}`);
  return next;
}

function feedbackRows(payload) {
  return ["hits", "misses", "warnings"].flatMap((key) =>
    Array.isArray(payload?.feedbackEvidence?.[key]) ? payload.feedbackEvidence[key] : []
  );
}

function expectedPatientTurn(answer, probe) {
  const intent = String(answer.runtimeTrace?.governedIntent || answer.answerPlans?.at(-1)?.intent || "");
  const slot = String(answer.runtimeTrace?.governedRequestedSlot || answer.answerPlans?.at(-1)?.sourceSlotId || "");
  const errors = Array.isArray(answer.runtimeTrace?.responseErrors) ? answer.runtimeTrace.responseErrors : [];
  return {
    correct: Boolean(answer.answerPlans?.length) && intent === probe.intent && slot === probe.slot
      && !errors.some((item) => ["off_script", "polarity_error", "wrong_unknown", "tangential", "role_breaking"].includes(item)),
    contextual: probe.contextual,
    contextContinuous: !probe.contextual || (intent === probe.intent && slot === probe.slot && !errors.includes("context_lost")),
    errors
  };
}

resetMemoryAttemptStore();
const metrics = {
  patientTurns: 0,
  factCorrect: 0,
  contextualTurns: 0,
  contextContinuous: 0,
  responseErrors: Object.fromEntries([
    "tangential", "oversharing", "role_breaking", "off_script", "wrong_unknown", "context_lost", "polarity_error"
  ].map((item) => [item, 0])),
  answerSources: { local_ai: 0, rule_fallback: 0 },
  orders: 0,
  actionResultMatches: 0,
  feedbackItems: 0,
  traceableFeedbackItems: 0,
  journeys: journeys.length,
  completedJourneys: 0,
  stageSubmissions: 0,
  scoreReports: 0,
  trajectorySections: 0,
  populatedTrajectorySections: 0
};
const journeyEvidence = [];

for (const journey of journeys) {
  const caseData = cases.find((item) => item.id === journey.caseId);
  assert(caseData, `missing case ${journey.caseId}`);
  const patientSession = await initSession({
    caseId: journey.caseId,
    attemptId: `best-practice-patient-${journey.caseId}-${journey.language}`,
    mode: "training",
    language: journey.language
  });
  const conversationHistory = [];
  for (const probe of questions[journey.language]) {
    const answer = await generatePatientAnswer({
      sessionId: patientSession.sessionId,
      caseId: journey.caseId,
      studentInput: probe.text,
      conversationHistory,
      language: journey.language
    });
    const evaluated = expectedPatientTurn(answer, probe);
    const localAccepted = answer.runtimeTrace?.classificationSource === "local_ai"
      && answer.runtimeTrace?.classifierStatus === "accepted";
    metrics.answerSources[localAccepted ? "local_ai" : "rule_fallback"] += 1;
    metrics.patientTurns += 1;
    if (evaluated.correct) metrics.factCorrect += 1;
    if (evaluated.contextual) {
      metrics.contextualTurns += 1;
      if (evaluated.contextContinuous) metrics.contextContinuous += 1;
    }
    for (const error of evaluated.errors) {
      if (Object.hasOwn(metrics.responseErrors, error)) metrics.responseErrors[error] += 1;
    }
    conversationHistory.push(
      { role: "student", text: probe.text },
      { role: "patient", text: answer.replyText }
    );
  }

  const attemptId = `best-practice-${journey.caseId}-${journey.language}`;
  let response = await call({
    action: "init-attempt",
    caseId: journey.caseId,
    attemptId,
    mode: "free",
    language: journey.language
  }, "", attemptId);
  assert.equal(response.statusCode, 200);

  for (const probe of questions[journey.language]) {
    response = await call({
      action: "history-log",
      caseId: journey.caseId,
      attemptId,
      mode: "free",
      language: journey.language,
      question: probe.text
    }, response.token, attemptId);
    assert.equal(response.statusCode, 200);
  }
  response = await stage(response, journey, attemptId, "history", {
    askedQuestions: questions[journey.language].map((item) => item.text)
  });
  metrics.stageSubmissions += 1;

  response = await call({
    action: "order",
    caseId: journey.caseId,
    attemptId,
    mode: "free",
    language: journey.language,
    input: journey.orderId
  }, response.token, attemptId);
  assert.equal(response.statusCode, 200);
  metrics.orders += 1;
  const returned = Array.isArray(response.payload.results) ? response.payload.results : [];
  const outcomes = Array.isArray(response.payload.orderOutcomes) ? response.payload.orderOutcomes : [];
  const expectedPending = journey.expectedOrderStatus === "medical_review_pending";
  const matched = expectedPending
    ? returned.every((item) => item.orderId !== journey.orderId)
      && outcomes.some((item) => item.orderId === journey.orderId
        && item.status === "medical_review_pending"
        && item.provenance === "source_result_semantic_mismatch"
        && item.diagnosticEligible === false
        && item.scoringEligible === false)
    : returned.some((item) => item.orderId === journey.orderId
      && item.caseId === journey.caseId
      && item.provenance === "configured_case_result");
  if (matched) metrics.actionResultMatches += 1;
  assert(matched, `${attemptId} did not return the governed outcome for ${journey.orderId}`);
  if (expectedPending && journey.language === "en") assert.doesNotMatch(JSON.stringify(response.payload), /[\u3400-\u9fff]/u);

  response = await stage(response, journey, attemptId, "orders", {});
  metrics.stageSubmissions += 1;
  const evidenceOptions = Array.isArray(response.payload.evidenceOptions) ? response.payload.evidenceOptions : [];
  const historyEvidence = evidenceOptions.filter((item) => item.sourceStage === 1);
  const measurementEvidence = evidenceOptions.filter((item) => item.sourceStage === 2);
  assert(historyEvidence.length >= 2, `${attemptId} must expose two collected history evidence IDs`);
  if (expectedPending) assert.equal(measurementEvidence.length, 0, `${attemptId} must not expose an unreviewed result as diagnostic evidence`);
  else assert(measurementEvidence.length >= 1, `${attemptId} must expose the released measurement evidence ID`);
  const comparisonEvidence = measurementEvidence[0] || historyEvidence[1];
  const primaryEvidenceIds = [historyEvidence[0].evidenceId, comparisonEvidence.evidenceId];

  const stageFeedback = [];
  response = await stage(response, journey, attemptId, "diagnosis", {
    diagnosis: caseData.title,
    differentials: "Differential A; Differential B; Differential C",
    confirmatoryTests: journey.orderId,
    evidenceSelections: {
      primary: { diagnosis: caseData.title, evidenceIds: primaryEvidenceIds },
      differentials: [
        { diagnosis: "Differential A", supportEvidenceIds: [historyEvidence[0].evidenceId], opposeEvidenceIds: [] },
        { diagnosis: "Differential B", supportEvidenceIds: [], opposeEvidenceIds: [comparisonEvidence.evidenceId] },
        { diagnosis: "Differential C", supportEvidenceIds: [comparisonEvidence.evidenceId], opposeEvidenceIds: [] }
      ]
    }
  });
  stageFeedback.push(...feedbackRows(response.payload));
  metrics.stageSubmissions += 1;

  const consultPurpose = journey.language === "en"
    ? "Assess the case-specific multidisciplinary question"
    : "评估本病例相关的多学科问题";
  response = await call({
    action: "mdt",
    caseId: journey.caseId,
    attemptId,
    mode: "free",
    language: journey.language,
    departments: [journey.department],
    purpose: consultPurpose,
    consultRequests: [{
      department: journey.department,
      purpose: consultPurpose,
      question: journey.language === "en" ? "What additional evidence is needed?" : "还需要补充哪些证据？",
      evidenceIds: primaryEvidenceIds
    }]
  }, response.token, attemptId);
  assert.equal(response.statusCode, 200);
  assert(Array.isArray(response.payload) && response.payload.length === 1);
  assert.deepEqual(response.payload[0].evidenceIds, primaryEvidenceIds);
  response = await stage(response, journey, attemptId, "consult", {
    consultNeeded: "required",
    consultDepartments: [journey.department],
    consultPurpose,
    consultQuestions: journey.language === "en" ? "What additional evidence is needed?" : "还需要补充哪些证据？"
  });
  stageFeedback.push(...feedbackRows(response.payload));
  metrics.stageSubmissions += 1;

  response = await stage(response, journey, attemptId, "treatment", {
    immediateTreatment: journey.language === "en" ? "Assess urgency and admission need" : "评估急诊与入院需要",
    admissionTreatment: journey.language === "en" ? "Monitoring and case-directed supportive care" : "监测并给予病例相关支持处理",
    definitiveTreatment: journey.language === "en" ? "Confirm diagnosis before a definitive intervention" : "明确诊断后制定确定性干预计划",
    followUp: journey.language === "en" ? "Discharge safety net and scheduled follow-up" : "出院安全网与计划随访",
    patientEducation: journey.language === "en" ? "Explain warning signs and monitoring" : "告知警示症状与监测要求"
  });
  stageFeedback.push(...feedbackRows(response.payload));
  metrics.stageSubmissions += 1;

  response = await stage(response, journey, attemptId, "perioperative", {
    perioperativePreparation: journey.language === "en"
      ? "Indication; anesthesia; cardiopulmonary risk; renal and fluid management; infection control; blood preparation; coagulation; VTE prevention; drains; postoperative monitoring; complications; ERAS; follow-up"
      : "适应证；麻醉评估；心肺风险；肾功能与液体；感染控制；备血；凝血；VTE预防；导管引流；术后监测；并发症；ERAS；随访"
  });
  stageFeedback.push(...feedbackRows(response.payload));
  metrics.stageSubmissions += 1;

  response = await stage(response, journey, attemptId, "debrief", {
    debriefReflection: journey.language === "en"
      ? "Link each decision to collected evidence and review omissions."
      : "将每项决策与已采集证据关联，并复盘遗漏。"
  });
  stageFeedback.push(...feedbackRows(response.payload));
  metrics.stageSubmissions += 1;

  const score = await call({
    action: "score",
    caseId: journey.caseId,
    attemptId,
    mode: "free",
    language: journey.language
  }, response.token, attemptId);
  assert.equal(score.statusCode, 200);
  assert.equal(score.payload.max, 360);
  assert.equal(score.payload.reportVersion, 3);
  assert.equal(score.payload.scoringVersion, "360-event-v1");
  metrics.scoreReports += 1;

  const stored = await loadAttempt({
    caseId: journey.caseId,
    attemptId,
    token: score.token,
    requestId: `best-practice-inspect-${attemptId}`,
    requestDigest: digest(`best-practice-inspect-${attemptId}`)
  });
  const graphIds = new Set(stored.state.evidenceGraph.map((node) => node.evidenceId));
  for (const item of stageFeedback) {
    metrics.feedbackItems += 1;
    const ids = Array.isArray(item.evidenceIds) ? item.evidenceIds : [];
    const traceable = ids.length > 0 && ids.every((id) => graphIds.has(id));
    if (traceable) metrics.traceableFeedbackItems += 1;
    assert(traceable, `${attemptId} emitted untraceable stage 3-7 feedback`);
  }

  for (const node of stored.state.evidenceGraph) {
    assert(node.evidenceId && node.caseId === journey.caseId && node.sourceStage);
    assert(node.canonicalFactOrAction && typeof node.result === "string" && node.provenance);
    assert(Array.isArray(node.diagnosisRelations) && Array.isArray(node.rubricMappings));
  }
  const trajectory = score.payload.clinicalTrajectory;
  const sections = [
    trajectory.questions,
    trajectory.acquiredEvidence,
    trajectory.examinationsAndOrders,
    trajectory.diagnosisFormation,
    trajectory.consultations,
    trajectory.treatmentOrders,
    trajectory.perioperativeManagement,
    trajectory.decisionTransitions
  ];
  metrics.trajectorySections += sections.length;
  metrics.populatedTrajectorySections += sections.filter((items) => Array.isArray(items) && items.length > 0).length;
  assert.equal(sections.filter((items) => Array.isArray(items) && items.length > 0).length, sections.length);
  assert.doesNotMatch(JSON.stringify(score.payload), /undefined|\[object Object\]/i);
  metrics.completedJourneys += 1;
  journeyEvidence.push({
    caseId: journey.caseId,
    language: journey.language,
    cohort: journey.cohort,
    evidenceNodes: stored.state.evidenceGraph.length,
    stageFeedbackItems: stageFeedback.length,
    trajectorySections: sections.length
  });
}

assert.equal(metrics.factCorrect, metrics.patientTurns);
assert.equal(metrics.answerSources.local_ai, 0);
assert.equal(metrics.answerSources.rule_fallback, metrics.patientTurns);
assert.equal(metrics.contextContinuous, metrics.contextualTurns);
assert.equal(metrics.actionResultMatches, metrics.orders);
assert.equal(metrics.traceableFeedbackItems, metrics.feedbackItems);
assert.equal(metrics.completedJourneys, metrics.journeys);
assert.equal(metrics.stageSubmissions, journeys.length * 7);
assert.equal(metrics.scoreReports, journeys.length);
assert.equal(metrics.populatedTrajectorySections, metrics.trajectorySections);

console.log(`BEST_PRACTICE_ALIGNMENT ${JSON.stringify({
  cohorts: journeyEvidence,
  factAccuracy: { correct: metrics.factCorrect, total: metrics.patientTurns, rate: metrics.factCorrect / metrics.patientTurns },
  contextContinuity: { correct: metrics.contextContinuous, total: metrics.contextualTurns, rate: metrics.contextContinuous / metrics.contextualTurns },
  responseErrors: metrics.responseErrors,
  modelDisabledAnswerSources: metrics.answerSources,
  actionResultMatch: { correct: metrics.actionResultMatches, total: metrics.orders, rate: metrics.actionResultMatches / metrics.orders },
  evidenceFeedbackTraceability: { correct: metrics.traceableFeedbackItems, total: metrics.feedbackItems, rate: metrics.traceableFeedbackItems / metrics.feedbackItems },
  sevenStageCompletion: { correct: metrics.completedJourneys, total: metrics.journeys, rate: metrics.completedJourneys / metrics.journeys },
  stageSubmissions: metrics.stageSubmissions,
  scoreReports: metrics.scoreReports,
  trajectoryCoverage: { populated: metrics.populatedTrajectorySections, total: metrics.trajectorySections, rate: metrics.populatedTrajectorySections / metrics.trajectorySections }
})}`);
