import scoringTemplate from "@/data/scoring_template.json";
import historyRubricJson from "@/data/hematuria_history_rubric.json";
import questionSlotsJson from "@/data/question_slots.json";
import diagnosticGuardrailsJson from "@/data/diagnostic_guardrails.json";
import type { CaseData, ScoringTemplateItem, StageKey } from "./types";

export type StageEvaluation = {
  stageKey: StageKey;
  max: number;
  score: number;
  hits: string[];
  misses: string[];
  warnings: string[];
  standardAnswer: string;
  comment: string;
};

export type FullProcessAnswers = {
  historySummary: string;
  physicalExam: string;
  diagnosis: string;
  differentials: string;
  differentialAnalysis: string;
  diagnosticEvidence: string;
  confirmatoryTests: string;
  selectedOrders: string[];
  customOrders: string;
  consultNeeded: string;
  consultDepartments: string[];
  consultPurpose: string;
  consultQuestions: string;
  consultSummary: string;
  immediateTreatment: string;
  admissionTreatment: string;
  definitiveTreatment: string;
  perioperativePreparation: string;
  mdtRevisedPlan: string;
  followUp: string;
  patientEducation: string;
  debriefReflection: string;
};

export type FullProcessScoreReport = {
  total: number;
  max: number;
  items: Array<{
    id: string;
    label: string;
    max: number;
    score: number;
    hits: string[];
    misses: string[];
    comment: string;
  }>;
  highRiskWarnings: string[];
};

const synonymGroups = [
  ["尿常规", "尿检", "尿沉渣", "沉渣镜检"],
  ["尿培养", "培养", "药敏"],
  ["肾功能", "肌酐", "eGFR"],
  ["凝血功能", "凝血", "INR", "PT", "APTT"],
  ["尿蛋白", "蛋白尿", "24小时尿蛋白", "尿蛋白/肌酐"],
  ["CTU", "泌尿系增强CT", "尿路CT"],
  ["非增强CT", "CT KUB", "KUB"],
  ["泌尿系超声", "彩超", "B超"],
  ["膀胱镜", "尿道膀胱镜"],
  ["TURBT", "经尿道膀胱肿瘤电切", "病理"],
  ["肾活检", "肾穿刺"],
  ["泌尿外科", "泌外"],
  ["肾内科", "肾脏内科"],
  ["感染科", "传染科"],
  ["妇产科", "妇科"],
  ["导尿", "三腔导尿", "留置导尿"],
  ["膀胱冲洗", "持续冲洗"],
  ["引流", "支架", "肾造瘘"],
  ["抗感染", "抗生素", "抗菌药"],
  ["随访", "复查", "门诊复诊"]
];

type HistoryRubricItem = {
  dimension: string;
  item: string;
  max: number;
  scoringDetails: string;
  displayRule: string;
  slotIds: string[];
};

type QuestionSlot = {
  slotId: string;
  label: string;
  recommendedQuestion?: string;
  triggers?: string[];
  missingFeedback?: string;
};

type DiagnosticGuardrail = {
  id: string;
  title: string;
  rule: string;
  triggerSlots: string[];
  feedback: string;
};

const historyRubric = historyRubricJson as HistoryRubricItem[];
const questionSlots = questionSlotsJson as QuestionSlot[];
const diagnosticGuardrails = diagnosticGuardrailsJson as DiagnosticGuardrail[];

function normalize(text: string) {
  return text.toLowerCase().replace(/\s+/g, "");
}

function uniq(values: string[]) {
  return [...new Set(values.map((item) => item.trim()).filter((item) => item.length >= 2))];
}

function splitKeywords(text: string) {
  return uniq(
    text
      .replace(/[，。；;、/|：:（）()[\]{}]/g, "\n")
      .split(/\n+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2 && item.length <= 24)
  );
}

function expand(keyword: string) {
  const group = synonymGroups.find((items) => items.some((item) => normalize(item) === normalize(keyword) || normalize(keyword).includes(normalize(item))));
  return group ?? [keyword];
}

function keywordHit(answer: string, keyword: string) {
  const target = normalize(answer);
  return expand(keyword).some((word) => target.includes(normalize(word)));
}

function scoreKeywords(answer: string, standard: string, max: number) {
  const keywords = splitKeywords(standard);
  if (!keywords.length) {
    return { score: answer.trim() ? Math.round(max * 0.6) : 0, hits: [], misses: [] };
  }

  const hits = keywords.filter((keyword) => keywordHit(answer, keyword));
  const misses = keywords.filter((keyword) => !keywordHit(answer, keyword)).slice(0, 8);
  const denominator = Math.min(10, keywords.length);
  const ratio = Math.min(1, hits.length / denominator);
  const expressionBonus = answer.trim().length > 25 ? 0.12 : 0;
  return {
    score: Math.round(Math.min(1, ratio + expressionBonus) * max),
    hits: hits.slice(0, 10),
    misses
  };
}

function stageStandard(caseData: CaseData, stageKey: StageKey) {
  const taskAnswer = caseData.stageTasks?.find((task) => task.stageKey === stageKey)?.standardAnswer;
  if (taskAnswer) return taskAnswer;
  const clinical = caseData.clinical;
  if (!clinical) return "";
  if (stageKey === "history") return clinical.keyHistory;
  if (stageKey === "exam") return clinical.physicalExam || "生命体征、腹部、肾区叩击痛、耻骨上区、外生殖器/尿道口、水肿、血压。";
  if (stageKey === "diagnosis") return `${caseData.diagnosis}；${clinical.diagnosticReasoning}；${clinical.mustDifferentials}`;
  if (stageKey === "orders") return `${clinical.requiredLabs}；${clinical.specialTests}；${clinical.imagingAndProcedures}；${clinical.orderReason}`;
  if (stageKey === "consult") return `${clinical.consultDepartments}；${clinical.consultQuestions}`;
  if (stageKey === "treatment") return `${clinical.immediateTreatment}；${clinical.definitiveTreatment}`;
  if (stageKey === "perioperative") return [
    "手术适应证；麻醉风险；心肺评估；抗凝/抗血小板管理；血压；血糖；贫血；肾功能；感染控制；备血；VTE预防；ERAS；术后并发症预防",
    caseData.standardManagement?.perioperative || caseData.agentProfile?.perioperativePreparation || ""
  ].filter(Boolean).join("；");
  if (stageKey === "debrief") return [
    clinical.keyHistory,
    clinical.diagnosticReasoning,
    clinical.requiredLabs,
    clinical.imagingAndProcedures,
    clinical.consultDepartments,
    clinical.immediateTreatment,
    clinical.followUp
  ].filter(Boolean).join("；");
  return clinical.followUp;
}

function warningChecks(caseData: CaseData, stageKey: StageKey, answer: string) {
  const clinical = caseData.clinical;
  if (!clinical) return [];
  const source = `${clinical.diseaseCategory}。${clinical.triage}。${clinical.redFlags}。${clinical.immediateTreatment}。${clinical.orderReason}。${caseData.medication}`;
  const normalizedAnswer = normalize(answer);
  const warnings: string[] = [];

  if (stageKey === "treatment" && source.includes("血块尿潴留") && !keywordHit(answer, "导尿") && !keywordHit(answer, "膀胱冲洗")) {
    warnings.push("本例存在血块尿潴留风险，不能漏掉三腔导尿、膀胱冲洗或急诊内镜处理。");
  }
  if (stageKey === "treatment" && hasInText(source, ["梗阻感染", "感染性梗阻"]) && normalizedAnswer.includes("碎石") && !keywordHit(answer, "引流")) {
    warnings.push("感染性梗阻结石不能直接碎石，应先抗感染、培养并紧急引流。");
  }
  if (stageKey === "orders" && caseData.diseaseCategory?.includes("肿瘤") && !keywordHit(answer, "膀胱镜") && !keywordHit(answer, "CTU")) {
    warnings.push("肿瘤高危血尿需要安排膀胱镜和上尿路影像评估，不能只做尿常规或彩超。");
  }
  if (stageKey === "consult" && hasInText(source, ["AKI", "肾功能下降", "RBC管型", "蛋白尿"]) && !keywordHit(answer, "肾内科")) {
    warnings.push("出现肾小球性线索或肾功能下降时，应考虑肾内科会诊。");
  }
  if (stageKey === "diagnosis" && hasInText(source, ["阿司匹林", "氯吡格雷", "华法林", "利伐沙班", "抗凝", "抗血小板"])) {
    const directDrugAttribution = hasInText(answer, ["抗凝", "抗血小板", "阿司匹林", "氯吡格雷", "华法林", "利伐沙班"]);
    const keepsSearching = hasInText(answer, ["肿瘤", "癌", "结石", "感染", "膀胱镜", "CTU", "器质性", "尿路上皮"]);
    if (directDrugAttribution && !keepsSearching) {
      warnings.push("抗凝/抗血小板药不能直接解释血尿，需继续排查肿瘤、结石、感染等器质性病变。");
    }
  }
  return warnings;
}

function hasInText(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function slotById(slotId: string) {
  return questionSlots.find((slot) => slot.slotId === slotId);
}

function historySlotHit(answer: string, slotId: string) {
  const slot = slotById(slotId);
  if (!slot) return false;
  const candidates = [
    slot.slotId,
    slot.label,
    slot.recommendedQuestion ?? "",
    ...(slot.triggers ?? [])
  ]
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
  return candidates.some((keyword) => keywordHit(answer, keyword));
}

function historyDimensionScore(answer: string, item: HistoryRubricItem) {
  if (!item.slotIds.length) {
    return {
      score: answer.trim() ? Math.round(item.max * 0.6) : 0,
      hits: [] as string[],
      misses: [] as string[]
    };
  }

  const hits = item.slotIds.filter((slotId) => historySlotHit(answer, slotId));
  const misses = item.slotIds.filter((slotId) => !historySlotHit(answer, slotId));
  const ratio = hits.length / item.slotIds.length;
  const expressionBonus = answer.trim().length > 120 ? 0.08 : 0;
  return {
    score: Math.round(Math.min(1, ratio + expressionBonus) * item.max),
    hits: hits.map((slotId) => slotById(slotId)?.label || slotId),
    misses: misses.map((slotId) => slotById(slotId)?.label || slotId)
  };
}

function caseLooksLike(caseData: CaseData, words: string[]) {
  const source = [
    caseData.diseaseCategory,
    caseData.diagnosis,
    caseData.clinical?.diseaseCategory,
    caseData.clinical?.redFlags,
    caseData.clinical?.primaryProblem,
    caseData.clinical?.keyHistory,
    caseData.sex
  ].filter(Boolean).join(" ");
  return hasInText(source, words);
}

function historyGuardrailWarnings(caseData: CaseData, answer: string) {
  const warnings: string[] = [];
  const missing = (slotId: string) => !historySlotHit(answer, slotId);

  if (missing("HX003")) warnings.push("血尿需先确认是真性血尿、肉眼血尿还是镜下血尿，不能只凭尿色判断。");
  if (missing("HX005")) warnings.push("血尿时相是定位线索，需询问起始、终末或全程血尿。");

  if (caseLooksLike(caseData, ["肾小球", "IgA", "肾炎"]) && (missing("HX013") || missing("HX014"))) {
    warnings.push("本例需启动肾小球性血尿安全网：泡沫尿、水肿、高血压、上感或咽痛后血尿不能漏问。");
  }

  if (caseLooksLike(caseData, ["肿瘤", "癌"]) && (missing("HX007") || missing("HX019") || missing("HX020"))) {
    warnings.push("高龄、无痛肉眼血尿、血块、吸烟和职业暴露是泌尿系肿瘤风险线索。");
  }

  if (caseLooksLike(caseData, ["感染", "肾盂肾炎", "尿路感染"]) && (missing("HX010") || missing("HX012"))) {
    warnings.push("感染性血尿需追问尿频尿急尿痛、发热寒战和腰痛。");
  }

  if (caseLooksLike(caseData, ["结石"]) && missing("HX009")) {
    warnings.push("血尿伴肾绞痛或放射痛提示结石，疼痛性质不能漏问。");
  }

  if (caseData.sex.includes("女") && missing("HX021")) {
    warnings.push("女性血尿样表现需排除月经、阴道出血或妇科污染。");
  }

  if (missing("HX018")) warnings.push("抗凝药或抗血小板药不能作为血尿唯一解释，仍需排查器质性病变。");
  if (missing("HX024")) warnings.push("血尿合并鼻出血、牙龈出血、瘀斑紫癜时需考虑全身性出血倾向。");

  const guardrailTips = diagnosticGuardrails
    .filter((guardrail) => guardrail.triggerSlots.some((slotId) => historySlotHit(answer, slotId)))
    .map((guardrail) => guardrail.feedback)
    .slice(0, 4);

  return uniq([...warnings, ...guardrailTips]);
}

function evaluateHistoryStage(caseData: CaseData, answer: string): StageEvaluation {
  const dimensionResults = historyRubric.map((item) => {
    const result = historyDimensionScore(answer, item);
    return {
      item,
      ...result
    };
  });

  const max = historyRubric.reduce((sum, item) => sum + item.max, 0);
  const rawScore = dimensionResults.reduce((sum, item) => sum + item.score, 0);
  const warnings = historyGuardrailWarnings(caseData, answer);
  const score = Math.max(0, Math.min(max, rawScore - warnings.length));
  const hits = dimensionResults
    .filter((item) => item.hits.length)
    .map((item) => `${item.item.dimension}. ${item.item.item}：${item.score}/${item.item.max}，命中 ${item.hits.join("、")}`);
  const misses = dimensionResults
    .filter((item) => item.misses.length)
    .map((item) => `${item.item.dimension}. ${item.item.item}：漏问 ${item.misses.join("、")}`);

  return {
    stageKey: "history",
    max,
    score,
    hits,
    misses,
    warnings,
    standardAnswer: [
      caseData.clinical?.keyHistory,
      caseData.standardSummary,
      "诊断学安全网：确认真性血尿，追问时相、颜色、血块、疼痛、尿路刺激征、感染表现、肾小球线索、用药、吸烟职业暴露、女性污染和全身出血倾向。"
    ].filter(Boolean).join("\n\n"),
    comment: score >= max * 0.85
      ? "病史采集较完整，能覆盖血尿诊断学关键线索。"
      : score >= max * 0.6
        ? "已覆盖部分核心问题，但仍需补齐定位线索、危险因素或安全网问题。"
        : "病史采集覆盖不足，建议按血尿 OSCE 问诊框架重新梳理。"
  };
}

export function evaluateStage(caseData: CaseData, stageKey: StageKey, answer: string, max = 20): StageEvaluation {
  if (stageKey === "history") {
    return evaluateHistoryStage(caseData, answer);
  }

  const standardAnswer = stageStandard(caseData, stageKey);
  const result = scoreKeywords(answer, standardAnswer, max);
  const warnings = warningChecks(caseData, stageKey, answer);
  return {
    stageKey,
    max,
    score: Math.max(0, result.score - warnings.length * 2),
    hits: result.hits,
    misses: result.misses,
    warnings,
    standardAnswer,
    comment: result.score >= max * 0.8
      ? "本阶段思路较完整。"
      : result.score >= max * 0.5
        ? "本阶段已覆盖部分关键点，还需要补充漏项。"
        : "本阶段覆盖不足，建议按标准路径重新梳理。"
  };
}

function answerTextForDimension(caseData: CaseData, answers: FullProcessAnswers, dimension: string) {
  const clinical = caseData.clinical;
  const orderText = [...answers.selectedOrders, answers.customOrders].join("；");
  const consultText = `${answers.consultNeeded}；${answers.consultDepartments.join("；")}；${answers.consultPurpose}；${answers.consultQuestions}；${answers.consultSummary}`;
  const diagnosisText = `${answers.diagnosis}；${answers.differentials}；${answers.differentialAnalysis}；${answers.diagnosticEvidence}；${answers.confirmatoryTests}`;
  const treatmentText = `${answers.immediateTreatment}；${answers.admissionTreatment}；${answers.definitiveTreatment}；${answers.perioperativePreparation}；${answers.mdtRevisedPlan}`;

  if (dimension.includes("病史")) return { answer: answers.historySummary, standard: `${clinical?.keyHistory ?? ""}；${caseData.standardSummary}` };
  if (dimension.includes("查体") || dimension.includes("体格")) return { answer: answers.physicalExam, standard: clinical?.physicalExam ?? "" };
  if (dimension.includes("危险因素")) return { answer: answers.historySummary + "；" + diagnosisText, standard: `${clinical?.redFlags ?? ""}；${clinical?.keyHistory ?? ""}` };
  if (dimension.includes("鉴别") || dimension.includes("定位")) return { answer: diagnosisText, standard: `${caseData.diagnosis}；${clinical?.diagnosticReasoning ?? ""}；${clinical?.mustDifferentials ?? ""}` };
  if (dimension.includes("检验")) return { answer: orderText, standard: `${clinical?.requiredLabs ?? ""}；${clinical?.specialTests ?? ""}` };
  if (dimension.includes("影像") || dimension.includes("内镜") || dimension.includes("功能")) return { answer: orderText, standard: `${clinical?.imagingAndProcedures ?? ""}；${clinical?.orderReason ?? ""}` };
  if (dimension.includes("会诊") || dimension.includes("急诊意识")) return { answer: consultText + "；" + treatmentText, standard: `${clinical?.consultDepartments ?? ""}；${clinical?.consultQuestions ?? ""}；${clinical?.immediateTreatment ?? ""}` };
  if (dimension.includes("治疗")) return { answer: treatmentText, standard: `${clinical?.immediateTreatment ?? ""}；${clinical?.definitiveTreatment ?? ""}` };
  return { answer: `${answers.followUp}；${answers.patientEducation}；${answers.debriefReflection}`, standard: clinical?.followUp ?? "" };
}

export function scoreFullProcess(caseData: CaseData, answers: FullProcessAnswers): FullProcessScoreReport {
  const template = scoringTemplate as ScoringTemplateItem[];
  const items = template.map((item) => {
    const texts = answerTextForDimension(caseData, answers, item.dimension);
    const result = scoreKeywords(texts.answer, texts.standard, item.max);
    return {
      id: item.id,
      label: item.dimension,
      max: item.max,
      score: result.score,
      hits: result.hits,
      misses: result.misses,
      comment: result.score >= item.max * 0.8 ? "完成较好。" : result.score >= item.max * 0.5 ? "部分达标，需补充关键漏项。" : "覆盖不足。"
    };
  });

  const highRiskWarnings = [
    ...warningChecks(caseData, "diagnosis", `${answers.diagnosis}；${answers.differentials}；${answers.differentialAnalysis}；${answers.diagnosticEvidence}；${answers.confirmatoryTests}`),
    ...warningChecks(caseData, "orders", [...answers.selectedOrders, answers.customOrders].join("；")),
    ...warningChecks(caseData, "consult", `${answers.consultNeeded}；${answers.consultDepartments.join("；")}；${answers.consultPurpose}；${answers.consultQuestions}；${answers.consultSummary}`),
    ...warningChecks(caseData, "treatment", `${answers.immediateTreatment}；${answers.admissionTreatment}；${answers.definitiveTreatment}；${answers.perioperativePreparation}；${answers.mdtRevisedPlan}`)
  ];

  const penalty = highRiskWarnings.length * 3;
  const rawTotal = items.reduce((sum, item) => sum + item.score, 0);
  const max = items.reduce((sum, item) => sum + item.max, 0);

  return {
    total: Math.max(0, Math.min(max, rawTotal - penalty)),
    max,
    items,
    highRiskWarnings
  };
}
