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

const catalog = [...labs, ...imaging, ...procedures, ...perioperative];
const allowedActions = new Set(["exam", "order", "mdt", "stage-feedback", "score"]);
const requests = globalThis.__hematuriaTrainingRate || new Map();
const attemptOrders = globalThis.__hematuriaAttemptOrders || new Map();
globalThis.__hematuriaTrainingRate = requests;
globalThis.__hematuriaAttemptOrders = attemptOrders;

function allowedOrigins() {
  return String(process.env.TRAINING_API_ALLOWED_ORIGINS || process.env.AGENT_API_ALLOWED_ORIGIN || "https://niubi1v.github.io")
    .split(",").map((item) => item.trim()).filter(Boolean);
}
function setCors(req, res) {
  const origin = String(req.headers?.origin || "");
  const allow = allowedOrigins();
  const accepted = !origin || allow.length === 0 || allow.includes(origin);
  if (origin && accepted) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  return accepted;
}
function rateLimited(req) {
  const key = String(req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0];
  const now = Date.now();
  const windowStart = now - 60_000;
  const recent = (requests.get(key) || []).filter((at) => at > windowStart);
  recent.push(now);
  requests.set(key, recent);
  return recent.length > Number(process.env.TRAINING_API_RATE_LIMIT_PER_MINUTE || 90);
}
function normalize(text) { return String(text || "").trim().toLowerCase().replace(/\s+/g, ""); }
function splitOrders(text) { return [...new Set(String(text || "").split(/[，,、;；\n]|\s+and\s+/i).map((item) => item.trim()).filter(Boolean))]; }
function findCase(caseId) { return cases.find((item) => String(item.id).toLowerCase() === String(caseId).toLowerCase()); }
function findOrders(input) {
  return splitOrders(input).flatMap((part) => {
    const key = normalize(part);
    const order = catalog.find((item) => String(item.orderId).toLowerCase() === String(part).toLowerCase()
      || [item.displayName, ...(item.synonyms || [])].some((name) => normalize(name) === key));
    return order ? [order] : [];
  }).filter((item, index, all) => all.findIndex((other) => other.orderId === item.orderId) === index);
}
function handleExam(caseId, input, language) {
  const exact = normalize(input);
  const item = examItems.find((candidate) => [candidate.displayName, ...(candidate.synonyms || [])].some((name) => normalize(name) === exact));
  const configured = item && examResults.find((result) => result.caseId === caseId && result.examId === item.examId && result.studentVisibleAfterSelection);
  const result = configured?.result || (language === "en" ? "No configured result is available for this examination." : "当前查体项目暂无可返回结果。");
  return { input, result, examId: item?.examId, at: new Date().toISOString() };
}
function handleOrder(caseId, input, previousOrderIds, language) {
  const orders = findOrders(input);
  const previous = new Set(Array.isArray(previousOrderIds) ? previousOrderIds : []);
  const duplicateOrderIds = orders.map((item) => item.orderId).filter((id) => previous.has(id));
  const available = new Set([...previous, ...orders.map((item) => item.orderId)]);
  const configured = orders.flatMap((order) => {
    const result = structuredResults.find((item) => item.caseId === caseId && item.orderId === order.orderId);
    return result ? [{ order, result }] : [];
  });
  const unmetPrerequisites = [...new Set(configured.flatMap(({ result }) => (result.prerequisites || []).filter((id) => !available.has(id))))];
  const results = configured.filter(({ order, result }) => !duplicateOrderIds.includes(order.orderId)
    && (result.prerequisites || []).every((id) => available.has(id))).map(({ order, result }) => ({
      caseId, orderId: order.orderId, resultId: result.resultId, status: result.status,
      orderCategory: `${order.primaryCategory}/${order.secondaryCategory}`,
      result: result.value || result.impression, value: result.value, unit: result.unit,
      referenceRange: result.referenceRange, impression: result.impression,
      abnormalFlags: result.abnormalFlags || [], abnormalLevel: (result.abnormalFlags || []).join("、") || result.status,
      teachingExplanation: language === "en" ? "Released only for this exact case and placed order." : "仅按当前病例与已开立医嘱精确释放。"
    }));
  const at = new Date().toISOString();
  return {
    id: `${caseId}-${Date.now()}`, input, matched: orders.length > 0,
    matchedOrders: orders.map((item) => ({ orderId: item.orderId, displayName: item.displayName })), results,
    duplicateOrderIds, unmetPrerequisites, selectedOrderCount: splitOrders(input).length,
    recognizedOrderCount: orders.length, returnedReportCount: results.length, at, placedAt: at, stageNo: 2,
    status: results.length ? "reported" : "no-result",
    message: unmetPrerequisites.length
      ? (language === "en" ? `Prerequisites missing: ${unmetPrerequisites.join(", ")}. No report was released.` : `缺少前置条件：${unmetPrerequisites.join("、")}，未返回报告。`)
      : orders.length ? (language === "en" ? "Order recognized; only configured reports were returned." : "医嘱已识别，仅返回已配置的对应报告。")
      : (language === "en" ? "No exact order match was found." : "未精确匹配到规范医嘱。")
  };
}
function handleMdt(caseId, departments, purpose, language) {
  const trigger = mdtTriggers.find((item) => item.caseId === caseId);
  return (departments || []).map((department) => ({
    department,
    opinion: language === "en"
      ? `The ${department} consultation will focus on the stated question. Additional conclusions require the relevant examination evidence.`
      : `${department}会诊将围绕申请问题评估，进一步结论需结合已获得的检查证据。`,
    questions: [purpose],
    expertJudgment: trigger?.expertChallenge || "",
    neededInfo: language === "en" ? "Provide stage-unlocked clinical evidence." : "请提供当前阶段已获得的临床证据。"
  }));
}
function allocate(max, count, index) { const base = Math.floor(max / count); return base + (index < max - base * count ? 1 : 0); }
function matchingEvent(events, requirement) {
  const matches = events.filter((event) => event.type === requirement.eventType
    && (!requirement.key || event.slotId === requirement.key || event.actionId === requirement.key));
  return matches.length >= (requirement.count || 1) ? matches[0] : null;
}
const dimensionLabels = {
  history: ["病史采集与血尿定位", "History and hematuria localization"], risk: ["危险因素和安全网", "Risk factors and safety net"],
  exam: ["查体与急症识别", "Examination and emergency recognition"], diagnosis: ["诊断与鉴别诊断", "Diagnosis and differentials"],
  orders: ["检验、影像、内镜及病理决策", "Investigation and pathology decisions"], mdt: ["MDT与会诊", "MDT and consultation"],
  treatment: ["治疗及围术期管理", "Treatment and perioperative care"], followup: ["随访、教育和表达效率", "Follow-up, education and communication"]
};
const evidenceLabels = {
  hematuria_visibility: ["血尿可见性", "hematuria visibility"], hematuria_onset: ["起病时间", "onset"], hematuria_frequency: ["频率与持续性", "frequency and persistence"],
  hematuria_phase: ["血尿时相", "hematuria phase"], urine_color: ["尿色", "urine color"], clots: ["血块", "clots"], pain: ["疼痛", "pain"],
  dysuria: ["尿痛", "dysuria"], urinary_frequency: ["尿频", "frequency"], urinary_urgency: ["尿急", "urgency"], flank_pain: ["腰痛", "flank pain"],
  fever_chills: ["发热寒战", "fever and chills"], smoking: ["吸烟史", "smoking"], occupation_exposure: ["职业暴露", "occupational exposure"],
  tumor_history: ["肿瘤史", "tumor history"], anticoagulant: ["抗凝药", "anticoagulants"], antiplatelet: ["抗血小板药", "antiplatelets"],
  uti_history: ["尿路感染史", "UTI history"], stone_history: ["结石史", "stone history"], family_history: ["家族史", "family history"],
  glomerular_features: ["肾小球线索", "glomerular features"], recent_uri: ["上感或咽痛", "recent URI or sore throat"], bleeding_tendency: ["出血倾向", "bleeding tendency"]
};
function visibleEvidenceLabel(value, language) {
  const pair = evidenceLabels[value];
  if (pair) return pair[language === "en" ? 1 : 0];
  if (/^(LAB|IMG|END|FUNC|PE)-?/.test(value)) return language === "en" ? "Case-appropriate action" : "病例适用操作";
  const generic = { primary: ["最可能诊断及依据", "most likely diagnosis with evidence"], differentials: ["鉴别诊断", "differential diagnoses"], confirmation: ["确诊计划", "confirmation plan"], department: ["会诊科室", "consulting department"], trigger: ["会诊触发原因", "consult trigger"], question: ["会诊问题", "consult question"], evidence: ["病例证据", "clinical evidence"], immediate: ["即时处理", "immediate care"], etiologic: ["病因治疗", "etiologic treatment"], definitive: ["确定性治疗", "definitive treatment"], perioperative: ["围术期管理", "perioperative care"], plan: ["随访计划", "follow-up plan"], education: ["患者教育", "patient education"], reflection: ["学习反思", "reflection"], efficiency: ["操作效率", "efficiency"] };
  return generic[value]?.[language === "en" ? 1 : 0] || (language === "en" ? "Required clinical evidence" : "必要临床证据");
}
function score(caseId, events, language) {
  const row = rubrics.find((item) => item.caseId === caseId);
  if (!row) throw new Error("No scoring rubric for case");
  const requiredOrderIds = new Set((row.dimensions.find((item) => item.id === "orders")?.requirements || []).map((item) => item.key).filter(Boolean));
  const duplicates = events.filter((event) => event.type === "order_placed" && event.metadata?.duplicate === true);
  const overuseEvents = events.filter((event) => event.type === "order_placed" && event.actionId && !requiredOrderIds.has(event.actionId) && event.metadata?.appropriateAdditional !== true);
  const critical = events.filter((event) => event.type === "critical_error");
  const items = row.dimensions.map((dimension) => {
    const rubricItems = dimension.requirements.map((requirement, index) => {
      const max = allocate(dimension.max, dimension.requirements.length, index);
      const event = matchingEvent(events, requirement);
      return { rubricItemId: requirement.id, status: event ? "earned" : "missed", score: event ? max : 0, max,
        eventId: event?.eventId, evidenceText: event?.text || event?.actionId || event?.slotId, timestamp: event?.at };
    });
    let itemScore = rubricItems.reduce((sum, item) => sum + item.score, 0);
    if (dimension.id === "orders") itemScore = Math.max(0, itemScore - duplicates.length * 2 - overuseEvents.length * 3);
    if (dimension.id === "treatment") itemScore = Math.max(0, itemScore - critical.length * 10);
    const misses = rubricItems.filter((item) => item.status === "missed").map((item) => visibleEvidenceLabel(item.rubricItemId.replace(/^[^.]+\./, ""), language));
    return { label: dimensionLabels[dimension.id]?.[language === "en" ? 1 : 0] || dimension.label, max: dimension.max, score: itemScore,
      evidence: rubricItems.filter((item) => item.status === "earned").map((item) => item.evidenceText || ""), misses,
      sequenceIssues: [], overuse: dimension.id === "orders" ? overuseEvents.map((event) => event.actionId) : [],
      criticalErrors: dimension.id === "treatment" ? critical.map((event) => event.text || event.actionId) : [],
      improvements: misses.slice(0, 4).map((item) => language === "en" ? `Address: ${item}` : `下次训练补充：${item}`),
      comment: itemScore === dimension.max ? (language === "en" ? "Complete." : "本维度已完整达成。") : (language === "en" ? "Review the missing evidence." : "请根据缺失证据改进。"), rubricItems };
  });
  const total = Math.max(0, Math.min(360, items.reduce((sum, item) => sum + item.score, 0)));
  return { total, max: 360, items, redFlags: critical.map((event) => event.text || "Critical error"), ragGuardrails: [],
    scoringVersion: "360-event-v1", caseVersion: row.caseVersion, generatedAt: new Date().toISOString(), reportVersion: 2,
    calculation: `${items.map((item) => `${item.score}/${item.max}`).join(" + ")} = ${total}/360` };
}
function stageFeedback(caseData, stageKey, answerText, language) {
  const standard = {
    history: caseData.standardSummary || "",
    orders: [caseData.clinical?.requiredLabs, caseData.clinical?.specialTests, caseData.clinical?.imagingAndProcedures].filter(Boolean).join("\n"),
    diagnosis: [caseData.diagnosis, caseData.clinical?.mustDifferentials].filter(Boolean).join("\n"),
    consult: [caseData.clinical?.consultDepartments, caseData.clinical?.consultQuestions].filter(Boolean).join("\n"),
    treatment: [caseData.clinical?.immediateTreatment, caseData.clinical?.definitiveTreatment, caseData.clinical?.followUp].filter(Boolean).join("\n"),
    perioperative: caseData.perioperativePlan || caseData.clinical?.perioperative || "",
    debrief: caseData.teachingPoints?.join("\n") || ""
  }[stageKey] || "";
  const hasAnswer = String(answerText || "").trim().length > 0;
  return { stageKey, max: 10, score: hasAnswer ? 6 : 0, hits: hasAnswer ? [language === "en" ? "Stage response submitted" : "已提交阶段作答"] : [],
    misses: [], warnings: [], standardAnswer: standard,
    comment: language === "en" ? "The numerical final score is calculated only from structured action events." : "终末数值评分仅依据结构化操作事件计算。" };
}

module.exports = async function handler(req, res) {
  const originAccepted = setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!originAccepted) return res.status(403).json({ error: "origin_not_allowed" });
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (rateLimited(req)) return res.status(429).json({ error: "rate_limited" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    if (!allowedActions.has(body.action)) return res.status(400).json({ error: "invalid_action" });
    const caseData = findCase(body.caseId);
    if (!caseData) return res.status(404).json({ error: "unknown_case" });
    if (["osce", "rct"].includes(body.mode) && !["reviewed", "approved"].includes(caseData.medicalReview?.status)) {
      return res.status(403).json({ error: "case_not_clinically_approved" });
    }
    const language = body.language === "en" ? "en" : "zh";
    if (body.action === "exam") return res.status(200).json(handleExam(caseData.id, body.input, language));
    if (body.action === "order") {
      const attemptKey = `${caseData.id}:${String(body.attemptId || "anonymous-practice")}`;
      const serverOrderIds = [...(attemptOrders.get(attemptKey) || new Set())];
      const result = handleOrder(caseData.id, body.input, serverOrderIds, language);
      const next = new Set(serverOrderIds);
      result.matchedOrders.forEach((item) => next.add(item.orderId));
      attemptOrders.set(attemptKey, next);
      return res.status(200).json(result);
    }
    if (body.action === "mdt") return res.status(200).json(handleMdt(caseData.id, body.departments, body.purpose, language));
    if (body.action === "stage-feedback") return res.status(200).json(stageFeedback(caseData, body.stageKey, body.answerText, language));
    if (body.action === "score") return res.status(200).json(score(caseData.id, Array.isArray(body.events) ? body.events : [], language));
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : "training_action_failed" });
  }
};
