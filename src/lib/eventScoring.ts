import type { CaseData } from "./types";
import type { CanonicalSlotId } from "./canonicalSlots";

export type TrainingEventType =
  | "question_asked" | "slot_answered" | "physical_exam_performed" | "order_placed" | "result_returned"
  | "diagnosis_supported" | "consult_requested" | "treatment_action" | "safety_net_provided" | "reflection_submitted"
  | "summary_written" | "critical_error" | "timeout";

export type TrainingEvent = {
  eventId: string;
  type: TrainingEventType;
  at: string;
  stageNo: number;
  slotId?: CanonicalSlotId;
  actionId?: string;
  text?: string;
  metadata?: Record<string, string | number | boolean | string[]>;
};

export type RubricEvidence = {
  rubricItemId: string;
  status: "earned" | "missed" | "penalized";
  score: number;
  max: number;
  eventId?: string;
  evidenceText?: string;
  timestamp?: string;
};

export type EventScoringReport = {
  total: number;
  max: 360;
  items: Array<{
    label: string; max: number; score: number; evidence: string[]; misses: string[]; sequenceIssues: string[];
    overuse: string[]; criticalErrors: string[]; improvements: string[]; comment: string; rubricItems: RubricEvidence[];
  }>;
  redFlags: string[];
  ragGuardrails: string[];
  scoringVersion: "360-event-v1";
  caseVersion: string;
  generatedAt: string;
  reportVersion: 2;
  calculation: string;
};

type Requirement = { id: string; label: string; eventType: TrainingEventType; key?: string; count?: number };
type Dimension = { id: string; label: string; max: number; requirements: Requirement[] };

const dimensions = [
  ["history", "病史采集与血尿定位", 50], ["risk", "危险因素和安全网", 40], ["exam", "查体与急症识别", 35],
  ["diagnosis", "诊断与鉴别诊断", 45], ["orders", "检验、影像、内镜及病理决策", 55], ["mdt", "MDT与会诊", 45],
  ["treatment", "治疗及围术期管理", 50], ["followup", "随访、教育和表达效率", 40]
] as const;

const baseHistory: CanonicalSlotId[] = ["hematuria_visibility", "hematuria_onset", "hematuria_frequency", "hematuria_phase", "urine_color", "clots", "pain", "dysuria", "urinary_frequency", "urinary_urgency", "flank_pain", "fever_chills"];
const categoryRisk: Record<string, CanonicalSlotId[]> = {
  泌尿系肿瘤: ["smoking", "occupation_exposure", "tumor_history", "anticoagulant", "antiplatelet"],
  感染: ["uti_history", "stone_history", "urinary_procedure_history", "gynecologic_contamination"],
  结石: ["stone_history", "triggers", "uti_history", "retention"],
  肾小球疾病: ["glomerular_features", "recent_uri", "family_history", "bleeding_tendency"],
  前列腺疾病: ["voiding_difficulty", "retention", "medications", "surgery_history"],
  外伤: ["triggers", "bleeding_tendency", "anticoagulant", "surgery_history"],
  假性血尿: ["gynecologic_contamination", "medications", "bleeding_tendency"],
  "药物/凝血相关": ["anticoagulant", "antiplatelet", "bleeding_tendency", "tumor_history"]
};
const categoryOrders: Record<string, string[]> = {
  泌尿系肿瘤: ["LAB-UR-001", "LAB-UR-002", "LAB-UR-006", "LAB-BL-003", "IMG-CT-002", "END-001"],
  感染: ["LAB-UR-001", "LAB-UR-002", "LAB-UR-008", "LAB-BL-001", "LAB-BL-002", "LAB-BL-003"],
  结石: ["LAB-UR-001", "LAB-UR-002", "LAB-BL-003", "IMG-CT-001", "IMG-US-001"],
  肾小球疾病: ["LAB-UR-002", "LAB-UR-003", "LAB-UR-004", "LAB-BL-003", "LAB-BL-011", "LAB-PATH-003"],
  前列腺疾病: ["LAB-UR-001", "LAB-BL-003", "IMG-US-001", "FUNC-001", "LAB-BL-015"],
  外伤: ["LAB-BL-001", "LAB-BL-003", "LAB-BL-006", "IMG-CT-005"],
  假性血尿: ["LAB-UR-001", "LAB-UR-002"],
  "药物/凝血相关": ["LAB-UR-001", "LAB-UR-002", "LAB-BL-001", "LAB-BL-006", "LAB-BL-003"]
};

function unique<T>(values: T[]) { return [...new Set(values)]; }
function requirementEvent(events: TrainingEvent[], requirement: Requirement) {
  const matches = events.filter((event) => event.type === requirement.eventType && (!requirement.key || event.slotId === requirement.key || event.actionId === requirement.key));
  return matches.length >= (requirement.count || 1) ? matches[0] : undefined;
}
function allocate(max: number, count: number, index: number) {
  const base = Math.floor(max / count);
  return base + (index < max - base * count ? 1 : 0);
}

export function caseRubric(caseData: CaseData): Dimension[] {
  const category = caseData.diseaseCategory || "";
  const riskSlots: CanonicalSlotId[] = unique([...(categoryRisk[category] || ["smoking", "anticoagulant", "family_history"] as CanonicalSlotId[]), ...(caseData.sex === "女" ? ["gynecologic_contamination" as CanonicalSlotId] : [])]);
  const caseSpecificOrderIds = caseData.releaseV14?.orderRules
    .filter((item) => item.classification === "必须" && !item.orderId.startsWith("REVIEW-"))
    .map((item) => item.orderId) || [];
  const orderIds: string[] = unique(caseSpecificOrderIds.length ? caseSpecificOrderIds : (categoryOrders[category] || ["LAB-UR-001", "LAB-UR-002", "LAB-BL-003"]));
  const historyRequirements = baseHistory.map((slot) => ({ id: `history.${slot}`, label: slot, eventType: "slot_answered" as const, key: slot }));
  const riskRequirements = riskSlots.map((slot) => ({ id: `risk.${slot}`, label: slot, eventType: "slot_answered" as const, key: slot }));
  const examRequirements: Requirement[] = [
    { id: "exam.temperature", label: "体温", eventType: "physical_exam_performed", key: "PE001" },
    { id: "exam.blood_pressure", label: "血压", eventType: "physical_exam_performed", key: "PE002" },
    { id: "exam.targeted", label: "病例针对性查体", eventType: "physical_exam_performed", count: 3 }
  ];
  const diagnosisRequirements: Requirement[] = [
    { id: "diagnosis.primary", label: "最可能诊断及依据", eventType: "diagnosis_supported", key: "primary" },
    { id: "diagnosis.differentials", label: "至少3项鉴别及支持/反对点", eventType: "diagnosis_supported", count: 4 },
    { id: "diagnosis.confirmation", label: "确认计划", eventType: "diagnosis_supported", key: "confirmation" }
  ];
  const orderRequirements = orderIds.map((orderId) => ({ id: `orders.${orderId}`, label: orderId, eventType: "order_placed" as const, key: orderId }));
  const mdtRequirements: Requirement[] = ["department", "trigger", "question", "evidence"].map((key) => ({ id: `mdt.${key}`, label: key, eventType: "consult_requested", key }));
  const treatmentRequirements: Requirement[] = ["immediate", "etiologic", "definitive", "perioperative"].map((key) => ({ id: `treatment.${key}`, label: key, eventType: "treatment_action", key }));
  const followRequirements: Requirement[] = [
    { id: "followup.plan", label: "随访复查", eventType: "safety_net_provided", key: "followup" },
    { id: "followup.education", label: "患者教育", eventType: "safety_net_provided", key: "education" },
    { id: "followup.reflection", label: "学习反思质量", eventType: "reflection_submitted", key: "quality" },
    { id: "followup.efficiency", label: "操作效率", eventType: "result_returned", count: 1 }
  ];
  const requirementSets = [historyRequirements, riskRequirements, examRequirements, diagnosisRequirements, orderRequirements, mdtRequirements, treatmentRequirements, followRequirements];
  return dimensions.map(([id, label, max], index) => ({ id, label, max, requirements: requirementSets[index] }));
}

export function scoreTrainingEvents(caseData: CaseData, events: TrainingEvent[]): EventScoringReport {
  const rubric = caseRubric(caseData);
  const requiredOrderIds = new Set(rubric.find((item) => item.id === "orders")?.requirements.map((item) => item.key).filter(Boolean));
  const duplicateEvents = events.filter((event) => event.type === "order_placed" && event.metadata?.duplicate === true);
  const overuseEvents = events.filter((event) => event.type === "order_placed" && (event.metadata?.overuse === true || (event.actionId && !requiredOrderIds.has(event.actionId) && event.metadata?.appropriateAdditional !== true)));
  const criticalEvents = events.filter((event) => event.type === "critical_error");
  const items = rubric.map((dimension) => {
    const rubricItems = dimension.requirements.map((requirement, index): RubricEvidence => {
      const max = allocate(dimension.max, dimension.requirements.length, index);
      const event = requirementEvent(events, requirement);
      return { rubricItemId: requirement.id, status: event ? "earned" : "missed", score: event ? max : 0, max, eventId: event?.eventId, evidenceText: event?.text || event?.actionId || event?.slotId, timestamp: event?.at };
    });
    let score = rubricItems.reduce((sum, item) => sum + item.score, 0);
    const overuse = dimension.id === "orders" ? [...duplicateEvents.map((event) => `重复医嘱：${event.actionId}`), ...overuseEvents.map((event) => `不必要检查：${event.actionId}`)] : [];
    const criticalErrors = dimension.id === "treatment" || dimension.id === "exam" ? criticalEvents.map((event) => event.text || event.actionId || "严重错误") : [];
    if (dimension.id === "orders") score = Math.max(0, score - duplicateEvents.length * 2 - overuseEvents.length * 3);
    if (dimension.id === "treatment") score = Math.max(0, score - criticalEvents.length * 10);
    const misses = rubricItems.filter((item) => item.status === "missed").map((item) => item.rubricItemId);
    return {
      label: dimension.label, max: dimension.max, score,
      evidence: rubricItems.filter((item) => item.status === "earned").map((item) => `${item.rubricItemId} ← ${item.eventId}`),
      misses, sequenceIssues: [], overuse, criticalErrors,
      improvements: misses.slice(0, 4).map((item) => `下次训练补充：${item}`),
      comment: score === dimension.max ? "本维度已完整达成。" : score >= dimension.max * 0.6 ? "部分达成，按证据缺口改进。" : "关键结构化证据不足。",
      rubricItems
    };
  });
  const raw = items.reduce((sum, item) => sum + item.score, 0);
  const total = Math.max(0, Math.min(360, raw));
  return {
    total, max: 360, items, redFlags: criticalEvents.map((event) => event.text || "严重错误"), ragGuardrails: [],
    scoringVersion: "360-event-v1", caseVersion: caseData.caseVersion || "unknown", generatedAt: new Date().toISOString(), reportVersion: 2,
    calculation: items.map((item) => `${item.label} ${item.score}/${item.max}`).join(" + ") + ` = ${total}/360`
  };
}
