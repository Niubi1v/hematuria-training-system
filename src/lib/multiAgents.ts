import evaluatorRubricJson from "@/data/evaluator_rubric.json";
import mdtTriggersJson from "@/data/mdt_triggers.json";
import orderCatalogImagingJson from "@/data/order_catalog_imaging.json";
import orderCatalogLabsJson from "@/data/order_catalog_labs.json";
import orderCatalogPerioperativeJson from "@/data/order_catalog_perioperative.json";
import orderCatalogProceduresJson from "@/data/order_catalog_procedures.json";
import orderResultsJson from "@/data/order_results.json";
import physicalExamItemsJson from "@/data/physical_exam_items.json";
import physicalExamResultsJson from "@/data/physical_exam_results.json";
import ragRulesJson from "@/data/rag_rules.json";
import type { CaseData, EvaluatorRubricItem, MdtTrigger, OrderCatalogItem, OrderResultItem, PhysicalExamItem, PhysicalExamResult } from "./types";

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
  }>;
  redFlags: string[];
  ragGuardrails: string[];
};

const orderResults = orderResultsJson as OrderResultItem[];
const physicalExamItems = physicalExamItemsJson as PhysicalExamItem[];
const physicalExamResults = physicalExamResultsJson as PhysicalExamResult[];
const orderCatalog = [
  ...(orderCatalogLabsJson as OrderCatalogItem[]),
  ...(orderCatalogImagingJson as OrderCatalogItem[]),
  ...(orderCatalogProceduresJson as OrderCatalogItem[]),
  ...(orderCatalogPerioperativeJson as OrderCatalogItem[])
];
const mdtTriggers = mdtTriggersJson as MdtTrigger[];
const evaluatorRubric = (evaluatorRubricJson as EvaluatorRubricItem[]).filter((item) => !/^总分$/.test(item.dimension));

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

function synonymHit(left: string[], right: string[]) {
  return left.some((a) => right.some((b) => normalize(a).includes(normalize(b)) || normalize(b).includes(normalize(a))));
}

function caseMdt(caseId: string) {
  return mdtTriggers.find((item) => item.caseId === caseId);
}

export function matchOrderResults(caseData: CaseData, input: string, context?: { previousOrderIds?: string[]; stageNo?: number }): OrderResultLog {
  const text = input.trim();
  const matchedOrders = orderCatalog.filter((item) => includesAny(text, [item.displayName, ...item.synonyms]));
  const previousOrderIds = context?.previousOrderIds ?? [];
  const duplicateOrderIds = matchedOrders.map((item) => item.orderId).filter((orderId) => previousOrderIds.includes(orderId));
  const candidates = orderResults.filter((item) => item.caseId === caseData.id);
  const matched = candidates.flatMap((item) => {
    const resultSynonyms = item.synonyms.flatMap(splitText);
    const matchedOrder = matchedOrders.find((order) => synonymHit([order.displayName, ...order.synonyms], [...resultSynonyms, item.orderCategory]));
    if (!matchedOrder) return [];
    return [{ ...item, orderId: matchedOrder.orderId }];
  });

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
    unmetPrerequisites: [],
    message: matchedOrders.length && matched.length
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
    if (configured) {
      return { input: text, result: configured.result, at: new Date().toISOString() };
    }
  }
  const answers = caseData.interviewAnswers ?? {};
  const bySlot = (slotId: string) => answers[slotId]?.patientAnswer || "未诉明显异常。";
  let result = "本训练只返回你明确要求检查的体征。该项目需结合现场查体记录，当前病例未提供更多阳性体征。";

  if (includesAny(text, ["生命体征", "体温", "发热", "寒战", "脉搏", "血压"])) {
    result = `生命体征需现场测量；与发热寒战相关的病史回答为：${bySlot("HX022")} 血压线索：${bySlot("HX039")}`;
  } else if (includesAny(text, ["肾区", "叩击痛", "腰痛", "肾绞痛", "肋脊角"])) {
    result = `请重点查双侧肾区叩击痛和输尿管走行区压痛。患者相关症状回答：${bySlot("HX021")}`;
  } else if (includesAny(text, ["腹部", "下腹", "耻骨", "膀胱", "尿潴留", "充盈"])) {
    result = `请重点查腹部压痛、膀胱充盈和耻骨上区叩诊。排尿困难/潴留相关回答：${bySlot("HX020")}`;
  } else if (includesAny(text, ["水肿", "眼睑", "下肢", "浮肿"])) {
    result = `请观察眼睑和下肢水肿。患者相关回答：${bySlot("HX025")}`;
  } else if (includesAny(text, ["外生殖器", "尿道口", "阴道", "月经", "妇科"])) {
    result = `请检查尿道口、外阴/阴道污染线索并询问月经情况。相关回答：${bySlot("HX029")}`;
  } else if (includesAny(text, ["皮疹", "关节", "紫癜", "咽部", "扁桃体"])) {
    result = `请查皮疹、关节和咽部体征，帮助判断肾小球性或系统性疾病线索。上感/咽痛相关回答：${bySlot("HX026")}`;
  }

  return { input: text, result, at: new Date().toISOString() };
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

function departmentHas(departments: string[], word: string) {
  return departments.some((department) => department.includes(word));
}

function evaluateMdtRuleMisses(caseData: CaseData, state: Evaluator360State) {
  const caseCoreSignal = [
    caseData.diagnosis,
    caseData.diseaseCategory,
    caseData.clinical?.redFlags,
    caseData.clinical?.consultDepartments,
    caseData.agentProfile?.mdtTrigger
  ].join("；");
  const antiSignal = [caseCoreSignal, caseData.medication].join("；");
  const departments = state.mdtDepartments;
  const misses: string[] = [];
  const questions: string[] = [];

  if (includesAny(caseCoreSignal, ["蛋白尿", "畸形红细胞", "RBC管型", "水肿", "高血压", "上感后", "茶色尿", "IgA", "肾小球"])) {
    if (!departmentHas(departments, "肾内")) misses.push("肾小球性血尿安全网未触发肾内科会诊。");
    if (!departmentHas(departments, "风湿") && includesAny(caseCoreSignal, ["狼疮", "ANCA", "抗GBM", "免疫"])) misses.push("疑系统性/免疫性肾炎时可加请风湿免疫科。");
    questions.push("肾内科专家质询：尿蛋白、红细胞形态、RBC管型、肾功能和肾活检指征是否评估完整？");
  }
  if (includesAny(caseCoreSignal, ["发热寒战", "发热", "腰痛", "肾区叩痛"]) && includesAny(caseCoreSignal, ["结石", "肾积水", "梗阻", "AKI", "脓肾"])) {
    if (!departmentHas(departments, "泌尿")) misses.push("感染性梗阻/结石红旗未触发泌尿外科急会诊。");
    if (!departmentHas(departments, "感染")) misses.push("感染性梗阻/系统感染风险未考虑感染科。");
    if (includesAny(caseCoreSignal, ["脓毒症", "休克"]) && !departmentHas(departments, "ICU") && !departmentHas(departments, "重症")) misses.push("脓毒症或休克风险未加请ICU。");
    if (includesAny(caseCoreSignal, ["肾造瘘", "脓肾", "引流"]) && !departmentHas(departments, "介入")) misses.push("需肾造瘘/脓肾引流时未考虑介入放射科。");
    questions.push("感染科/泌尿外科质询：感染控制前是否避免直接碎石，并优先培养、抗感染和引流？");
  }
  if (includesAny(caseCoreSignal, ["下腔静脉瘤栓", "肾静脉瘤栓", "巨大肾肿瘤", "IVC瘤栓"])) {
    ["泌尿", "影像", "血管", "麻醉", "ICU", "肿瘤"].forEach((word) => {
      if (!departmentHas(departments, word)) misses.push(`巨大肾肿瘤/瘤栓MDT未包含${word}相关科室。`);
    });
    if (!departmentHas(departments, "输血")) misses.push("瘤栓或复杂大手术病例必要时需考虑输血科。");
  }
  if (includesAny(antiSignal, ["阿司匹林", "氯吡格雷", "华法林", "利伐沙班", "抗凝", "抗血小板"]) && includesAny(state.treatmentText + state.diagnosisText, ["手术", "TURBT", "电切", "围术期"])) {
    if (!departmentHas(departments, "心内") && !departmentHas(departments, "神经")) misses.push("长期抗凝/抗血小板且拟手术时未请心内科或神经内科评估停药风险。");
    if (!departmentHas(departments, "麻醉")) misses.push("抗栓用药拟手术时未请麻醉科进行围术期风险评估。");
  }
  if (caseData.sex === "女" && includesAny(caseCoreSignal, ["月经", "阴道", "污染", "假性血尿"])) {
    if (!departmentHas(departments, "妇")) misses.push("女性血尿样表现未考虑妇产科，以排除月经/阴道出血污染。");
  }

  return { misses: unique(misses), questions: unique(questions) };
}

function scoreByEvidence(max: number, evidenceCount: number, expected = 4) {
  return Math.min(max, Math.round((Math.min(evidenceCount, expected) / expected) * max));
}

export function score360(caseData: CaseData, state: Evaluator360State): Evaluator360Report {
  const clinical = caseData.clinical;
  const orderText = state.orderTexts.join("；");
  const allText = [
    state.examTexts.join("；"),
    orderText,
    state.diagnosisText,
    state.mdtDepartments.join("；"),
    state.mdtPurpose,
    state.treatmentText,
    state.followUpText
  ].join("；");
  const mdt = caseMdt(caseData.id);
  const duplicateOrderIds = unique((state.orderLogs ?? []).flatMap((item) => item.duplicateOrderIds ?? []));
  const treatmentSubmit = (state.timeline ?? []).find((event) => event.type === "submit" && event.stageNo === 5);
  const diagnosisSubmit = (state.timeline ?? []).find((event) => event.type === "submit" && event.stageNo === 3);
  const treatmentBeforeDiagnosis = Boolean(treatmentSubmit && (!diagnosisSubmit || new Date(treatmentSubmit.at).getTime() < new Date(diagnosisSubmit.at).getTime()));

  const items = evaluatorRubric.map((item) => {
    const evidence: string[] = [];
    const misses: string[] = [];
    const sequenceIssues: string[] = [];
    const overuse: string[] = [];
    const criticalErrors: string[] = [];
    if (/病史|定位/.test(item.dimension)) {
      evidence.push(...state.askedSlots.slice(0, 12));
      ["HX002", "HX005", "HX006", "HX011", "HX012", "HX021", "HX022"].forEach((slot) => {
        if (!state.askedSlots.includes(slot)) misses.push(slot);
      });
    } else if (/危险|红旗/.test(item.dimension)) {
      ["HX029", "HX032", "HX034", "HX035", "HX039", "HX040"].forEach((slot) => {
        if (state.askedSlots.includes(slot)) evidence.push(slot);
        else misses.push(slot);
      });
    } else if (/查体|急症识别/.test(item.dimension)) {
      ["生命体征", "血压", "腹部", "肾区", "膀胱", "水肿", "尿量"].forEach((word) => includesAny(state.examTexts.join("；"), [word]) ? evidence.push(word) : misses.push(word));
      if (includesAny(`${caseData.emergencyRedFlags?.join("；")}；${caseData.clinical?.redFlags}`, ["休克", "脓毒", "尿潴留", "AKI", "外伤"]) && !includesAny(state.treatmentText, ["复苏", "生命体征", "导尿", "引流", "尿量", "急诊"])) {
        criticalErrors.push("存在急症红旗但未记录优先稳定和处置。 ");
      }
    } else if (/诊断|鉴别/.test(item.dimension)) {
      ["肿瘤", "结石", "感染", "肾小球", "抗凝", "假性血尿"].forEach((word) => includesAny(state.diagnosisText, [word]) ? evidence.push(word) : misses.push(word));
    } else if (/检验|影像|内镜|病理/.test(item.dimension)) {
      ["尿常规", "尿沉渣", "尿培养", "肾功能", "凝血", "CTU", "CT KUB", "超声", "膀胱镜", "病理", "肾活检"].forEach((word) => includesAny(orderText, [word]) ? evidence.push(word) : misses.push(word));
      if (duplicateOrderIds.length) overuse.push(`重复医嘱：${duplicateOrderIds.join("、")}`);
      if (caseData.diseaseCategory === "感染" && includesAny(orderText, ["CTU", "膀胱镜", "肾活检"]) && !includesAny(caseData.diagnosis, ["复发", "持续", "肿瘤"])) overuse.push("单纯感染初始阶段存在高级检查过度使用风险。 ");
      if (caseData.diseaseCategory === "肾小球疾病" && includesAny(orderText, ["CTU", "膀胱镜"])) overuse.push("肾小球性线索明确时应避免无指征的CTU或膀胱镜。 ");
    } else if (/会诊|急诊/.test(item.dimension)) {
      if (state.mdtStarted) evidence.push("已发起会诊");
      if (state.mdtDepartments.length) evidence.push(...state.mdtDepartments.slice(0, 4));
      if (mdt?.required && !state.mdtStarted) misses.push("本病例应触发MDT/专科会诊");
      misses.push(...evaluateMdtRuleMisses(caseData, state).misses);
      if (state.mdtStarted && state.mdtDepartments.length > 0 && state.mdtPurpose.trim().length < 8) misses.push("会诊目的不聚焦或过短。");
      if (!includesAny(state.treatmentText, ["急诊", "导尿", "引流", "抗感染", "冲洗", "备血", "AKI"])) misses.push("急诊意识或即时处理不足");
    } else if (/治疗/.test(item.dimension)) {
      ["即时", "导尿", "冲洗", "引流", "抗感染", "TURBT", "病理", "手术", "药物"].forEach((word) => includesAny(state.treatmentText, [word]) ? evidence.push(word) : misses.push(word));
      if (treatmentBeforeDiagnosis) sequenceIssues.push("在完成诊断推理前提交了确定性治疗。 ");
    } else if (/随访|教育/.test(item.dimension)) {
      ["复查", "随访", "尿常规", "肾功能", "膀胱镜", "复诊", "戒烟", "用药"].forEach((word) => includesAny(state.followUpText, [word]) ? evidence.push(word) : misses.push(word));
    } else {
      if (allText.length > 50) evidence.push("表达完整");
      else misses.push("表达过少");
    }

    if (overuse.length) sequenceIssues.push("存在重复或可能过度检查，需说明适应证。 ");
    const score = Math.max(0, scoreByEvidence(item.max, evidence.length, /病史/.test(item.dimension) ? 8 : 4) - overuse.length * 2 - sequenceIssues.length * 2 - criticalErrors.length * 5);
    const improvements = unique([
      ...misses.slice(0, 3).map((miss) => `下次训练主动补充：${miss}`),
      ...sequenceIssues.map((issue) => `调整操作顺序：${issue}`),
      ...overuse.map((issue) => `减少资源浪费：${issue}`)
    ]).slice(0, 5);
    return {
      label: item.dimension,
      max: item.max,
      score,
      evidence: unique(evidence).slice(0, 8),
      misses: unique(misses).slice(0, 8),
      sequenceIssues: unique(sequenceIssues),
      overuse: unique(overuse),
      criticalErrors: unique(criticalErrors),
      improvements,
      comment: score >= item.max * 0.8 ? "达成较好。" : score >= item.max * 0.5 ? "部分达标，建议补足关键漏项。" : "覆盖不足，需要重新梳理临床路径。"
    };
  });

  const redFlags: string[] = [];
  redFlags.push(...items.flatMap((item) => item.criticalErrors));
  const source = `${clinical?.redFlags ?? ""}；${clinical?.orderReason ?? ""}；${clinical?.immediateTreatment ?? ""}；${caseData.medication}`;
  if (includesAny(source, ["阿司匹林", "氯吡格雷", "华法林", "利伐沙班", "抗凝", "抗血小板"]) && includesAny(state.diagnosisText, ["抗凝", "阿司匹林", "药物"]) && !includesAny(state.diagnosisText + orderText, ["肿瘤", "膀胱镜", "CTU", "结石", "感染", "器质"])) {
    redFlags.push("高危错误：不能把血尿直接归因于抗凝/抗血小板药，应继续排查器质性病变。");
  }
  if (includesAny(source, ["梗阻感染", "感染性梗阻"]) && includesAny(state.treatmentText, ["碎石"]) && !includesAny(state.treatmentText, ["引流", "支架", "造瘘"])) {
    redFlags.push("高危错误：感染性梗阻结石不能直接碎石，应先抗感染并紧急引流。");
  }
  if (includesAny(source + caseData.diseaseCategory, ["肿瘤", "癌"]) && includesAny(state.treatmentText, ["根治", "化疗", "放疗"]) && !includesAny(orderText + state.treatmentText, ["病理", "膀胱镜", "TURBT", "分期"])) {
    redFlags.push("高危错误：肿瘤确定性治疗前应先取得病理和分期依据。");
  }
  if (mdt?.required && !state.mdtStarted) redFlags.push("本病例存在MDT/专科会诊触发条件，但学生未发起会诊。");
  redFlags.push(...evaluateMdtRuleMisses(caseData, state).misses.slice(0, 4));
  if (state.mdtStarted && state.mdtDepartments.length > 0 && state.mdtPurpose.trim().length < 8) redFlags.push("会诊目的和要解决的问题过于笼统，不能只勾选科室。");

  const rag = ragRulesJson as { structuredRules?: Array<{ guardrail?: string; standardPath?: string }> };
  const ragGuardrails = unique((rag.structuredRules ?? []).flatMap((item) => [item.guardrail || "", item.standardPath || ""]).filter(Boolean)).slice(0, 5);
  const max = items.reduce((sum, item) => sum + item.max, 0);
  const raw = items.reduce((sum, item) => sum + item.score, 0);
  const total = Math.max(0, Math.min(max, raw - redFlags.length * 10));

  return { total, max, items, redFlags, ragGuardrails };
}
