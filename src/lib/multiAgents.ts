import mdtTriggersJson from "@/data/mdt_triggers.json";
import orderCatalogImagingJson from "@/data/order_catalog_imaging.json";
import orderCatalogLabsJson from "@/data/order_catalog_labs.json";
import orderCatalogPerioperativeJson from "@/data/order_catalog_perioperative.json";
import orderCatalogProceduresJson from "@/data/order_catalog_procedures.json";
import orderResultsStructuredJson from "@/data/order_results_structured.json";
import physicalExamItemsJson from "@/data/physical_exam_items.json";
import physicalExamResultsJson from "@/data/physical_exam_results.json";
import type { CaseData, MdtTrigger, OrderCatalogItem, OrderResultItem, PhysicalExamItem, PhysicalExamResult } from "./types";
import { scoreTrainingEvents, type TrainingEvent } from "./eventScoring";

export type OrderResultLog = {
  id: string;
  input: string;
  matched: boolean;
  matchedOrders: Array<{ orderId: string; displayName: string }>;
  results: OrderResultItem[];
  pendingResults?: OrderResultItem[];
  message: string;
  at: string;
  placedAt?: string;
  returnedAt?: string;
  stageNo?: number;
  status?: "ordered" | "reported" | "no-result";
  duplicateOrderIds?: string[];
  unmetPrerequisites?: string[];
  selectedOrderCount?: number;
  recognizedOrderCount?: number;
  returnedReportCount?: number;
};

export type ExamResultLog = {
  input: string;
  result: string;
  at: string;
};

export type MdtOpinion = {
  department: string;
  opinion: string;
  questions: string[];
  expertJudgment?: string;
  neededInfo?: string;
  suggestedHandling?: string;
  riskReminder?: string;
  residentQuestion?: string;
};

export type Evaluator360State = {
  events?: TrainingEvent[];
  askedSlots: string[];
  examTexts: string[];
  orderTexts: string[];
  diagnosisText: string;
  mdtDepartments: string[];
  mdtPurpose: string;
  mdtStarted: boolean;
  treatmentText: string;
  followUpText: string;
  orderLogs?: OrderResultLog[];
  timeline?: Array<{ type: string; stageNo: number; at: string; detail: string }>;
};

export type Evaluator360Report = {
  total: number;
  max: number;
  items: Array<{
    label: string;
    max: number;
    score: number;
    evidence: string[];
    misses: string[];
    sequenceIssues: string[];
    overuse: string[];
    criticalErrors: string[];
    improvements: string[];
    comment: string;
    rubricItems?: Array<{ rubricItemId: string; status: string; score: number; max: number; eventId?: string; evidenceText?: string; timestamp?: string }>;
  }>;
  redFlags: string[];
  ragGuardrails: string[];
  scoringVersion: string;
  caseVersion: string;
  generatedAt: string;
  reportVersion: number;
  calculation?: string;
};

type StructuredResult = {
  resultId: string; caseId: string; orderId: string; status: "final" | "not_available" | "not_performed";
  value: string; unit: string; referenceRange: string; impression: string; abnormalFlags: string[];
  availableAt: "immediate" | "delayed"; prerequisites: string[]; sourceVersion: string;
};
const orderResults = orderResultsStructuredJson as StructuredResult[];
const physicalExamItems = physicalExamItemsJson as PhysicalExamItem[];
const physicalExamResults = physicalExamResultsJson as PhysicalExamResult[];
const orderCatalog = [
  ...(orderCatalogLabsJson as OrderCatalogItem[]),
  ...(orderCatalogImagingJson as OrderCatalogItem[]),
  ...(orderCatalogProceduresJson as OrderCatalogItem[]),
  ...(orderCatalogPerioperativeJson as OrderCatalogItem[])
];
const mdtTriggers = mdtTriggersJson as MdtTrigger[];

function normalize(text: string) {
  return (text || "").toLowerCase().replace(/\s+/g, "");
}

function unique(values: string[]) {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

function splitText(text: string) {
  return unique((text || "").split(/[；;、,/，。|｜\n]/).map((item) => item.trim()));
}

function includesAny(text: string, words: string[]) {
  const target = normalize(text);
  return words.some((word) => word && target.includes(normalize(word)));
}

function exactOrderMatches(input: string) {
  const requested = splitText(input.replace(/\s+和\s+|以及|并且| and /gi, "；"));
  const matched = requested.flatMap((segment) => {
    const normalized = normalize(segment);
    const order = orderCatalog.find((item) => item.orderId.toLowerCase() === segment.toLowerCase()
      || [item.displayName, ...item.synonyms].some((name) => normalize(name) === normalized));
    return order ? [order] : [];
  });
  return [...new Map(matched.map((item) => [item.orderId, item])).values()];
}

function caseMdt(caseId: string) {
  return mdtTriggers.find((item) => item.caseId === caseId);
}

export function matchOrderResults(caseData: CaseData, input: string, context?: { previousOrderIds?: string[]; stageNo?: number }): OrderResultLog {
  const text = input.trim();
  const matchedOrders = exactOrderMatches(text);
  const previousOrderIds = context?.previousOrderIds ?? [];
  const duplicateOrderIds = matchedOrders.map((item) => item.orderId).filter((orderId) => previousOrderIds.includes(orderId));
  const availableOrderIds = new Set([...previousOrderIds, ...matchedOrders.map((item) => item.orderId)]);
  const configured = matchedOrders.flatMap((order) => {
    const result = orderResults.find((item) => item.caseId === caseData.id && item.orderId === order.orderId);
    return result ? [{ order, result }] : [];
  });
  const unmetPrerequisites = unique(configured.flatMap(({ result }) => result.prerequisites.filter((prerequisite) => !availableOrderIds.has(prerequisite))));
  const matched = configured.filter(({ order, result }) => !duplicateOrderIds.includes(order.orderId) && result.prerequisites.every((prerequisite) => availableOrderIds.has(prerequisite))).map(({ order, result }) => ({
    caseId: result.caseId,
    orderId: result.orderId,
    resultId: result.resultId,
    status: result.status,
    value: result.value,
    unit: result.unit,
    referenceRange: result.referenceRange,
    impression: result.impression,
    abnormalFlags: result.abnormalFlags,
    availableAt: result.availableAt,
    prerequisites: result.prerequisites,
    sourceVersion: result.sourceVersion,
    diagnosis: "",
    diseaseType: "",
    orderCategory: `${order.primaryCategory}/${order.secondaryCategory}`,
    synonyms: [order.displayName],
    result: result.value || result.impression,
    abnormalLevel: result.abnormalFlags.join("、") || result.status,
    teachingExplanation: "仅返回当前caseId与已开orderId的结构化结果。",
    isKey: true,
    prerequisite: result.prerequisites.join("、")
  } satisfies OrderResultItem));

  const at = new Date().toISOString();
  return {
    id: `${caseData.id}-${Date.now()}`,
    input: text,
    matched: matchedOrders.length > 0,
    matchedOrders: matchedOrders.map((item) => ({ orderId: item.orderId, displayName: item.displayName })),
    results: matched,
    at,
    placedAt: at,
    returnedAt: matched.length ? at : undefined,
    stageNo: context?.stageNo ?? 2,
    status: matched.length ? "reported" : "no-result",
    duplicateOrderIds,
    unmetPrerequisites,
    selectedOrderCount: splitText(text).length,
    recognizedOrderCount: matchedOrders.length,
    returnedReportCount: matched.length,
    message: unmetPrerequisites.length
      ? `医嘱已开立，但缺少前置条件：${unmetPrerequisites.join("、")}；未提前返回报告。`
      : matchedOrders.length && matched.length
      ? duplicateOrderIds.length
        ? "医嘱已识别，但包含重复开立项目；结果不会重复计入效率得分。"
        : "已根据你开立的具体项目返回模拟检查结果。"
      : matchedOrders.length
        ? "已识别医嘱，但当前病例库暂未配置该项目的可返回报告；可继续开立其他关键检查。"
      : "暂未匹配到可返回结果的具体医嘱，请尝试输入更明确的项目名称，例如尿常规、尿培养、CTU、膀胱镜或肾功能。"
  };
}

export function generatePhysicalExamResult(caseData: CaseData, input: string): ExamResultLog {
  const text = input.trim();
  const matchedExam = physicalExamItems.find((item) => includesAny(text, [item.displayName, ...item.synonyms]));
  if (matchedExam) {
    const configured = physicalExamResults.find((item) => item.caseId === caseData.id && item.examId === matchedExam.examId);
    if (configured && configured.studentVisibleAfterSelection) {
      return { input: text, result: configured.result, at: new Date().toISOString() };
    }
  }
  return { input: text, result: "未匹配到适用于当前患者的已配置查体项目。", at: new Date().toISOString() };
}

export function applicablePhysicalExamIds(caseData: CaseData) {
  return physicalExamResults
    .filter((item) => item.caseId === caseData.id && item.studentVisibleAfterSelection)
    .map((item) => item.examId);
}

export function generateMdtOpinions(caseData: CaseData, departments: string[], purpose: string): MdtOpinion[] {
  const trigger = caseMdt(caseData.id);
  const targetDepartments = unique(departments.length ? departments : splitText(trigger?.departments || caseData.agentProfile?.mdtDepartments || ""));
  return targetDepartments.map((department) => {
    const questions = unique([
      ...(trigger?.purpose ? splitText(trigger.purpose).slice(0, 3) : []),
      ...(purpose ? splitText(purpose).slice(0, 3) : [])
    ]);
    let opinion = "请先明确会诊目的，围绕血尿来源、危急程度、下一步检查和治疗路径提出问题。";
    if (/泌尿/.test(department)) opinion = "泌尿外科意见：先判断是否血块尿潴留、梗阻感染或泌尿系肿瘤高危；根据已开检查决定是否需膀胱镜、CTU、TURBT或急诊处理。";
    else if (/肾内/.test(department)) opinion = "肾内科意见：重点看尿蛋白、红细胞形态、RBC管型、肾功能、血压和水肿；符合肾小球性血尿时再讨论免疫学检查和肾活检。";
    else if (/感染/.test(department)) opinion = "感染科意见：完善尿培养、血培养及药敏，评估复杂性UTI、脓毒症或泌尿系结核；梗阻合并感染时需先引流控制感染。";
    else if (/麻醉/.test(department)) opinion = "麻醉科意见：术前需评估贫血、凝血、肾功能、感染控制和抗栓药停用/桥接风险。";
    else if (/肿瘤|放疗/.test(department)) opinion = "肿瘤相关会诊意见：需先取得病理和分期，再讨论NMIBC/MIBC、上尿路尿路上皮癌或转移性疾病的综合治疗。";
    else if (/病理/.test(department)) opinion = "病理科意见：需要规范送检TURBT或活检组织，明确分级、分期、肌层是否受累和特殊病理类型。";
    else if (/妇/.test(department)) opinion = "妇产科意见：女性血尿样表现需排除月经、阴道出血或外阴阴道污染后再判断尿源性血尿。";
    else if (/心内|神经|血液/.test(department)) opinion = "抗栓相关会诊意见：评估抗凝/抗血小板适应证、停药风险、围手术期桥接及再启动时机；抗栓不能直接解释血尿。";

    const neededInfo = /肾内/.test(department)
      ? "尿蛋白定量、尿红细胞形态、RBC管型、肌酐/eGFR、血压和水肿情况。"
      : /泌尿/.test(department)
        ? "血尿时相、血块尿潴留、尿路感染证据、上尿路影像和膀胱镜/病理依据。"
        : /感染/.test(department)
          ? "体温曲线、血/尿培养、PCT/CRP、影像是否梗阻、是否脓毒症或休克。"
          : /麻醉/.test(department)
            ? "凝血、血常规、肾功能、感染控制情况、抗凝/抗血小板用药和手术风险。"
            : "已获得的病史、查体、检验检查、当前诊断和希望解决的具体问题。";
    const riskReminder = /感染|泌尿/.test(department) && includesAny(caseData.clinical?.redFlags ?? "", ["梗阻", "感染", "脓毒症", "AKI"])
      ? "感染性梗阻应先抗感染、培养和引流，感染未控制前不得直接碎石。"
      : /肾内/.test(department)
        ? "蛋白尿、畸形红细胞、RBC管型或肾功能下降提示肾小球性血尿安全网。"
        : /心内|神经|血液|麻醉/.test(department)
          ? "抗凝/抗血小板药不能直接解释血尿，也不能未经评估随意停药或手术。"
          : "会诊意见需结合学生已开检查结果，不能提前替代完整临床判断。";
    return {
      department,
      opinion,
      questions,
      expertJudgment: opinion,
      neededInfo,
      suggestedHandling: trigger?.purpose || caseData.clinical?.consultQuestions || "围绕当前首要临床问题补齐检查并明确下一步处理。",
      riskReminder,
      residentQuestion: questions[0] || "你请我会诊最想解决的一个临床问题是什么？"
    };
  });
}

export function score360(caseData: CaseData, state: Evaluator360State): Evaluator360Report {
  if (!state.events) throw new Error("360-event-v1 scoring requires structured events; free text and summaries are not numeric evidence.");
  return scoreTrainingEvents(caseData, state.events);
}
