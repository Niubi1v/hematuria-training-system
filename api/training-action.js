const cases = require("../data/cases.json");
const rubrics = require("../data/event_rubrics.json");
const examItems = require("../data/physical_exam_items.json");
const examResults = require("../data/physical_exam_results.json");
const structuredResults = require("../data/order_results_structured.json");
const labs = require("../data/order_catalog_labs.json");
const imaging = require("../data/order_catalog_imaging.json");
const procedures = require("../data/order_catalog_procedures.json");
const perioperative = require("../data/order_catalog_perioperative.json");
const mdtTriggers = require("../data/mdt_triggers.json");
const consultCatalog = require("../data/consult_catalog.json");
const patientSlots = require("../data/patient_slots_bilingual.json");
const { matchHistoryQuestion, normalize, validateStage } = require("../server/clinicalAssessment.js");
const { advanceAttemptToken, appendEvents, createAttemptState, normalizeAttemptMode, signAttemptState, verifyAttemptState } = require("../server/trainingState.js");
const {
  buildClinicalTrajectory,
  clearLearnerDiagnosisRelations,
  ensureEvidenceGraph,
  evidenceNodeForEvent,
  pruneEvidenceGraph,
  recordDiagnosisRelations,
  safeText,
  studentEvidenceOptions,
  syncEvidenceEvents,
  validateEvidenceIds
} = require("../server/evidenceGraph.js");
const { commitAttempt, digest, loadAttempt, registerAttempt } = require("../server/trainingAttemptStore.js");
const { desktopClinicalContent } = require("../server/desktopClinicalContentProjection.js");
const { assessClinicalResult } = require("../shared/clinicalResultSemantics.js");
const { sanitizeClinicalTrajectory } = require("../shared/clinicalTrajectoryPresentation.js");
const { BILINGUAL_CONFLICT_REASON, filterQuarantinedEvents } = require("../server/bilingualConflictQuarantine.js");
const { setServerTiming } = require("../server/performanceTiming.js");
const { parseJsonBody } = require("../server/requestSecurity.js");
const {
  buildStudentOrderCatalog,
  orderApplicableForSex,
  orderResultIsReportable,
  presentExamResult,
  presentMatchedOrder,
  presentOrderCatalogItem,
  presentOrderResult,
  simulatedPhysicalExamResult,
  splitOrderInput,
  sourceOrderId
} = require("../shared/dataAgentPresentation.js");

const sourceCatalog = [...labs, ...imaging, ...procedures, ...perioperative];
const catalog = buildStudentOrderCatalog(sourceCatalog);
const allowedActions = new Set(["init-attempt", "validate-attempt", "history-log", "exam", "order", "mdt", "stage-feedback", "score"]);
const stageNumbers = { history: 1, orders: 2, diagnosis: 3, consult: 4, treatment: 5, perioperative: 6, debrief: 7 };
const requests = globalThis.__hematuriaTrainingRate || new Map();
globalThis.__hematuriaTrainingRate = requests;

function allowedOrigins() {
  return String(process.env.TRAINING_API_ALLOWED_ORIGINS || process.env.AGENT_API_ALLOWED_ORIGIN || "https://niubi1v.github.io")
    .split(",").map((item) => item.trim()).filter(Boolean);
}

function sameOriginRequest(req, origin) {
  if (!origin) return false;
  try {
    const host = String(req.headers?.["x-forwarded-host"] || req.headers?.host || "").split(",")[0].trim();
    const protocol = String(req.headers?.["x-forwarded-proto"] || "https").split(",")[0].trim();
    const url = new URL(origin);
    return Boolean(host) && url.host === host && url.protocol === `${protocol}:`;
  } catch {
    return false;
  }
}

function setCors(req, res) {
  const origin = String(req.headers?.origin || "");
  const accepted = !origin || allowedOrigins().includes(origin) || sameOriginRequest(req, origin);
  if (origin && accepted) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Expose-Headers", "X-Training-State, Server-Timing, X-Hematuria-Timing");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Training-State, X-Request-Id, X-Idempotency-Key");
  return accepted;
}

function rateLimited(req) {
  const key = String(req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0];
  const now = Date.now();
  const recent = (requests.get(key) || []).filter((at) => at > now - 60_000);
  if (!requests.has(key) && requests.size >= 5000) requests.delete(requests.keys().next().value);
  recent.push(now);
  requests.set(key, recent);
  return recent.length > Number(process.env.TRAINING_API_RATE_LIMIT_PER_MINUTE || 90);
}

function findCase(caseId) {
  return cases.find((item) => String(item.id).toLowerCase() === String(caseId).toLowerCase());
}

function assertFormalAllowed(caseData) {
  if (process.env.TRAINING_DEPLOYMENT_TIER !== "formal") throw new Error("formal_attempts_disabled");
  if (!["reviewed", "approved"].includes(caseData.medicalReview?.status)) throw new Error("case_not_clinically_approved");
  if (caseData.medicalReviewImport?.formalUseAllowed !== true) throw new Error("case_formal_use_not_allowed");
}

function requestHeader(req, name) {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function requestIdentity(req, body) {
  const requestId = String(body.requestId || requestHeader(req, "x-idempotency-key") || "").replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 160);
  return { requestId, requestDigest: digest(stableJson(body)) };
}

function sendStored(res, stored) {
  if (stored.token) res.setHeader("X-Training-State", stored.token);
  return res.status(stored.statusCode || 200).json(stored.payload);
}

async function commitResponse(res, { state, previousToken, requestId, requestDigest, payload, statusCode = 200 }) {
  advanceAttemptToken(state);
  const nextToken = signAttemptState(state);
  const stored = await commitAttempt({ state, previousToken, nextToken, requestId, requestDigest, payload, statusCode });
  return sendStored(res, stored);
}

function requiredStage(action, body) {
  if (action === "history-log") return 1;
  if (action === "exam" || action === "order") return 2;
  if (action === "mdt") return 4;
  if (action === "stage-feedback") return stageNumbers[body.stageKey] || 0;
  if (action === "score") return 8;
  return 0;
}

function assertStageUnlocked(state, action, body) {
  const required = requiredStage(action, body);
  if (!required) throw new Error(action === "stage-feedback" ? "invalid_stage" : "stage_not_unlocked");
  const current = Number(state.currentStage || 1);
  const isResubmission = action === "stage-feedback" && Boolean(state.submissions?.[body.stageKey]);
  const allowed = action === "stage-feedback"
    ? required === current || (required < current && isResubmission)
    : required === current;
  if (!allowed) {
    throw new Error("stage_not_unlocked");
  }
}

function reconcileSubmittedHistory(caseData, state, submission, at) {
  const questions = Array.isArray(submission?.askedQuestions)
    ? submission.askedQuestions.filter((item) => typeof item === "string" && item.trim()).slice(0, 64).map((item) => item.trim().slice(0, 500))
    : [];
  if (!questions.length) return;
  const matchedEvents = questions.flatMap((question, questionIndex) => matchHistoryQuestion(caseData.id, question, at, `${state.sequence + 1}-submit-${questionIndex}`));
  const quarantine = filterQuarantinedEvents(caseData.id, matchedEvents);
  if (quarantine.quarantinedSlotIds.length) {
    console.warn("training_fact_quarantined", { caseId: caseData.id, slotIds: quarantine.quarantinedSlotIds, reason: BILINGUAL_CONFLICT_REASON });
  }
  const existingSlotIds = new Set(state.events.filter((event) => event.type === "slot_answered" && event.slotId).map((event) => event.slotId));
  const reconciled = quarantine.events.filter((event) => {
    if (!event.slotId || existingSlotIds.has(event.slotId)) return false;
    existingSlotIds.add(event.slotId);
    return true;
  });
  appendClinicalEvents(state, caseData.id, reconciled, Object.fromEntries(reconciled.map((event) => [event.eventId, {
    triggerAction: "patient_interview",
    rawQuestion: event.text,
    result: languageForState(state) === "en" ? `Patient-reported evidence collected for ${event.slotId}.` : `已采集患者自述证据：${event.slotId}。`,
    provenance: "case_truth_ontology"
  }])));
}

function languageForState(state) {
  return state?.language === "en" ? "en" : "zh";
}

function resolveOrders(input, sex) {
  const segments = splitOrderInput(input);
  const matches = segments.map((part) => {
    const key = normalize(part);
    const legacyExact = sourceCatalog.find((item) => String(item.orderId).toLowerCase() === String(part).toLowerCase());
    const order = legacyExact || catalog.find((item) => String(item.orderId).toLowerCase() === String(part).toLowerCase()
      || [item.displayName, ...(item.synonyms || [])].some((name) => normalize(name) === key));
    return order && orderApplicableForSex(order, sex) ? { input: part, order } : { input: part };
  });
  const orders = matches.flatMap((item) => item.order ? [item.order] : [])
    .filter((item, index, all) => all.findIndex((other) => sourceOrderId(other) === sourceOrderId(item)) === index);
  return { segments, matches, orders };
}

function physicalExamApplicable(item, sex) {
  if (!item) return false;
  if (item.examId.startsWith("PE2")) return sex !== "女";
  if (item.examId.startsWith("PE3")) return sex !== "男";
  return true;
}

function handleExam(caseData, input, language) {
  const exact = normalize(input);
  const item = examItems.find((candidate) => [candidate.displayName, ...(candidate.synonyms || [])].some((name) => normalize(name) === exact)
    && physicalExamApplicable(candidate, caseData.sex));
  const configured = item && examResults.find((result) => result.caseId === caseData.id && result.examId === item.examId && result.studentVisibleAfterSelection);
  const triaged = item && !configured ? desktopClinicalContent({
    caseId: caseData.id,
    itemIds: [item.examId],
    displayName: item.displayName
  }) : null;
  const simulated = item && !configured && !triaged ? simulatedPhysicalExamResult(item, language) : null;
  const sourceResult = configured?.result || triaged?.result || simulated?.result || "";
  const presented = presentExamResult(sourceResult, language);
  const reported = Boolean(sourceResult);
  const reviewMessage = language === "en"
    ? "This result is awaiting medical content review and is excluded from diagnosis and scoring for this attempt."
    : "该项目等待医学审核，本次训练不将其作为诊断、治疗或评分依据。";
  return {
    input, examId: item?.examId, at: new Date().toISOString(),
    result: reported ? presented.text : reviewMessage,
    status: reported ? "reported" : "medical_review_pending",
    translationStatus: configured || triaged ? presented.translationStatus : simulated ? "policy_approved_simulation" : "not_available",
    provenance: configured ? "configured_case_result" : triaged?.provenance || simulated?.provenance || "medical_review_pending",
    scoringEligible: Boolean(configured),
    diagnosticEligible: configured ? true : triaged?.diagnosticEligible === true,
    affectsDiagnosis: configured ? true : triaged?.affectsDiagnosis ?? simulated?.affectsDiagnosis ?? false,
    affectsScore: configured ? true : false,
    reviewStatus: triaged?.reviewerStatus || simulated?.reviewerStatus || (reported ? "not_required" : "pending_human_medical_review"),
    ...(simulated || {}),
    ...(triaged ? { triageClassification: triaged.classification } : {})
  };
}

function appendClinicalEvents(state, caseId, events, contextByEventId = {}) {
  appendEvents(state, events);
  syncEvidenceEvents(state, caseId, events, contextByEventId);
  return state;
}

function submissionSummary(stageKey, submission, language) {
  const value = (field) => safeText(submission?.[field], 600);
  const labels = language === "en"
    ? { history: "History submitted", orders: "Investigations submitted", diagnosis: "Diagnosis submitted", consult: "Consultation submitted", treatment: "Treatment orders submitted", perioperative: "Perioperative plan submitted", debrief: "Reflection submitted" }
    : { history: "已提交病史阶段", orders: "已提交检查阶段", diagnosis: "已提交诊断", consult: "已提交会诊", treatment: "已提交治疗医嘱", perioperative: "已提交围术期方案", debrief: "已提交复盘" };
  const details = ({
    diagnosis: [value("diagnosis"), value("differentials"), value("confirmatoryTests")],
    consult: [value("consultDepartments"), value("consultPurpose"), value("consultQuestions")],
    treatment: [value("immediateTreatment"), value("admissionTreatment"), value("definitiveTreatment"), value("followUp")],
    perioperative: [value("perioperativePreparation")]
  })[stageKey] || [];
  return safeText([labels[stageKey] || stageKey, ...details].filter(Boolean).join("："), 900);
}

function submissionEvent(state, stageKey, submission, language, at) {
  const stageNo = stageNumbers[stageKey];
  return {
    eventId: `srv-${state.sequence + 1}-submission-${stageKey}`,
    type: "submission_recorded",
    actionId: stageKey,
    stageNo,
    at,
    text: submissionSummary(stageKey, submission, language),
    metadata: { validated: false, provenance: "learner_submission" }
  };
}

function diagnosisSelections(submission) {
  const value = submission?.evidenceSelections;
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function trustedEvidenceText(state, evidenceIds, caseData, language) {
  const ids = validateEvidenceIds(state, evidenceIds || [], { sourceStages: [1, 2] });
  const nodes = new Map((state.evidenceGraph || []).map((node) => [node.evidenceId, node]));
  const row = rubrics.find((item) => item.caseId === caseData.id);
  const requirements = (row?.dimensions || []).flatMap((dimension) => dimension.requirements);
  return ids.map((id) => {
    const node = nodes.get(id);
    const labels = (node?.rubricMappings || []).map((mapping) => requirements.find((requirement) => requirement.id === mapping))
      .filter(Boolean).map((requirement) => publicRequirementLabel(requirement, language));
    const patientFact = node?.sourceStage === 1 ? patientSlots[caseData.id]?.[node.canonicalFactOrAction] : null;
    const questionTriggeredPatientResult = patientFact
      ? safeText(language === "en" ? patientFact.patientAnswerEn : patientFact.patientAnswerZh, 300)
      : "";
    const releasedResult = node?.sourceStage === 2 && node?.eventType === "result_returned" ? node.result : "";
    return [...new Set([...labels, node?.canonicalFactOrAction, questionTriggeredPatientResult, releasedResult].filter(Boolean))].join("：");
  }).join("；");
}

function enrichDiagnosisSubmission(state, submission, caseData, language) {
  const selections = diagnosisSelections(submission);
  if (!selections) return submission;
  const primaryEvidenceIds = validateEvidenceIds(state, selections.primary?.evidenceIds || [], { sourceStages: [1, 2] });
  const differentials = Array.isArray(selections.differentials) ? selections.differentials.slice(0, 3) : [];
  const differentialEvidence = differentials.map((row) => [
    trustedEvidenceText(state, row?.supportEvidenceIds || [], caseData, language),
    trustedEvidenceText(state, row?.opposeEvidenceIds || [], caseData, language)
  ].filter(Boolean).join("；")).join("；");
  return {
    ...submission,
    diagnosticEvidence: trustedEvidenceText(state, primaryEvidenceIds, caseData, language),
    differentialAnalysis: differentialEvidence || submission.differentialAnalysis
  };
}

function attachDiagnosisEvidenceIds(events, submission) {
  const selections = diagnosisSelections(submission);
  if (!selections) return events;
  const differentials = Array.isArray(selections.differentials) ? selections.differentials.slice(0, 3) : [];
  return events.map((event) => {
    let evidenceIds = [];
    if (event.type === "diagnosis_supported" && event.actionId === "primary") evidenceIds = selections.primary?.evidenceIds || [];
    const differentialMatch = /^differential_(\d+)$/.exec(String(event.actionId || ""));
    if (differentialMatch) {
      const row = differentials[Number(differentialMatch[1]) - 1] || {};
      evidenceIds = [...(row.supportEvidenceIds || []), ...(row.opposeEvidenceIds || [])];
    }
    return evidenceIds.length ? { ...event, metadata: { ...(event.metadata || {}), evidenceIds: [...new Set(evidenceIds)] } } : event;
  });
}

function handleOrder(caseData, input, previousOrderIds, language) {
  const resolution = resolveOrders(input, caseData.sex);
  const resolvedOrders = resolution.orders;
  const unavailableOrders = language === "en"
    ? resolvedOrders.filter((item) => !presentOrderCatalogItem(item, language).translationAvailable)
    : [];
  const orders = resolvedOrders.filter((item) => !unavailableOrders.includes(item));
  const previous = new Set(previousOrderIds);
  const duplicateOrderIds = orders.map(sourceOrderId).filter((id) => previous.has(id));
  const available = new Set([...previous, ...orders.map(sourceOrderId)]);
  const sourceRows = orders.flatMap((order) => {
    const result = structuredResults.find((item) => item.caseId === caseData.id && item.orderId === sourceOrderId(order));
    return result ? [{ order, result }] : [];
  });
  const sourceRowsByOrderId = new Map(sourceRows.map((item) => [sourceOrderId(item.order), item.result]));
  const sourceAssessmentByOrderId = new Map(sourceRows.map(({ order, result }) => {
    const canonicalId = sourceOrderId(order);
    return [canonicalId, assessClinicalResult({
      domain: String(order.primaryCategory || "") === "检验" ? "laboratory" : "",
      itemId: canonicalId,
      displayName: order.displayName,
      result: [result.value, result.impression, result.result].filter(Boolean).join("\n")
    })];
  }));
  const triageRowsByOrderId = new Map(orders.map((order) => {
    const canonicalId = sourceOrderId(order);
    const triaged = desktopClinicalContent({
      caseId: caseData.id,
      itemIds: [order.catalogId, order.orderId, canonicalId],
      displayName: order.displayName
    });
    return [canonicalId, triaged];
  }));
  const triageAssessmentByOrderId = new Map(orders.map((order) => {
    const canonicalId = sourceOrderId(order);
    const triaged = triageRowsByOrderId.get(canonicalId);
    return [canonicalId, triaged?.classification === "source_projection" ? assessClinicalResult({
      domain: triaged.domain,
      itemId: canonicalId,
      displayName: order.displayName,
      result: triaged.result,
      projection: true
    }) : null];
  }));
  const reportable = sourceRows.filter(({ order, result }) => orderResultIsReportable(result)
    && sourceAssessmentByOrderId.get(sourceOrderId(order))?.compatible === true);
  const unmetPrerequisites = [...new Set(sourceRows.flatMap(({ result }) => (result.prerequisites || []).filter((id) => !available.has(id))))];
  const acceptedOrderIds = orders.filter((order) => {
    const canonicalId = sourceOrderId(order);
    if (duplicateOrderIds.includes(canonicalId)) return false;
    const result = sourceRowsByOrderId.get(canonicalId);
    return !result || (result.prerequisites || []).every((id) => available.has(id));
  }).map(sourceOrderId);
  const pendingPrerequisiteOrderIds = orders
    .filter((order) => !duplicateOrderIds.includes(sourceOrderId(order))
      && !acceptedOrderIds.includes(sourceOrderId(order)))
    .map(sourceOrderId);
  const configuredResults = reportable.filter(({ order }) => acceptedOrderIds.includes(sourceOrderId(order))).map(({ order, result }) => ({
      caseId: caseData.id,
      orderId: sourceOrderId(order),
      resultId: result.resultId,
      status: result.status,
      ...presentOrderResult(order, result, language),
      provenance: "configured_case_result",
      scoringEligible: true,
      teachingExplanation: language === "en" ? "Released only for this exact case and placed order." : "仅按当前病例与已开立医嘱精确释放。"
    }));
  const configuredResultOrderIds = new Set(configuredResults.map((item) => item.orderId));
  const projectedResults = orders.flatMap((order) => {
    const canonicalId = sourceOrderId(order);
    const sourceResult = sourceRowsByOrderId.get(canonicalId);
    const triaged = triageRowsByOrderId.get(canonicalId);
    const triageAssessment = triageAssessmentByOrderId.get(canonicalId);
    if (!acceptedOrderIds.includes(canonicalId)
      || configuredResultOrderIds.has(canonicalId)
      || sourceResult?.status === "not_performed"
      || triaged?.classification !== "source_projection"
      || triageAssessment?.compatible !== true) return [];
    const projected = {
      caseId: caseData.id,
      orderId: canonicalId,
      resultId: `TRIAGE-${caseData.id}-${triaged.itemId}`,
      status: "final",
      value: triaged.result,
      result: triaged.result,
      unit: "",
      referenceRange: "",
      impression: "",
      abnormalFlags: [],
      prerequisites: []
    };
    return [{
      ...presentOrderResult(order, projected, language),
      provenance: "case_source_projection",
      scoringEligible: false,
      diagnosticEligible: true,
      affectsScore: false,
      sourceMatchSha256: triaged.sourceMatchSha256,
      teachingExplanation: language === "en"
        ? "Released from a mechanically verified case-source projection; excluded from scoring."
        : "由病例 source 机械一致性核验后逐项释放，不参与评分。"
    }];
  });
  const results = [...configuredResults, ...projectedResults];
  const orderOutcomes = resolution.matches.map(({ input: requestedName, order }) => {
    if (!order) {
      return {
        orderId: "",
        displayName: requestedName,
        status: "unrecognized",
        provenance: "not_provided",
        message: language === "en"
          ? `${requestedName}: no canonical order match was found. Check the order name.`
          : `${requestedName}：未匹配到规范医嘱，请核对项目名称。`
      };
    }
    const canonicalId = sourceOrderId(order);
    const displayName = presentMatchedOrder(order, language).displayName;
    if (unavailableOrders.includes(order)) {
      return {
        orderId: canonicalId, displayName, status: "unavailable", provenance: "review_required",
        message: "This order is unavailable until its English name has been reviewed."
      };
    }
    if (duplicateOrderIds.includes(canonicalId)) {
      return {
        orderId: canonicalId, displayName, status: "duplicate", provenance: "configured_case_result",
        message: language === "en" ? `${displayName}: already ordered; no duplicate report was released.` : `${displayName}：已开立过，本次不重复释放报告。`
      };
    }
    const result = sourceRowsByOrderId.get(canonicalId);
    const triaged = triageRowsByOrderId.get(canonicalId);
    const sourceAssessment = sourceAssessmentByOrderId.get(canonicalId);
    const triageAssessment = triageAssessmentByOrderId.get(canonicalId);
    const missingPrerequisites = (result?.prerequisites || []).filter((id) => !available.has(id));
    if (missingPrerequisites.length) {
      return {
        orderId: canonicalId, displayName, status: "prerequisite_missing", provenance: "configured_case_result",
        message: language === "en"
          ? `${displayName}: prerequisite missing (${missingPrerequisites.join(", ")}); the report remains locked.`
          : `${displayName}：缺少前置条件（${missingPrerequisites.join("、")}），暂不释放报告。`
      };
    }
    if (orderResultIsReportable(result) && sourceAssessment?.compatible !== true) {
      return {
        orderId: canonicalId, displayName, status: "medical_review_pending", provenance: "source_result_semantic_mismatch",
        reviewStatus: "pending_human_medical_review", reviewReason: sourceAssessment?.reason || "order_result_semantic_mismatch",
        scoringEligible: false, diagnosticEligible: false,
        message: language === "en"
          ? `${displayName}: the source result does not map safely to this examination and remains isolated pending medical review.`
          : `${displayName}：现有 source 结果无法安全归属于该检查，等待医学审核；当前不进入诊断、治疗或评分证据。`
      };
    }
    if (orderResultIsReportable(result)) {
      return {
        orderId: canonicalId, displayName, status: "reported", provenance: "configured_case_result", resultId: result.resultId,
        message: language === "en" ? `${displayName}: the case-source report was returned.` : `${displayName}：已返回病例现有 source 报告。`
      };
    }
    if (result?.status === "not_performed") {
      return {
        orderId: canonicalId, displayName, status: "not_performed", provenance: "source_not_performed",
        scoringEligible: false, diagnosticEligible: false, possibleUnnecessary: true,
        message: language === "en"
          ? `${displayName}: this examination was not performed in the case, so no report exists.`
          : `${displayName}：本病例未实施该项目，因此无报告。`
      };
    }
    if (triaged?.classification === "source_projection" && triageAssessment?.compatible !== true) {
      return {
        orderId: canonicalId, displayName, status: "medical_review_pending", provenance: "source_projection_semantic_mismatch",
        reviewStatus: "pending_human_medical_review", reviewReason: triageAssessment?.reason || "order_result_semantic_mismatch",
        scoringEligible: false, diagnosticEligible: false,
        message: language === "en"
          ? `${displayName}: this source projection was withdrawn after semantic review and remains isolated from diagnosis, treatment, and scoring.`
          : `${displayName}：该 source projection 经语义复核后已撤回，等待医学审核；当前不进入诊断、治疗或评分证据。`
      };
    }
    if (triaged?.classification === "source_projection") {
      const projected = projectedResults.find((item) => item.orderId === canonicalId);
      return {
        orderId: canonicalId, displayName, status: "reported", provenance: "case_source_projection",
        resultId: projected?.resultId,
        scoringEligible: false, diagnosticEligible: true,
        message: language === "en"
          ? `${displayName}: a mechanically verified case-source projection was returned.`
          : `${displayName}：已返回经 source 机械一致性核验的病例结果。`
      };
    }
    if (triaged?.classification === "no_specimen") {
      const pathology = triaged.domain === "pathology" || /病理|活检|标本/u.test(String(triaged.displayName || ""));
      return {
        orderId: canonicalId, displayName, status: "no_specimen", provenance: triaged.provenance,
        scoringEligible: false, diagnosticEligible: false, possibleUnnecessary: true,
        message: language === "en"
          ? `${displayName}: no specimen was collected, so no report exists.`
          : pathology
            ? `${displayName}：未取材，因此无病理报告。`
            : `${displayName}：本病例未采集该标本，因此无结果。`
      };
    }
    if (triaged?.classification === "no_indication") {
      return {
        orderId: canonicalId, displayName, status: "no_indication", provenance: triaged.provenance,
        scoringEligible: false, diagnosticEligible: false, possibleUnnecessary: true,
        message: language === "en"
          ? `${displayName}: there is no clear indication in this case; the examination was not performed and no report exists.`
          : `${displayName}：当前病例无明确开立适应证；本病例未实施该检查，因此无报告。`
      };
    }
    if (triaged?.classification === "medical_conflict" || triaged?.classification === "medical_review_pending") {
      return {
        orderId: canonicalId, displayName, status: "medical_review_pending", provenance: triaged.provenance,
        reviewStatus: "pending_human_medical_review", scoringEligible: false, diagnosticEligible: false,
        message: language === "en"
          ? `${displayName}: the case-specific result is awaiting medical review and remains isolated from diagnosis, treatment, and scoring.`
          : `${displayName}：等待医学审核，当前不进入诊断、治疗或评分证据。`
      };
    }
    return {
      orderId: canonicalId,
      displayName,
      status: "medical_review_pending",
      provenance: result?.status === "not_available" ? "source_not_available" : "medical_review_pending",
      reviewStatus: "pending_human_medical_review",
      scoringEligible: false,
      diagnosticEligible: false,
      message: language === "en"
        ? `${displayName}: the result is awaiting medical content review and is excluded from diagnosis, treatment, and scoring for this attempt.`
        : `${displayName}：等待医学审核，当前不进入诊断、治疗或评分证据。`
    };
  });
  const at = new Date().toISOString();
  const noSpecimenCount = orderOutcomes.filter((item) => item.status === "no_specimen").length;
  const noIndicationCount = orderOutcomes.filter((item) => item.status === "no_indication").length;
  const notPerformedCount = orderOutcomes.filter((item) => item.status === "not_performed").length;
  const medicalReviewPendingCount = orderOutcomes.filter((item) => item.status === "medical_review_pending").length;
  const unrecognizedCount = orderOutcomes.filter((item) => item.status === "unrecognized").length;
  return {
    id: `${caseData.id}-${Date.now()}`, input, matched: orders.length > 0,
    matchedOrders: orders.map((item) => presentMatchedOrder(item, language)), results, orderOutcomes,
    duplicateOrderIds, acceptedOrderIds, pendingPrerequisiteOrderIds, unmetPrerequisites,
    unavailableOrderCount: unavailableOrders.length,
    selectedOrderCount: resolution.segments.length,
    recognizedOrderCount: orders.length, returnedReportCount: results.length, at, placedAt: at, stageNo: 2,
    status: results.length ? "reported" : "no-result",
    message: language === "en"
      ? `${orders.length} order(s) recognized: ${results.length} report(s) returned, ${noIndicationCount} without a clear indication, ${notPerformedCount} not performed, ${noSpecimenCount} without a specimen, and ${medicalReviewPendingCount} awaiting medical review${unrecognizedCount ? `, ${unrecognizedCount} unrecognized` : ""}. See each order below.`
      : `已识别${orders.length}项医嘱：返回${results.length}项报告，${noIndicationCount}项无明确适应证，${notPerformedCount}项未实施，${noSpecimenCount}项未取材，${medicalReviewPendingCount}项等待医学审核${unrecognizedCount ? `，${unrecognizedCount}项未识别` : ""}。请查看逐项状态。`
  };
}

function isPrimaryUrologyDepartment(value) {
  return /泌尿外科|urology/i.test(String(value || ""));
}

function externalConsultDepartments(value) {
  return String(value || "")
    .split(/[；;、,，\n]/)
    .map((item) => item.trim())
    .filter((item) => item && !isPrimaryUrologyDepartment(item))
    .join("；");
}

function normalizeConsultDepartment(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function expectedConsultDepartmentSet(value) {
  const source = normalizeConsultDepartment(value);
  const expected = new Set();
  for (const item of consultCatalog) {
    const department = String(item?.department || "").trim();
    if (!department || isPrimaryUrologyDepartment(department)) continue;
    const aliases = [department, ...department.split("/")]
      .map(normalizeConsultDepartment)
      .filter(Boolean);
    if (aliases.some((alias) => source.includes(alias))) {
      expected.add(normalizeConsultDepartment(department));
    }
  }
  return expected;
}

function validatedConsultRequests(state, consultRequests) {
  if (!Array.isArray(consultRequests)) return consultRequests;
  return consultRequests.slice(0, 20).map((item) => ({
    ...item,
    evidenceIds: validateEvidenceIds(state, item?.evidenceIds || [], { maximum: 30, sourceStages: [1, 2, 3] })
  }));
}

function handleMdt(caseData, departments, purpose, language, consultRequests) {
  const trigger = mdtTriggers.find((item) => item.caseId === caseData.id);
  const expected = [caseData.clinical?.consultDepartments, trigger?.departments].filter(Boolean).join("；");
  const expectedDepartments = expectedConsultDepartmentSet(expected);
  const normalizedRequests = Array.isArray(consultRequests) && consultRequests.length
    ? consultRequests
      .filter((item) => item && !isPrimaryUrologyDepartment(item.department))
      .map((item) => ({
        department: String(item.department || "").trim().slice(0, 80),
        purpose: String(item.purpose || "").trim().slice(0, 500),
        question: String(item.question || "").trim().slice(0, 500),
        evidenceIds: Array.isArray(item.evidenceIds)
          ? item.evidenceIds.map((value) => String(value || "").trim()).filter(Boolean).slice(0, 30)
          : [],
        evidence: Array.isArray(item.evidence)
          ? item.evidence.map((value) => String(value || "").trim().slice(0, 300)).filter(Boolean).slice(0, 30)
          : []
      }))
      .filter((item) => item.department)
    : (departments || [])
      .filter((department) => !isPrimaryUrologyDepartment(department))
      .map((department) => ({
        department: String(department || "").trim().slice(0, 80),
        purpose: String(purpose || "").trim().slice(0, 500),
        question: String(purpose || "").trim().slice(0, 500),
        evidenceIds: [],
        evidence: []
      }))
      .filter((item) => item.department);
  const accepted = normalizedRequests.map((item) => item.department)
    .filter((department) => expectedDepartments.has(normalizeConsultDepartment(department)));
  const focused = normalizedRequests.length > 0 && normalizedRequests.every((item) => item.purpose.length >= 6 && item.question.length >= 6);
  const evidenceProvided = normalizedRequests.length > 0 && normalizedRequests.every((item) => item.evidenceIds.length > 0 || item.evidence.length > 0);
  const referenceIntegration = String(trigger?.purpose || caseData.clinical?.consultQuestions || "").trim();
  const opinions = normalizedRequests.map((item) => {
    const isExpected = expectedDepartments.has(normalizeConsultDepartment(item.department));
    const evidenceCount = item.evidenceIds.length || item.evidence.length;
    return {
      department: item.department,
      opinion: language === "en"
        ? `${item.department} can address the submitted question: ${item.question || item.purpose}. ${evidenceCount} collected evidence item(s) accompanied the request.`
        : `${item.department}可围绕“${item.question || item.purpose}”解决本次会诊问题；会诊单已附${evidenceCount}条已采集证据。`,
      questions: [item.question || item.purpose].filter(Boolean),
      expertJudgment: language === "en"
        ? "The opinion is limited to the evidence already released in this attempt."
        : "会诊意见仅依据本次训练已释放且已随单提供的证据。",
      neededInfo: language === "en"
        ? `Add objective history, examination, laboratory, or imaging evidence still needed to resolve: ${item.question || item.purpose}. Do not use unreleased results.`
        : `建议围绕“${item.question || item.purpose}”补充尚未获得的客观病史、查体、检验或影像证据，不得使用未释放结果。`,
      suggestedHandling: referenceIntegration || (language === "en" ? "Integrate the consultation around the submitted purpose and released evidence." : "围绕会诊目的和已释放证据形成整合意见。"),
      riskReminder: language === "en"
        ? "A consultation cannot replace emergency assessment or evidence-based decisions."
        : "会诊不能替代急症识别，也不能替代基于病例证据的诊疗决策。",
      residentQuestion: item.question || item.purpose,
      necessity: isExpected
        ? (language === "en" ? "Relevant to this case at the current stage." : "与本病例当前阶段相关，建议会诊。")
        : (language === "en" ? "Not routinely required from the current evidence; reconsider if a specific trigger emerges." : "依据当前证据并非常规必需；出现明确触发条件时再考虑。"),
      mdtIntegration: referenceIntegration || (language === "en" ? "Use the submitted purpose and released evidence for MDT integration." : "以提交的会诊目的和已释放证据形成MDT整合。"),
      evidenceIds: item.evidenceIds
    };
  });
  return { opinions, accepted, focused, evidenceProvided, requests: normalizedRequests };
}

function allocate(max, count, index) {
  const base = Math.floor(max / count);
  return base + (index < max - base * count ? 1 : 0);
}

const publicRequirementLabels = Object.freeze({
  hematuria_onset: ["血尿起病时间", "Onset of haematuria"],
  hematuria_frequency: ["血尿发作频率", "Frequency of haematuria"],
  hematuria_visibility: ["肉眼或镜下血尿", "Visible or microscopic haematuria"],
  urine_color: ["尿液颜色", "Urine colour"],
  hematuria_phase: ["血尿时相", "Timing within urination"],
  clots: ["血块情况", "Blood clots"],
  pain: ["疼痛情况", "Pain assessment"],
  flank_pain: ["腰腹部疼痛", "Flank or abdominal pain"],
  dysuria: ["尿痛", "Dysuria"],
  urinary_frequency: ["尿频", "Urinary frequency"],
  urinary_urgency: ["尿急", "Urinary urgency"],
  voiding_difficulty: ["排尿困难", "Voiding difficulty"],
  retention: ["尿潴留", "Urinary retention"],
  fever_chills: ["发热与寒战", "Fever and chills"],
  glomerular_features: ["肾小球性线索", "Glomerular features"],
  recent_uri: ["近期感染史", "Recent infection"],
  triggers: ["诱因", "Potential triggers"],
  smoking: ["吸烟史", "Smoking history"],
  occupation_exposure: ["职业暴露", "Occupational exposure"],
  family_history: ["家族史", "Family history"],
  tumor_history: ["肿瘤史", "Cancer history"],
  stone_history: ["结石史", "Stone history"],
  uti_history: ["尿路感染史", "Urinary infection history"],
  surgery_history: ["手术史", "Surgical history"],
  urinary_procedure_history: ["泌尿系操作史", "Prior urinary procedures"],
  medications: ["用药史", "Medication history"],
  anticoagulant: ["抗凝药使用", "Anticoagulant use"],
  antiplatelet: ["抗血小板药使用", "Antiplatelet use"],
  bleeding_tendency: ["出血倾向", "Bleeding tendency"],
  gynecologic_contamination: ["妇科来源排查", "Possible gynaecologic source"],
  primary: ["最可能诊断及依据", "Most likely diagnosis and evidence"],
  confirmation: ["进一步检查计划", "Additional investigation plan"],
  department: ["会诊科室", "Consulting specialty"],
  trigger: ["会诊必要性", "Reason consultation is needed"],
  question: ["希望会诊解决的问题", "Question for the consulting team"],
  evidence: ["提供给会诊方的证据", "Evidence supplied for consultation"],
  immediate: ["急诊或入院处理", "Emergency or admission management"],
  etiologic: ["病因与基础处理", "Aetiologic and supportive management"],
  definitive: ["确定性治疗计划", "Definitive treatment plan"],
  followup: ["出院与随访", "Discharge and follow-up"],
  education: ["患者教育", "Patient education"],
  perioperative: ["围术期管理要点", "Perioperative management"],
  quality: ["学习反思", "Learning reflection"]
});

function publicRequirementLabel(requirement, language) {
  const key = String(requirement?.key || "");
  const fixed = publicRequirementLabels[key];
  if (fixed) return fixed[language === "en" ? 1 : 0];
  if (requirement?.eventType === "order_placed" && key) {
    const order = catalog.find((item) => sourceOrderId(item) === key);
    if (order) return presentMatchedOrder(order, language).displayName;
  }
  if (requirement?.eventType === "physical_exam_performed" && key) {
    const exam = examItems.find((item) => item.examId === key);
    if (exam) return language === "en"
      ? ({ PE001: "Temperature", PE002: "Blood pressure" }[key] || "Case-relevant physical examination")
      : exam.displayName;
  }
  if (requirement?.eventType === "diagnosis_supported") return language === "en" ? "Differential diagnoses and evidence" : "鉴别诊断及支持或不支持证据";
  if (requirement?.eventType === "physical_exam_performed") return language === "en" ? "Case-relevant physical examination" : "病例针对性查体";
  if (requirement?.eventType === "result_returned") return language === "en" ? "Appropriate use of released results" : "合理利用已释放检查结果";
  return language === "en" ? "Case-relevant clinical requirement" : "病例相关临床要点";
}

function score(caseId, events, language, evidenceGraph = []) {
  const row = rubrics.find((item) => item.caseId === caseId);
  if (!row) throw new Error("missing_scoring_rubric");
  const requiredOrderIds = new Set((row.dimensions.find((item) => item.id === "orders")?.requirements || []).map((item) => item.key).filter(Boolean));
  const duplicates = events.filter((event) => event.type === "order_placed" && event.metadata?.duplicate === true);
  const overuse = events.filter((event) => event.type === "order_placed" && event.actionId && !requiredOrderIds.has(event.actionId));
  const critical = events.filter((event) => event.type === "critical_error");
  const labels = { history: ["病史采集与血尿定位", "History and hematuria localization"], risk: ["危险因素和安全网", "Risk factors and safety net"], exam: ["查体与急症识别", "Examination and emergency recognition"], diagnosis: ["诊断与鉴别诊断", "Diagnosis and differentials"], orders: ["检验、影像、内镜及病理决策", "Investigation and pathology decisions"], mdt: ["MDT与会诊", "MDT and consultation"], treatment: ["治疗及围术期管理", "Treatment and perioperative care"], followup: ["随访、教育和表达效率", "Follow-up, education and communication"] };
  const items = row.dimensions.map((dimension) => {
    const rubricItems = dimension.requirements.map((requirement, index) => {
      const max = allocate(dimension.max, dimension.requirements.length, index);
      const event = events.find((candidate) => candidate.type === requirement.eventType && candidate.metadata?.validated === true
        && (!requirement.key || candidate.slotId === requirement.key || candidate.actionId === requirement.key));
      const evidenceId = event ? evidenceGraph.find((node) => node.eventId === event.eventId)?.evidenceId : undefined;
      return { rubricItemId: requirement.id, status: event ? "earned" : "missed", score: event ? max : 0, max, eventId: event?.eventId, evidenceId, evidenceText: event?.text || event?.actionId || event?.slotId, timestamp: event?.at };
    });
    let itemScore = rubricItems.reduce((sum, item) => sum + item.score, 0);
    if (dimension.id === "orders") itemScore = Math.max(0, itemScore - duplicates.length * 2 - overuse.length * 3);
    if (dimension.id === "treatment") itemScore = Math.max(0, itemScore - critical.length * 10);
    const misses = rubricItems.filter((item) => item.status === "missed").map((item) => {
      const requirement = dimension.requirements.find((candidate) => candidate.id === item.rubricItemId);
      return publicRequirementLabel(requirement, language);
    });
    return {
      label: labels[dimension.id]?.[language === "en" ? 1 : 0] || dimension.label, max: dimension.max, score: itemScore,
      evidence: rubricItems.filter((item) => item.status === "earned").map((item) => `${item.evidenceId ? `[${item.evidenceId}] ` : ""}${item.evidenceText || ""}`), misses,
      sequenceIssues: [], overuse: dimension.id === "orders" ? overuse.map((event) => event.actionId) : [],
      criticalErrors: dimension.id === "treatment" ? critical.map((event) => event.text) : [],
      improvements: misses.slice(0, 4).map((item) => language === "en" ? `Address: ${item}` : `下次训练补充：${item}`),
      comment: itemScore === dimension.max ? (language === "en" ? "Complete." : "本维度已完整达成。") : (language === "en" ? "Only server-validated evidence was scored." : "仅计入服务端验证通过的临床证据。"), rubricItems
    };
  });
  const total = Math.max(0, Math.min(360, items.reduce((sum, item) => sum + item.score, 0)));
  return { total, max: 360, items, redFlags: critical.map((event) => event.text), ragGuardrails: [], scoringVersion: "360-event-v1", caseVersion: row.caseVersion, generatedAt: new Date().toISOString(), reportVersion: 3, calculation: `${items.map((item) => `${item.score}/${item.max}`).join(" + ")} = ${total}/360` };
}

function standardFor(caseData, stageKey, language) {
  const standard = ({
    history: caseData.standardSummary || "",
    orders: [caseData.clinical?.requiredLabs, caseData.clinical?.specialTests, caseData.clinical?.imagingAndProcedures].filter(Boolean).join("\n"),
    diagnosis: [caseData.diagnosis, caseData.clinical?.mustDifferentials].filter(Boolean).join("\n"),
    consult: [externalConsultDepartments(caseData.clinical?.consultDepartments), caseData.clinical?.consultQuestions].filter(Boolean).join("\n"),
    treatment: [caseData.clinical?.immediateTreatment, caseData.clinical?.definitiveTreatment, caseData.clinical?.followUp].filter(Boolean).join("\n"),
    perioperative: caseData.standardManagement?.perioperative || caseData.perioperativePlan || caseData.clinical?.perioperative || "",
    debrief: caseData.teachingPoints?.join("\n") || ""
  })[stageKey] || "";
  if (stageKey !== "perioperative" || !standard) return standard;
  const signoffPending = caseData.medicalReviewImport?.licensedExpertSignoffPending === true
    || ["pending", "needs_revision"].includes(String(caseData.medicalReview?.status || ""));
  if (!signoffPending) return standard;
  return language === "en"
    ? `Reference points from the case's existing management pathway (licensed-expert signoff pending; do not treat as an approved definitive plan):\n${standard}`
    : `病例现有管理路径参考要点（尚待持证专家终签，不应视为已批准的确定性方案）：\n${standard}`;
}

function stageFeedback(caseData, stageKey, validation, state, language) {
  const row = rubrics.find((item) => item.caseId === caseData.id);
  const dimensionIds = {
    history: ["history", "risk"], orders: ["exam", "orders"], diagnosis: ["diagnosis"], consult: ["mdt"],
    treatment: ["treatment", "followup"], perioperative: ["treatment"], debrief: ["followup"]
  }[stageKey] || [];
  let requirements = (row?.dimensions || []).filter((dimension) => dimensionIds.includes(dimension.id)).flatMap((dimension) => dimension.requirements);
  if (stageKey === "treatment") requirements = requirements.filter((item) => item.key !== "perioperative" && item.key !== "reflection");
  if (stageKey === "perioperative") requirements = requirements.filter((item) => item.key === "perioperative");
  if (stageKey === "debrief") requirements = requirements.filter((item) => item.key === "quality");
  const evidenceFor = (requirement) => state.events.find((event) => event.metadata?.validated === true && event.type === requirement.eventType
    && (!requirement.key || event.slotId === requirement.key || event.actionId === requirement.key));
  const matched = requirements.map((requirement) => ({ requirement, event: evidenceFor(requirement) })).filter((item) => item.event);
  const missing = requirements.filter((requirement) => !evidenceFor(requirement));
  const score = requirements.length ? Math.round(matched.length / requirements.length * 10) : 0;
  const formalLocked = state.mode === "formal-attempt" && state.status !== "completed";
  const submissionNode = [...(state.evidenceGraph || [])].reverse().find((node) => node.eventType === "submission_recorded" && node.canonicalFactOrAction === stageKey);
  const referencesForEvent = (event) => [...new Set([
    ...(Array.isArray(event?.metadata?.evidenceIds) ? event.metadata.evidenceIds : []),
    evidenceNodeForEvent(state, event?.eventId)?.evidenceId
  ].filter(Boolean))];
  const feedbackEvidence = {
    hits: matched.map((item) => ({
      text: item.event.text || publicRequirementLabel(item.requirement, language),
      evidenceIds: referencesForEvent(item.event)
    })).slice(0, 8),
    misses: missing.map((item) => ({
      text: publicRequirementLabel(item, language),
      evidenceIds: submissionNode ? [submissionNode.evidenceId] : []
    })).slice(0, 8),
    warnings: validation.warnings.map((text) => ({
      text,
      evidenceIds: submissionNode ? [submissionNode.evidenceId] : []
    })).slice(0, 8)
  };
  return {
    stageKey, max: 10, score,
    hits: matched.map((item) => item.event.text || publicRequirementLabel(item.requirement, language)).filter(Boolean).slice(0, 8),
    misses: missing.map((item) => publicRequirementLabel(item, language)).filter(Boolean).slice(0, 8),
    warnings: validation.warnings,
    standardAnswer: formalLocked ? "" : standardFor(caseData, stageKey, language),
    feedbackEvidence,
    practiceOnly: state.practiceOnly,
    comment: language === "en"
      ? "Clinical significance: omissions may affect localization, safety, or decision quality. Revise the listed items and resubmit. This formative feedback does not affect the final overall result."
      : "临床意义：遗漏可能影响血尿定位、安全识别或决策质量。请根据遗漏和错误点修改后重新提交；本阶段为形成性反馈，不影响最终综合结果。"
  };
}

module.exports = async function handler(req, res) {
  const startedAt = Date.now();
  const originAccepted = setCors(req, res);
  if (!originAccepted) return res.status(403).json({ error: "origin_not_allowed" });
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (rateLimited(req)) return res.status(429).json({ error: "rate_limited" });
  try {
    const body = parseJsonBody(req, 96 * 1024);
    if (!allowedActions.has(body.action)) return res.status(400).json({ error: "invalid_action" });
    const caseData = findCase(body.caseId);
    if (!caseData) return res.status(404).json({ error: "unknown_case" });
    const language = body.language === "en" ? "en" : "zh";
    const { requestId, requestDigest } = requestIdentity(req, body);

    if (body.action === "init-attempt") {
      const mode = normalizeAttemptMode(body.mode);
      if (mode === "formal-attempt") assertFormalAllowed(caseData);
      const state = createAttemptState({ attemptId: body.attemptId, caseId: caseData.id, mode, language });
      const token = signAttemptState(state);
      const payload = { attemptId: state.attemptId, caseId: state.caseId, mode: state.mode, practiceOnly: state.practiceOnly, evidenceOptions: [] };
      const stored = await registerAttempt({ state, token, requestId, requestDigest, payload });
      return sendStored(res, stored);
    }

    const previousToken = requestHeader(req, "x-training-state");
    const claims = verifyAttemptState(previousToken, { caseId: caseData.id, attemptId: String(body.attemptId || "") });
    const loaded = await loadAttempt({ caseId: caseData.id, attemptId: String(body.attemptId || ""), token: previousToken, requestId, requestDigest });
    if (loaded.duplicate) return sendStored(res, loaded);
    const state = loaded.state;
    ensureEvidenceGraph(state, caseData.id);
    if (state.mode !== claims.mode || state.language !== claims.language || Number(state.tokenSequence || 0) !== Number(claims.tokenSequence || 0)) {
      throw new Error("attempt_state_mismatch");
    }
    if (body.mode && normalizeAttemptMode(body.mode) !== state.mode) return res.status(409).json({ error: "attempt_mode_mismatch" });
    if (language !== state.language) return res.status(409).json({ error: "attempt_language_mismatch" });
    if (state.mode === "formal-attempt") assertFormalAllowed(caseData);
    if (body.action === "validate-attempt") {
      res.setHeader("X-Training-State", previousToken);
      return res.status(200).json({
        attemptId: state.attemptId,
        caseId: state.caseId,
        mode: state.mode,
        language: state.language,
        currentStage: Number(state.currentStage || 1),
        status: state.status,
        evidenceOptions: studentEvidenceOptions(state, language)
      });
    }
    if (body.action === "stage-feedback" && !stageNumbers[body.stageKey]) return res.status(400).json({ error: "invalid_stage" });
    assertStageUnlocked(state, body.action, body);
    const at = new Date().toISOString();

    if (body.action === "history-log") {
      const matchedEvents = matchHistoryQuestion(caseData.id, body.question, at, state.sequence + 1)
        .map((event, index) => ({ ...event, eventId: requestId ? `${requestId}-${index}` : event.eventId }));
      const quarantine = filterQuarantinedEvents(caseData.id, matchedEvents);
      if (quarantine.quarantinedSlotIds.length) {
        console.warn("training_fact_quarantined", { caseId: caseData.id, slotIds: quarantine.quarantinedSlotIds, reason: BILINGUAL_CONFLICT_REASON });
      }
      const historyContexts = Object.fromEntries(quarantine.events.map((event) => [event.eventId, {
        triggerAction: "patient_interview",
        rawQuestion: body.question,
        result: language === "en" ? `Patient-reported evidence collected for ${event.slotId}.` : `已采集患者自述证据：${event.slotId}。`,
        provenance: "case_truth_ontology"
      }]));
      appendClinicalEvents(state, caseData.id, quarantine.events, historyContexts);
      setServerTiming(res, { history: Date.now() - startedAt });
      return commitResponse(res, {
        state, previousToken, requestId, requestDigest,
        payload: { recorded: true, requestId, quarantinedSlotIds: quarantine.quarantinedSlotIds, reason: quarantine.reason, evidenceOptions: studentEvidenceOptions(state, language) }
      });
    }
    if (body.action === "exam") {
      const result = handleExam(caseData, body.input, language);
      if (result.examId) {
        const event = { eventId: `srv-${state.sequence + 1}-exam-${result.examId}`, type: "physical_exam_performed", actionId: result.examId, stageNo: 2, at, text: result.input, metadata: { validated: result.scoringEligible === true, scoringEligible: result.scoringEligible === true, diagnosticEligible: result.diagnosticEligible === true, provenance: result.provenance } };
        appendClinicalEvents(state, caseData.id, [event], { [event.eventId]: { triggerAction: result.input, result: result.result, provenance: result.provenance, scoringEligible: result.scoringEligible === true, diagnosticEligible: result.diagnosticEligible === true } });
      }
      return commitResponse(res, { state, previousToken, requestId, requestDigest, payload: { ...result, evidenceOptions: studentEvidenceOptions(state, language) } });
    }
    if (body.action === "order") {
      const result = handleOrder(caseData, body.input, state.orders, language);
      const newOrderIds = result.acceptedOrderIds.filter((id) => !state.orders.includes(id));
      state.orders = [...new Set([...state.orders, ...newOrderIds])];
      const orderEvents = result.matchedOrders
        .filter((order) => result.acceptedOrderIds.includes(order.orderId)
          || result.duplicateOrderIds.includes(order.orderId))
        .map((order) => ({ eventId: `srv-${state.sequence + 1}-order-${order.orderId}`, type: "order_placed", actionId: order.orderId, stageNo: 2, at, text: order.displayName, metadata: { validated: true, duplicate: result.duplicateOrderIds.includes(order.orderId) } }));
      const resultEvents = result.results.map((item) => ({
        eventId: `srv-${state.sequence + 1}-result-${item.resultId}`,
        type: "result_returned",
        actionId: item.orderId,
        stageNo: 2,
        at,
        text: item.impression || item.result,
        metadata: {
          validated: item.provenance === "configured_case_result" && item.scoringEligible !== false,
          scoringEligible: item.scoringEligible === true,
          diagnosticEligible: item.diagnosticEligible !== false,
          provenance: item.provenance || "unknown"
        }
      }));
      const outcomeEvents = result.orderOutcomes
        .filter((item) => item.orderId && !["reported", "duplicate", "unrecognized", "unavailable"].includes(item.status))
        .map((item) => ({
          eventId: `srv-${state.sequence + 1}-outcome-${item.orderId}`,
          type: "order_outcome",
          actionId: item.orderId,
          stageNo: 2,
          at,
          text: item.message,
          metadata: {
            validated: false,
            scoringEligible: false,
            diagnosticEligible: false,
            provenance: item.provenance || "unknown",
            outcomeStatus: item.status,
            possibleUnnecessary: item.possibleUnnecessary === true
          }
        }));
      const orderContexts = Object.fromEntries([
        ...orderEvents.map((event) => [event.eventId, { triggerAction: event.text, result: language === "en" ? "Order placed." : "已开立医嘱。", provenance: "canonical_order_action" }]),
        ...resultEvents.map((event) => [event.eventId, { triggerAction: event.actionId, result: event.text, provenance: event.metadata.provenance, scoringEligible: event.metadata.scoringEligible, diagnosticEligible: event.metadata.diagnosticEligible }]),
        ...outcomeEvents.map((event) => [event.eventId, { triggerAction: event.actionId, result: event.text, provenance: event.metadata.provenance, scoringEligible: false, diagnosticEligible: false, outcomeStatus: event.metadata.outcomeStatus, possibleUnnecessary: event.metadata.possibleUnnecessary }])
      ]);
      appendClinicalEvents(state, caseData.id, [...orderEvents, ...resultEvents, ...outcomeEvents], orderContexts);
      const releasedReports = Array.isArray(state.releasedReports) ? state.releasedReports : [];
      const knownResultIds = new Set(releasedReports.map((item) => item.resultId));
      state.releasedReports = [
        ...releasedReports,
        ...result.results.filter((item) => item.resultId && !knownResultIds.has(item.resultId))
      ];
      return commitResponse(res, { state, previousToken, requestId, requestDigest, payload: { ...result, evidenceOptions: studentEvidenceOptions(state, language) } });
    }
    if (body.action === "mdt") {
      const consultRequests = validatedConsultRequests(state, body.consultRequests);
      const result = handleMdt(caseData, body.departments, body.purpose, language, consultRequests);
      const events = [];
      if (result.accepted.length) events.push({ eventId: `srv-${state.sequence + 1}-mdt-department`, type: "consult_requested", actionId: "department", stageNo: 4, at, text: result.accepted.join("；"), metadata: { validated: true } });
      if (result.focused) ["trigger", "question"].forEach((actionId) => events.push({ eventId: `srv-${state.sequence + 1}-mdt-${actionId}`, type: "consult_requested", actionId, stageNo: 4, at, text: result.requests.map((item) => `${item.department}:${item.question || item.purpose}`).join("；"), metadata: { validated: true } }));
      if (result.evidenceProvided) events.push({ eventId: `srv-${state.sequence + 1}-mdt-evidence`, type: "consult_requested", actionId: "evidence", stageNo: 4, at, text: result.requests.map((item) => `${item.department}:${item.evidenceIds.length || item.evidence.length}`).join("；"), metadata: { validated: true, evidenceIds: result.requests.flatMap((item) => item.evidenceIds) } });
      appendClinicalEvents(state, caseData.id, events, Object.fromEntries(events.map((event) => [event.eventId, {
        triggerAction: "consultation_request",
        result: event.text,
        provenance: "learner_consultation_request"
      }])));
      return commitResponse(res, { state, previousToken, requestId, requestDigest, payload: result.opinions });
    }
    if (body.action === "stage-feedback") {
      const submittedStage = stageNumbers[body.stageKey];
      if (state.submissions[body.stageKey]) {
        state.events = state.events.filter((event) => event.stageNo < submittedStage || (submittedStage <= 2 && ["slot_answered", "physical_exam_performed", "order_placed", "result_returned"].includes(event.type)));
        pruneEvidenceGraph(state);
        if (body.stageKey === "diagnosis") clearLearnerDiagnosisRelations(state);
        Object.keys(state.submissions).forEach((key) => { if (stageNumbers[key] >= submittedStage) delete state.submissions[key]; });
        state.completedStages = (state.completedStages || []).filter((stage) => stage < submittedStage);
        state.currentStage = submittedStage;
      }
      if (body.stageKey === "history") reconcileSubmittedHistory(caseData, state, body.submission || {}, at);
      const rawSubmission = body.submission || {};
      if (body.stageKey === "diagnosis") recordDiagnosisRelations(state, diagnosisSelections(rawSubmission));
      const validationSubmission = body.stageKey === "diagnosis" ? enrichDiagnosisSubmission(state, rawSubmission, caseData, language) : rawSubmission;
      const rawValidation = validateStage(caseData, body.stageKey, validationSubmission);
      const validation = {
        ...rawValidation,
        events: body.stageKey === "diagnosis" ? attachDiagnosisEvidenceIds(rawValidation.events, rawSubmission) : rawValidation.events
      };
      const recordedSubmission = submissionEvent(state, body.stageKey, rawSubmission, language, at);
      appendClinicalEvents(state, caseData.id, [...validation.events, recordedSubmission], {
        [recordedSubmission.eventId]: {
          triggerAction: `${body.stageKey}_submission`,
          result: recordedSubmission.text,
          provenance: "learner_submission"
        }
      });
      state.submissions[body.stageKey] = { submittedAt: at, warnings: validation.warnings };
      state.completedStages = [...new Set([...(state.completedStages || []), submittedStage])].sort((a, b) => a - b);
      state.currentStage = submittedStage + 1;
      const feedback = stageFeedback(caseData, body.stageKey, validation, state, language);
      feedback.evidenceOptions = studentEvidenceOptions(state, language);
      return commitResponse(res, { state, previousToken, requestId, requestDigest, payload: feedback });
    }
    if (body.action === "score") {
      const report = score(caseData.id, state.events, language, state.evidenceGraph);
      state.status = "completed";
      state.completedAt = at;
      state.finalScore = report.total;
      state.scoringVersion = report.scoringVersion;
      report.clinicalTrajectory = sanitizeClinicalTrajectory(buildClinicalTrajectory(state, report, language), language);
      setServerTiming(res, { score: Date.now() - startedAt });
      return commitResponse(res, { state, previousToken, requestId, requestDigest, payload: report });
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "training_action_failed";
    const status = /request_body_too_large/.test(code) ? 413
      : /invalid_json_body/.test(code) ? 400
        : /formal|approved/.test(code) ? 403
      : /idempotency_key_required|invalid_request_digest/.test(code) ? 400
        : /invalid_evidence_reference/.test(code) ? 422
        : /stage|mode|language|stale|already_exists|idempotency_key_reused/.test(code) ? 409
          : /token|mismatch|completed|not_found/.test(code) ? 401
            : /secret|store_(?:temporarily_)?unavailable/.test(code) ? 503 : 500;
    return res.status(status).json({ error: code });
  }
};
