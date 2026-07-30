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
const { matchHistoryQuestion, normalize, validateStage } = require("../server/clinicalAssessment.js");
const { advanceAttemptToken, appendEvents, createAttemptState, normalizeAttemptMode, signAttemptState, verifyAttemptState } = require("../server/trainingState.js");
const { commitAttempt, digest, loadAttempt, registerAttempt } = require("../server/trainingAttemptStore.js");
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
  appendEvents(state, reconciled);
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
  const simulated = item && !configured ? simulatedPhysicalExamResult(item, language) : null;
  const presented = presentExamResult(configured?.result || "", language);
  return {
    input, examId: item?.examId, at: new Date().toISOString(),
    result: configured
      ? presented.text
      : simulated?.result || (language === "en" ? "This case does not provide this examination result, so no conclusion can be made from it." : "该病例未提供此项结果，暂不能据此判断。"),
    translationStatus: configured ? presented.translationStatus : simulated ? "policy_approved_simulation" : "not_available",
    provenance: configured ? "configured_case_result" : simulated?.provenance || "not_provided",
    ...(simulated || {})
  };
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
  const reportable = sourceRows.filter(({ result }) => orderResultIsReportable(result));
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
  const results = reportable.filter(({ order }) => acceptedOrderIds.includes(sourceOrderId(order))).map(({ order, result }) => ({
      caseId: caseData.id,
      orderId: sourceOrderId(order),
      resultId: result.resultId,
      status: result.status,
      ...presentOrderResult(order, result, language),
      provenance: "configured_case_result",
      teachingExplanation: language === "en" ? "Released only for this exact case and placed order." : "仅按当前病例与已开立医嘱精确释放。"
    }));
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
    const missingPrerequisites = (result?.prerequisites || []).filter((id) => !available.has(id));
    if (missingPrerequisites.length) {
      return {
        orderId: canonicalId, displayName, status: "prerequisite_missing", provenance: "configured_case_result",
        message: language === "en"
          ? `${displayName}: prerequisite missing (${missingPrerequisites.join(", ")}); the report remains locked.`
          : `${displayName}：缺少前置条件（${missingPrerequisites.join("、")}），暂不释放报告。`
      };
    }
    if (orderResultIsReportable(result)) {
      return {
        orderId: canonicalId, displayName, status: "reported", provenance: "configured_case_result", resultId: result.resultId,
        message: language === "en" ? `${displayName}: the case-source report was returned.` : `${displayName}：已返回病例现有 source 报告。`
      };
    }
    return {
      orderId: canonicalId,
      displayName,
      status: "not_provided",
      provenance: result ? `source_${result.status}` : "not_provided",
      message: result?.status === "not_performed"
        ? (language === "en" ? `${displayName}: this examination was not performed in the case, so no report exists.` : `${displayName}：本病例未实施该项目，因此无报告。`)
        : (language === "en" ? `${displayName}: this case does not provide the result, so no conclusion can be made from it.` : `${displayName}：该病例未提供此项结果，暂不能据此判断。`)
    };
  });
  const at = new Date().toISOString();
  const notProvidedCount = orderOutcomes.filter((item) => item.status === "not_provided").length;
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
      ? `${orders.length} order(s) recognized: ${results.length} case-source report(s) returned, ${notProvidedCount} result(s) not provided${unrecognizedCount ? `, ${unrecognizedCount} unrecognized` : ""}. See each order below.`
      : `已识别${orders.length}项医嘱：返回${results.length}项病例现有报告，${notProvidedCount}项病例未提供结果${unrecognizedCount ? `，${unrecognizedCount}项未识别` : ""}。请查看逐项状态。`
  };
}

function handleMdt(caseData, departments, purpose, language) {
  const trigger = mdtTriggers.find((item) => item.caseId === caseData.id);
  const expected = String(caseData.clinical?.consultDepartments || "");
  const accepted = (departments || []).filter((department) => expected.includes(department));
  const focused = String(purpose || "").trim().length >= 8;
  const opinions = (departments || []).map((department) => ({
    department,
    opinion: language === "en" ? `The ${department} consultation will focus on the stated question. Additional conclusions require unlocked evidence.` : `${department}会诊将围绕申请问题评估，进一步结论需结合已获得证据。`,
    questions: [purpose], expertJudgment: trigger?.expertChallenge || "",
    neededInfo: language === "en" ? "Provide stage-unlocked clinical evidence." : "请提供当前阶段已获得的临床证据。"
  }));
  return { opinions, accepted, focused };
}

function allocate(max, count, index) {
  const base = Math.floor(max / count);
  return base + (index < max - base * count ? 1 : 0);
}

function score(caseId, events, language) {
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
      return { rubricItemId: requirement.id, status: event ? "earned" : "missed", score: event ? max : 0, max, eventId: event?.eventId, evidenceText: event?.text || event?.actionId || event?.slotId, timestamp: event?.at };
    });
    let itemScore = rubricItems.reduce((sum, item) => sum + item.score, 0);
    if (dimension.id === "orders") itemScore = Math.max(0, itemScore - duplicates.length * 2 - overuse.length * 3);
    if (dimension.id === "treatment") itemScore = Math.max(0, itemScore - critical.length * 10);
    const misses = rubricItems.filter((item) => item.status === "missed").map((item) => item.rubricItemId.replace(/^[^.]+\./, ""));
    return {
      label: labels[dimension.id]?.[language === "en" ? 1 : 0] || dimension.label, max: dimension.max, score: itemScore,
      evidence: rubricItems.filter((item) => item.status === "earned").map((item) => item.evidenceText || ""), misses,
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
    consult: [caseData.clinical?.consultDepartments, caseData.clinical?.consultQuestions].filter(Boolean).join("\n"),
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
  return {
    stageKey, max: 10, score,
    hits: matched.map((item) => item.event.text || item.requirement.label || item.requirement.key).filter(Boolean).slice(0, 8),
    misses: missing.map((item) => item.label || item.key).filter(Boolean).slice(0, 8),
    warnings: validation.warnings,
    standardAnswer: formalLocked ? "" : standardFor(caseData, stageKey, language),
    practiceOnly: state.practiceOnly,
    comment: language === "en"
      ? "Clinical significance: omissions may affect localization, safety, or decision quality. Revise the listed items and resubmit. This formative result does not change the final 360 score."
      : "临床意义：遗漏可能影响血尿定位、安全识别或决策质量。请根据遗漏和错误点修改后重新提交；本阶段形成性结果不直接改变终末360分。"
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
      const payload = { attemptId: state.attemptId, caseId: state.caseId, mode: state.mode, practiceOnly: state.practiceOnly };
      const stored = await registerAttempt({ state, token, requestId, requestDigest, payload });
      return sendStored(res, stored);
    }

    const previousToken = requestHeader(req, "x-training-state");
    const claims = verifyAttemptState(previousToken, { caseId: caseData.id, attemptId: String(body.attemptId || "") });
    const loaded = await loadAttempt({ caseId: caseData.id, attemptId: String(body.attemptId || ""), token: previousToken, requestId, requestDigest });
    if (loaded.duplicate) return sendStored(res, loaded);
    const state = loaded.state;
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
        status: state.status
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
      appendEvents(state, quarantine.events);
      setServerTiming(res, { history: Date.now() - startedAt });
      return commitResponse(res, {
        state, previousToken, requestId, requestDigest,
        payload: { recorded: true, requestId, quarantinedSlotIds: quarantine.quarantinedSlotIds, reason: quarantine.reason }
      });
    }
    if (body.action === "exam") {
      const result = handleExam(caseData, body.input, language);
      if (result.examId) appendEvents(state, [{ eventId: `srv-${state.sequence + 1}-exam-${result.examId}`, type: "physical_exam_performed", actionId: result.examId, stageNo: 2, at, text: result.input, metadata: { validated: true } }]);
      return commitResponse(res, { state, previousToken, requestId, requestDigest, payload: result });
    }
    if (body.action === "order") {
      const result = handleOrder(caseData, body.input, state.orders, language);
      const newOrderIds = result.acceptedOrderIds.filter((id) => !state.orders.includes(id));
      state.orders = [...new Set([...state.orders, ...newOrderIds])];
      const orderEvents = result.matchedOrders
        .filter((order) => result.acceptedOrderIds.includes(order.orderId)
          || result.duplicateOrderIds.includes(order.orderId))
        .map((order) => ({ eventId: `srv-${state.sequence + 1}-order-${order.orderId}`, type: "order_placed", actionId: order.orderId, stageNo: 2, at, text: order.displayName, metadata: { validated: true, duplicate: result.duplicateOrderIds.includes(order.orderId) } }));
      const resultEvents = result.results.map((item) => ({ eventId: `srv-${state.sequence + 1}-result-${item.resultId}`, type: "result_returned", actionId: item.orderId, stageNo: 2, at, text: item.impression || item.result, metadata: { validated: true } }));
      appendEvents(state, [...orderEvents, ...resultEvents]);
      const releasedReports = Array.isArray(state.releasedReports) ? state.releasedReports : [];
      const knownResultIds = new Set(releasedReports.map((item) => item.resultId));
      state.releasedReports = [
        ...releasedReports,
        ...result.results.filter((item) => item.resultId && !knownResultIds.has(item.resultId))
      ];
      return commitResponse(res, { state, previousToken, requestId, requestDigest, payload: result });
    }
    if (body.action === "mdt") {
      const result = handleMdt(caseData, body.departments, body.purpose, language);
      const events = [];
      if (result.accepted.length) events.push({ eventId: `srv-${state.sequence + 1}-mdt-department`, type: "consult_requested", actionId: "department", stageNo: 4, at, text: result.accepted.join("；"), metadata: { validated: true } });
      if (result.focused) ["trigger", "question", "evidence"].forEach((actionId) => events.push({ eventId: `srv-${state.sequence + 1}-mdt-${actionId}`, type: "consult_requested", actionId, stageNo: 4, at, text: body.purpose, metadata: { validated: true } }));
      appendEvents(state, events);
      return commitResponse(res, { state, previousToken, requestId, requestDigest, payload: result.opinions });
    }
    if (body.action === "stage-feedback") {
      const submittedStage = stageNumbers[body.stageKey];
      if (state.submissions[body.stageKey]) {
        state.events = state.events.filter((event) => event.stageNo < submittedStage || (submittedStage <= 2 && ["slot_answered", "physical_exam_performed", "order_placed", "result_returned"].includes(event.type)));
        Object.keys(state.submissions).forEach((key) => { if (stageNumbers[key] >= submittedStage) delete state.submissions[key]; });
        state.completedStages = (state.completedStages || []).filter((stage) => stage < submittedStage);
        state.currentStage = submittedStage;
      }
      if (body.stageKey === "history") reconcileSubmittedHistory(caseData, state, body.submission || {}, at);
      const validation = validateStage(caseData, body.stageKey, body.submission || {});
      appendEvents(state, validation.events);
      state.submissions[body.stageKey] = { submittedAt: at, warnings: validation.warnings };
      state.completedStages = [...new Set([...(state.completedStages || []), submittedStage])].sort((a, b) => a - b);
      state.currentStage = submittedStage + 1;
      return commitResponse(res, { state, previousToken, requestId, requestDigest, payload: stageFeedback(caseData, body.stageKey, validation, state, language) });
    }
    if (body.action === "score") {
      const report = score(caseData.id, state.events, language);
      state.status = "completed";
      state.completedAt = at;
      state.finalScore = report.total;
      state.scoringVersion = report.scoringVersion;
      setServerTiming(res, { score: Date.now() - startedAt });
      return commitResponse(res, { state, previousToken, requestId, requestDigest, payload: report });
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "training_action_failed";
    const status = /request_body_too_large/.test(code) ? 413
      : /invalid_json_body/.test(code) ? 400
        : /formal|approved/.test(code) ? 403
      : /idempotency_key_required|invalid_request_digest/.test(code) ? 400
        : /stage|mode|language|stale|already_exists|idempotency_key_reused/.test(code) ? 409
          : /token|mismatch|completed|not_found/.test(code) ? 401
            : /secret|store_(?:temporarily_)?unavailable/.test(code) ? 503 : 500;
    return res.status(status).json({ error: code });
  }
};
