"use strict";

const crypto = require("node:crypto");
const rubrics = require("../data/event_rubrics.json");

function safeText(value, maxLength = 600) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return "";
  return String(value)
    .replace(/\b(?:undefined|null)\b/gi, "")
    .replace(/\[object Object\]/gi, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function evidenceIdForEvent(caseId, eventId) {
  const digest = crypto.createHash("sha256").update(`${caseId}:${eventId}`).digest("hex").slice(0, 12).toUpperCase();
  return `EV-${String(caseId || "CASE").replace(/[^A-Za-z0-9-]/g, "").slice(0, 16)}-${digest}`;
}

function rubricMappingsForEvent(caseId, event) {
  const row = rubrics.find((item) => item.caseId === caseId);
  if (!row) return [];
  return row.dimensions.flatMap((dimension) => dimension.requirements
    .filter((requirement) => event?.type === requirement.eventType
      && (!requirement.key || event?.slotId === requirement.key || event?.actionId === requirement.key))
    .map((requirement) => requirement.id));
}

function defaultProvenance(event) {
  if (event?.metadata?.provenance) return safeText(event.metadata.provenance, 80);
  if (event?.type === "slot_answered") return "case_truth_ontology";
  if (event?.type === "result_returned" || event?.type === "physical_exam_performed") return "released_measurement_result";
  if (event?.type === "submission_recorded") return "learner_submission";
  return event?.metadata?.validated === true ? "server_validated_action" : "learner_action";
}

function nodeFromEvent(caseId, event, context = {}, previous = null) {
  const canonical = safeText(event?.slotId || event?.actionId || event?.type, 160);
  const result = safeText(context.result || event?.text || canonical);
  return {
    evidenceId: evidenceIdForEvent(caseId, event.eventId),
    eventId: safeText(event.eventId, 200),
    caseId: safeText(caseId, 32),
    sourceStage: Math.max(1, Math.min(7, Number(event.stageNo) || 1)),
    eventType: safeText(event.type, 80),
    triggerAction: safeText(context.triggerAction || event.actionId || event.type, 200),
    rawQuestion: safeText(context.rawQuestion, 500),
    canonicalFactOrAction: canonical,
    result,
    provenance: safeText(context.provenance || defaultProvenance(event), 120),
    diagnosisRelations: Array.isArray(previous?.diagnosisRelations) ? previous.diagnosisRelations : [],
    rubricMappings: rubricMappingsForEvent(caseId, event)
  };
}

function ensureEvidenceGraph(state, caseId) {
  if (!Array.isArray(state.evidenceGraph)) state.evidenceGraph = [];
  const byEventId = new Map(state.evidenceGraph.map((node) => [node.eventId, node]));
  for (const event of Array.isArray(state.events) ? state.events : []) {
    if (!event?.eventId) continue;
    const previous = byEventId.get(event.eventId) || null;
    const node = nodeFromEvent(caseId, event, {}, previous);
    byEventId.set(event.eventId, previous ? { ...node, ...previous, rubricMappings: node.rubricMappings } : node);
  }
  state.evidenceGraph = [...byEventId.values()];
  return state.evidenceGraph;
}

function syncEvidenceEvents(state, caseId, events, contextByEventId = {}) {
  ensureEvidenceGraph(state, caseId);
  const byEventId = new Map(state.evidenceGraph.map((node) => [node.eventId, node]));
  for (const event of events || []) {
    if (!event?.eventId) continue;
    const previous = byEventId.get(event.eventId) || null;
    byEventId.set(event.eventId, nodeFromEvent(caseId, event, contextByEventId[event.eventId] || {}, previous));
  }
  state.evidenceGraph = [...byEventId.values()];
  return state.evidenceGraph;
}

function pruneEvidenceGraph(state) {
  const retained = new Set((state.events || []).map((event) => event.eventId));
  state.evidenceGraph = (state.evidenceGraph || []).filter((node) => retained.has(node.eventId));
  return state.evidenceGraph;
}

function publicEvidenceGraph(state, { includeRubricMappings = false } = {}) {
  return (state.evidenceGraph || []).map((node) => ({
    evidenceId: node.evidenceId,
    caseId: node.caseId,
    sourceStage: node.sourceStage,
    eventType: node.eventType,
    triggerAction: node.triggerAction,
    rawQuestion: node.rawQuestion,
    canonicalFactOrAction: node.canonicalFactOrAction,
    result: node.result,
    provenance: node.provenance,
    diagnosisRelations: node.diagnosisRelations,
    ...(includeRubricMappings ? { rubricMappings: node.rubricMappings } : {})
  }));
}

function studentEvidenceOptions(state, language = "zh") {
  const currentStage = Number(state.currentStage || 1);
  const completed = state.status === "completed";
  return (state.evidenceGraph || [])
    .filter((node) => completed || Number(node.sourceStage) < currentStage)
    .filter((node) => ["slot_answered", "physical_exam_performed", "result_returned", "diagnosis_supported"].includes(node.eventType))
    .map((node) => {
      const prefix = language === "en"
        ? ({ 1: "Interview", 2: "Measurement", 3: "Diagnosis", 4: "Consultation", 5: "Treatment", 6: "Perioperative", 7: "Review" }[node.sourceStage] || "Evidence")
        : ({ 1: "问诊", 2: "检查", 3: "诊断", 4: "会诊", 5: "治疗", 6: "围术期", 7: "复盘" }[node.sourceStage] || "证据");
      const action = node.rawQuestion || node.triggerAction || node.canonicalFactOrAction;
      const result = node.eventType === "slot_answered"
        ? (language === "en" ? `evidence collected (${node.canonicalFactOrAction})` : `已采集（${node.canonicalFactOrAction}）`)
        : node.result;
      return {
        evidenceId: node.evidenceId,
        sourceStage: node.sourceStage,
        label: safeText(`${prefix}：${action}${result ? ` — ${result}` : ""}`, 500)
      };
    });
}

function evidenceNodeForEvent(state, eventId) {
  return (state.evidenceGraph || []).find((node) => node.eventId === eventId) || null;
}

function validateEvidenceIds(state, values, { maximum = 60, sourceStages = null } = {}) {
  if (!Array.isArray(values)) return [];
  const unique = [...new Set(values.map((value) => safeText(value, 80)).filter(Boolean))].slice(0, maximum);
  const allowed = new Map((state.evidenceGraph || []).map((node) => [node.evidenceId, node]));
  for (const evidenceId of unique) {
    const node = allowed.get(evidenceId);
    if (!node || (sourceStages && !sourceStages.includes(Number(node.sourceStage)))) throw new Error("invalid_evidence_reference");
  }
  return unique;
}

function recordDiagnosisRelations(state, selections) {
  if (!selections || typeof selections !== "object" || Array.isArray(selections)) return;
  const rows = [
    {
      diagnosis: safeText(selections.primary?.diagnosis, 160),
      support: validateEvidenceIds(state, selections.primary?.evidenceIds || [], { sourceStages: [1, 2] }),
      oppose: []
    },
    ...(Array.isArray(selections.differentials) ? selections.differentials.slice(0, 3).map((row) => ({
      diagnosis: safeText(row?.diagnosis, 160),
      support: validateEvidenceIds(state, row?.supportEvidenceIds || [], { sourceStages: [1, 2] }),
      oppose: validateEvidenceIds(state, row?.opposeEvidenceIds || [], { sourceStages: [1, 2] })
    })) : [])
  ];
  const byId = new Map((state.evidenceGraph || []).map((node) => [node.evidenceId, node]));
  for (const row of rows) {
    if (!row.diagnosis) continue;
    for (const [relation, ids] of [["supports", row.support], ["opposes", row.oppose]]) {
      for (const evidenceId of ids) {
        const node = byId.get(evidenceId);
        const next = { diagnosis: row.diagnosis, relation, source: "learner_selection" };
        if (!node.diagnosisRelations.some((item) => item.diagnosis === next.diagnosis && item.relation === next.relation && item.source === next.source)) {
          node.diagnosisRelations.push(next);
        }
      }
    }
  }
}

function clearLearnerDiagnosisRelations(state) {
  for (const node of state.evidenceGraph || []) {
    node.diagnosisRelations = (node.diagnosisRelations || []).filter((item) => item.source !== "learner_selection");
  }
}

function evidenceText(state, ids) {
  const byId = new Map((state.evidenceGraph || []).map((node) => [node.evidenceId, node]));
  return validateEvidenceIds(state, ids, { sourceStages: [1, 2] })
    .map((id) => byId.get(id))
    .map((node) => `${node.canonicalFactOrAction}: ${node.result}`)
    .join("；");
}

function buildClinicalTrajectory(state, report, language = "zh") {
  const graph = state.evidenceGraph || [];
  const entries = (predicate) => graph.filter(predicate).map((node) => ({
    evidenceId: node.evidenceId,
    stage: node.sourceStage,
    action: node.rawQuestion || node.triggerAction,
    canonical: node.canonicalFactOrAction,
    result: node.result,
    provenance: node.provenance
  }));
  const submissions = graph.filter((node) => node.eventType === "submission_recorded");
  return {
    questions: entries((node) => node.sourceStage === 1 && node.eventType === "slot_answered"),
    acquiredEvidence: entries((node) => node.sourceStage <= 2 && ["slot_answered", "physical_exam_performed", "result_returned"].includes(node.eventType)),
    examinationsAndOrders: entries((node) => node.sourceStage === 2 && ["physical_exam_performed", "order_placed", "result_returned"].includes(node.eventType)),
    diagnosisFormation: entries((node) => node.sourceStage === 3),
    consultations: entries((node) => node.sourceStage === 4),
    treatmentOrders: entries((node) => node.sourceStage === 5),
    perioperativeManagement: entries((node) => node.sourceStage === 6),
    decisionTransitions: submissions.filter((node) => node.sourceStage < 7).map((node) => ({
      decisionEvidenceId: node.evidenceId,
      fromStage: node.sourceStage,
      toStage: node.sourceStage + 1,
      reason: language === "en" ? "The submitted stage unlocked the next clinical step." : "该阶段提交后解锁下一临床步骤。"
    })),
    omissions: (report?.items || []).flatMap((item) => {
      const missed = (item.rubricItems || []).filter((rubric) => rubric.status === "missed");
      return missed.map((rubric, index) => ({
        domain: item.label,
        label: safeText(item.misses?.[index] || (language === "en" ? "Case-relevant step not completed" : "病例相关步骤未完成"), 240),
        rubricItemId: rubric.rubricItemId
      }));
    })
  };
}

module.exports = {
  buildClinicalTrajectory,
  clearLearnerDiagnosisRelations,
  ensureEvidenceGraph,
  evidenceIdForEvent,
  evidenceNodeForEvent,
  evidenceText,
  pruneEvidenceGraph,
  publicEvidenceGraph,
  recordDiagnosisRelations,
  safeText,
  studentEvidenceOptions,
  syncEvidenceEvents,
  validateEvidenceIds
};
