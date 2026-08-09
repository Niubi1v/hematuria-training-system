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
const runtime = require("../desktop/clinical-content-triage-runtime.json");
const medicalAuthor = require("../desktop/medical-author-approved-stage2-results.json");
const { desktopClinicalTriageSummary } = require("../server/desktopClinicalContentProjection.js");
const { digest, loadAttempt, resetMemoryAttemptStore } = require("../server/trainingAttemptStore.js");
const { containsCjk } = require("../shared/dataAgentPresentation.js");

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
    headers: { "x-idempotency-key": requestId, ...(token ? { "x-training-state": token } : {}) },
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

async function stage(response, caseId, attemptId, stageKey, submission, language = "zh") {
  const next = await call({ action: "stage-feedback", caseId, attemptId, mode: "free", language, stageKey, submission }, response.token);
  assert.equal(next.statusCode, 200, `${caseId}/${language}/${stageKey}:${JSON.stringify(next.payload)}`);
  return next;
}

async function startStageTwo(caseId, suffix, language = "zh") {
  const attemptId = `triage-${caseId}-${suffix}-${language}`;
  let response = await call({ action: "init-attempt", caseId, attemptId, mode: "free", language });
  assert.equal(response.statusCode, 200);
  const questions = language === "en" ? ["Where is the discomfort?", "How long has it been present?"] : ["哪里不舒服？", "多久了？"];
  for (const question of questions) {
    response = await call({ action: "history-log", caseId, attemptId, mode: "free", language, question }, response.token);
    assert.equal(response.statusCode, 200);
  }
  response = await stage(response, caseId, attemptId, "history", { askedQuestions: questions }, language);
  return { attemptId, response };
}

async function placeOrder(response, caseId, attemptId, input, language = "zh") {
  const next = await call({ action: "order", caseId, attemptId, mode: "free", language, input }, response.token);
  assert.equal(next.statusCode, 200, `${caseId}/${language}/${input}:${JSON.stringify(next.payload)}`);
  return next;
}

function outcome(response, status, orderId = "") {
  return (response.payload.orderOutcomes || []).find((item) => item.status === status && (!orderId || item.orderId === orderId));
}

function assertNoEmptyTrajectoryShells(trajectory, caseId) {
  const groups = ["questions", "acquiredEvidence", "examinationsAndOrders", "diagnosisFormation", "consultations", "treatmentOrders", "perioperativeManagement", "unnecessaryInvestigations"];
  for (const group of groups) {
    for (const item of trajectory[group] || []) {
      assert(String(item.action || "").trim() || String(item.canonical || "").trim(), `${caseId}/${group}:empty_action`);
      assert(String(item.result || "").trim(), `${caseId}/${group}:empty_result`);
      assert.doesNotMatch(String(item.result), /[:：]\s*$/u, `${caseId}/${group}:empty_colon_shell`);
    }
  }
}

const summary = desktopClinicalTriageSummary();
assert.deepEqual(summary, {
  sourcePackSha256: "832cd6c0935a129258b5844db403f12a471949cabc36caecd6120173e8b68a46",
  sourceProjectionApplied: 4,
  sourceProjectionRejected: 121,
  safeSimulatedNormalApplied: 75,
  noSpecimenOrNotIndicated: 552,
  noReportOrNotIndicated: 952,
  medicalReviewPending: 1023,
  medicalConflicts: 1,
  humanApprovedMappings: 21,
  humanRejectedMappings: 4,
  humanInvalidMappings: 0,
  medicalAuthorAuthoritySha256: "f846a35c3ed80899d29c535da0ec46309ef2cd810e2c6f7fe2ae99865f7707d9",
  medicalAuthorSimulatedReports: 103,
  medicalAuthorNotPerformed: 34,
  medicalAuthorSourceDerivedReports: 3
});

const semanticReasons = ["cross_domain_or_mixed_order_content", "cross_order_duplicate_result", "multiple_timepoints_or_states", "recommendation_or_uncertain_result"];
const withdrawalReasons = Object.fromEntries(semanticReasons.map((reason) => [reason, runtime.sourceProjectionRejected.filter((item) => item.reason === reason).length]));
assert.deepEqual(withdrawalReasons, {
  cross_domain_or_mixed_order_content: 9,
  cross_order_duplicate_result: 35,
  multiple_timepoints_or_states: 1,
  recommendation_or_uncertain_result: 17
});
assert.equal(runtime.sourceProjection.length, 4);
assert.equal(Object.values(withdrawalReasons).reduce((sum, count) => sum + count, 0), 62);
assert(runtime.sourceProjectionRejected.filter((item) => item.reason === "cross_order_duplicate_result").every((item) => item.coveredByOrderId));
assert(runtime.sourceProjection.every((item) => item.itemId === "LAB-UR-001" && item.diagnosticEligible === true && item.scoringEligible === false));

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

  response = await placeOrder(response, journey.caseId, attemptId, "LAB-UR-001");
  const reported = outcome(response, "reported", "LAB-UR-001");
  assert(reported, `${journey.caseId}:urinalysis_not_reported`);
  const urinalysis = (response.payload.results || []).find((item) => item.orderId === "LAB-UR-001");
  assert(urinalysis);
  assert(String(urinalysis.result).trim());
  assert.doesNotMatch(urinalysis.result, /尿检\s*[:：]/u);
  assert.equal(urinalysis.result.split("\n").length, 1, `${journey.caseId}:duplicate_urinalysis_result`);
  if (journey.caseId === "P001") {
    assert.equal(urinalysis.result, "红细胞 5562个/μl");
    assert.equal((urinalysis.result.match(/红细胞\s*5562个\/μl/gu) || []).length, 1);
  }

  response = await placeOrder(response, journey.caseId, attemptId, "LAB-BL-001");
  assert(outcome(response, "reported", "LAB-BL-001"), `${journey.caseId}:approved_simulated_cbc_missing`);
  assert.equal(response.payload.results[0]?.result, medicalAuthor.items.find((item) => item.caseId === journey.caseId && item.orderId === "LAB-BL-001").finalTerminalText);
  assert.doesNotMatch(JSON.stringify(response.payload), /simulated|provenance|diagnosticEligible|scoringEligible/iu);

  if (journey.caseId === "P001") {
    response = await placeOrder(response, journey.caseId, attemptId, "LAB-UR-002");
    assert(outcome(response, "existing_report", "LAB-UR-002"));
    assert.equal((response.payload.results || []).length, 1);
    response = await call({ action: "exam", caseId: journey.caseId, attemptId, mode: "free", language: "zh", input: "腰部包块" }, response.token);
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.status, "reported");
    assert.equal("provenance" in response.payload, false);
    assert.equal("scoringEligible" in response.payload, false);
    assert.equal("diagnosticEligible" in response.payload, false);
    response = await placeOrder(response, journey.caseId, attemptId, "KUB腹部平片");
    assert(outcome(response, "reported", "IMG-XR-001"));
    assert.match(response.payload.results[0]?.resultId || "", /^TCH-/u);
  }

  if (journey.caseId === "P006") {
    response = await placeOrder(response, journey.caseId, attemptId, "LAB-UR-008");
    assert(outcome(response, "reported", "LAB-UR-008"), "medical-author-approved simulated culture result must be visible");
    assert.equal(response.payload.results[0]?.result, medicalAuthor.items.find((item) => item.caseId === "P006" && item.orderId === "LAB-UR-008").finalTerminalText);
  }

  if (journey.caseId === "P011") {
    response = await placeOrder(response, journey.caseId, attemptId, "LAB-UR-003");
    assert(outcome(response, "reported", "LAB-UR-003"), "P011 urine protein must use the approved split");
    response = await placeOrder(response, journey.caseId, attemptId, "LAB-BL-011");
    assert(outcome(response, "reported", "LAB-BL-011"), "P011 C3 must use the approved source fragment");
    for (const orderId of ["LAB-BL-012", "LAB-BL-003", "IMG-US-001"]) {
      response = await placeOrder(response, journey.caseId, attemptId, orderId);
      const authored = medicalAuthor.items.find((item) => item.caseId === journey.caseId && item.orderId === orderId);
      if (authored?.finalTerminalType === "SIMULATED_REPORT") {
        assert(outcome(response, "reported", orderId), `${journey.caseId}/${orderId}:approved_simulation_missing`);
        assert.equal(response.payload.results[0]?.result, authored.finalTerminalText);
      } else {
        assert(outcome(response, "reported", orderId), `${journey.caseId}/${orderId}:fallback_report_missing`);
        assert.match(response.payload.results[0]?.resultId || "", /^TCH-/u);
      }
    }
  }

  response = await stage(response, journey.caseId, attemptId, "orders", {});
  const evidenceOptions = response.payload.evidenceOptions || [];
  const historyEvidence = evidenceOptions.filter((item) => item.sourceStage === 1);
  const measurementEvidence = evidenceOptions.filter((item) => item.sourceStage === 2);
  assert(historyEvidence.length >= 1);
  assert(measurementEvidence.some((item) => /红细胞|尿常规/u.test(item.label)), `${journey.caseId}:urinalysis_not_in_evidence_graph`);
  if (journey.caseId === "P011") {
    assert.equal(measurementEvidence.length, 3, "only the three explicitly approved P011 results may enter evidence options");
    assert(measurementEvidence.some((item) => /C3|补体/u.test(item.label)), "approved P011 C3 must enter evidence options");
  }
  assert(!evidenceOptions.some((item) => /糖化血红蛋白|梅毒抗体|双侧腰部未触及明显包块/u.test(item.label)));
  const selectedIds = [historyEvidence[0].evidenceId, ...(measurementEvidence[0] ? [measurementEvidence[0].evidenceId] : [])];

  response = await stage(response, journey.caseId, attemptId, "diagnosis", {
    diagnosis: caseData.diagnosis,
    differentials: "感染；结石；肿瘤",
    confirmatoryTests: "尿常规；影像检查",
    evidenceSelections: {
      primary: { diagnosis: caseData.diagnosis, evidenceIds: selectedIds },
      differentials: [
        { diagnosis: "感染", supportEvidenceIds: [selectedIds[0]], opposeEvidenceIds: [] },
        { diagnosis: "结石", supportEvidenceIds: [], opposeEvidenceIds: selectedIds.slice(1) },
        { diagnosis: "肿瘤", supportEvidenceIds: selectedIds.slice(1), opposeEvidenceIds: [] }
      ]
    }
  });
  response = await call({
    action: "mdt", caseId: journey.caseId, attemptId, mode: "free", language: "zh",
    departments: ["影像科"], purpose: "核对病例相关影像问题",
    consultRequests: [{ department: "影像科", purpose: "核对病例相关影像问题", question: "还需补充哪些证据？", evidenceIds: selectedIds }]
  }, response.token);
  assert.equal(response.statusCode, 200);
  response = await stage(response, journey.caseId, attemptId, "consult", {
    consultNeeded: "required", consultDepartments: ["影像科"], consultPurpose: "核对病例相关影像问题", consultQuestions: "还需补充哪些证据？"
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
  assertNoEmptyTrajectoryShells(scored.payload.clinicalTrajectory, journey.caseId);

  const stored = await loadAttempt({
    caseId: journey.caseId, attemptId, token: scored.token,
    requestId: `inspect-${attemptId}`, requestDigest: digest(`inspect-${attemptId}`)
  });
  assert.equal(stored.state.status, "completed");
  assert(!stored.state.evidenceGraph.some((node) => node.provenance === "source_result_semantic_mismatch" && node.eventType === "result_returned"));
  assert(!stored.state.evidenceGraph.some((node) => node.provenance === "source_projection_semantic_mismatch" && node.eventType === "result_returned"));
  assert(!stored.state.evidenceGraph.some((node) => node.provenance === "medical_review_pending" && node.eventType === "result_returned"));
  assert(!stored.state.evidenceGraph.some((node) => /糖化血红蛋白|梅毒抗体/u.test(String(node.result || ""))));
  journeyResults.push({ caseId: journey.caseId, cohort: journey.cohort, completed: true, evidenceNodes: stored.state.evidenceGraph.length });
}

const english = await startStageTwo("P001", "english-stage-1-3", "en");
let englishResponse = await placeOrder(english.response, "P001", english.attemptId, "CBC", "en");
assert(outcome(englishResponse, "reported", "LAB-BL-001"));
assert.equal(englishResponse.payload.results[0]?.result, medicalAuthor.items.find((item) => item.caseId === "P001" && item.orderId === "LAB-BL-001").finalTerminalText);
assert.equal(containsCjk(JSON.stringify(englishResponse.payload)), true, "approved Chinese medical text must not be machine-translated or rewritten");
assert.doesNotMatch(JSON.stringify(englishResponse.payload), /simulated|provenance|diagnosticEligible|scoringEligible/iu);
englishResponse = await stage(englishResponse, "P001", english.attemptId, "orders", {}, "en");
const englishEvidence = englishResponse.payload.evidenceOptions || [];
const englishSelected = englishEvidence.filter((item) => item.sourceStage <= 2).slice(0, 2).map((item) => item.evidenceId);
assert(englishSelected.length >= 1);
englishResponse = await stage(englishResponse, "P001", english.attemptId, "diagnosis", {
  diagnosis: "Bladder tumour",
  differentials: "Infection; stone disease",
  confirmatoryTests: "Urinalysis; imaging",
  evidenceSelections: { primary: { diagnosis: "Bladder tumour", evidenceIds: englishSelected }, differentials: [] }
}, "en");
assert.equal(englishResponse.statusCode, 200);

const conflict = await startStageTwo("P004", "conflict");
const conflictOrder = await placeOrder(conflict.response, "P004", conflict.attemptId, "双肾+输尿管CT平扫+增强");
assert(outcome(conflictOrder, "reported", "IMG-CT-003"));
assert.match(conflictOrder.payload.results[0]?.resultId || "", /^TCH-/u);
assert.equal("provenance" in conflictOrder.payload.results[0], false);

assert.doesNotMatch(JSON.stringify(journeyResults), /undefined|\[object Object\]/iu);
console.log(`DESKTOP_CLINICAL_TRIAGE_RESULT ${JSON.stringify({
  summary,
  sourceProjectionAudit: { audited: 66, retained: 4, withdrawn: 62, withdrawalReasons, pendingMedicalReview: 1023 },
  journeys: journeyResults,
  englishP001StagesCompleted: 3,
  medicalConflictIsolatedBehindTeachingReport: 1
})}`);
