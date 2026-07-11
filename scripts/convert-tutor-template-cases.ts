import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import type {
  CaseCardItem,
  CaseData,
  ClinicalFields,
  EvaluatorRubricItem,
  InterviewAnswer,
  InterviewSlot,
  MdtTrigger,
  OrderResultItem,
  OsceRubricItem,
  PatientAnswers,
  PatientPersona,
  PresentIllness,
  PhysicalExamItem,
  PhysicalExamResult,
  RiskFactors,
  UiReleaseRule
} from "../src/lib/types";

const input = process.argv[2] ?? "work/source/v2_only_cases.xlsx";
const outputDir = process.argv[3] ?? "data";
const allowedCaseIds = new Set(Array.from({ length: 12 }, (_, index) => `P${String(index + 1).padStart(3, "0")}`));

type Row = Record<string, unknown>;

function compact(value: unknown) {
  return String(value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function get(row: Row, key: string) {
  return compact(row[key]);
}

function getAny(row: Row, keys: string[]) {
  for (const key of keys) {
    const value = get(row, key);
    if (value) return value;
  }
  return "";
}

function rowCaseId(row: Row) {
  return getAny(row, ["case_id", "patient_id", "CaseID", "病例编号"]);
}

function hasSheet(workbook: XLSX.WorkBook, sheetName: string) {
  return Boolean(workbook.Sheets[sheetName]);
}

function pickSheet(workbook: XLSX.WorkBook, candidates: string[]) {
  const found = candidates.find((name) => hasSheet(workbook, name));
  if (!found) throw new Error(`Missing required sheet. Tried: ${candidates.join(", ")}`);
  return found;
}

function filterAllowedRows(items: Row[]) {
  return items.filter((row) => allowedCaseIds.has(rowCaseId(row)));
}

function rows(workbook: XLSX.WorkBook, sheetName: string): Row[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Missing required sheet: ${sheetName}`);
  return XLSX.utils.sheet_to_json<Row>(sheet, { defval: "" });
}

function splitList(text: string) {
  return compact(text).split(/[;；、,\n]/).map((item) => item.trim()).filter(Boolean);
}

function writeJson(name: string, data: unknown) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, name), JSON.stringify(data, null, 2), "utf8");
}

function makePresentIllness(row: Row): PresentIllness {
  return {
    onset: getAny(row, ["symptoms_detail", "present_illness"]),
    hematuriaType: getAny(row, ["hematuria_type", "hematuria_visibility"]),
    hematuriaPhase: get(row, "hematuria_phase"),
    color: get(row, "hematuria_color"),
    clots: getAny(row, ["clots", "clot"]),
    duration: get(row, "chief_complaint"),
    trigger: "",
    pain: get(row, "pain_relation"),
    urinaryFrequency: get(row, "luts"),
    urgency: get(row, "luts"),
    dysuria: get(row, "luts"),
    flankPain: getAny(row, ["flank_pain", "pain_relation"]),
    fever: getAny(row, ["fever", "fever_chills"]),
    voidingDifficulty: get(row, "luts")
  };
}

function makeRiskFactors(row: Row): RiskFactors {
  const history = get(row, "medical_history");
  const meds = get(row, "medication");
  const risk = getAny(row, ["risk", "evaluator_deduct_points", "evaluator"]);
  return {
    smoking: /吸烟|烟/.test(history + risk) ? history : "未诉/需主动询问",
    alcohol: /饮酒|酒/.test(history) ? history : "未诉/需主动询问",
    occupation: /职业|染料|橡胶|皮革|芳香胺|化工/.test(history + risk) ? history : "未诉/需主动询问",
    stoneHistory: /结石/.test(history) ? history : "未诉/否认明确结石史",
    infectionHistory: getAny(row, ["fever", "fever_chills"]),
    trauma: /外伤|创伤/.test(history) ? history : "未诉/否认外伤",
    anticoagulants: meds || "未诉/需主动询问",
    tumorHistory: /肿瘤|癌/.test(history) ? history : "未诉/否认肿瘤史",
    familyHistory: /父母|子女|家族/.test(history) ? history : "未诉/需主动询问"
  };
}

function makeClinical(row: Row): ClinicalFields {
  return {
    source: getAny(row, ["case_source", "资料来源"]),
    diseaseCategory: get(row, "disease_category"),
    difficulty: get(row, "difficulty"),
    triage: getAny(row, ["mdt", "mdt_trigger"]),
    primaryProblem: get(row, "primary_diagnosis"),
    redFlags: getAny(row, ["mdt", "risk", "mdt_trigger"]),
    diagnosticReasoning: getAny(row, ["preoperative_diagnosis", "preoperative_or_final_diagnosis", "primary_diagnosis"]),
    mustDifferentials: getAny(row, ["training_focus", "risk", "clinical_guardrail"]),
    keyHistory: [
      getAny(row, ["hematuria_type", "hematuria_visibility"]),
      get(row, "hematuria_phase"),
      get(row, "hematuria_color"),
      getAny(row, ["clots", "clot"]),
      get(row, "pain_relation"),
      get(row, "flank_pain"),
      get(row, "luts"),
      getAny(row, ["fever", "fever_chills"]),
      getAny(row, ["glomerular", "glomerular_clues"]),
      get(row, "false_hematuria_exclusion")
    ].filter(Boolean).join("；"),
    physicalExam: get(row, "physical_exam") || "生命体征、腹部/肾区、耻骨上区、外生殖器/妇科污染线索、水肿和血压按学生要求分层返回。",
    requiredLabs: getAny(row, ["admission_labs", "labs_to_order"]),
    specialTests: getAny(row, ["positive_findings", "positive_inpatient_results"]),
    imagingAndProcedures: getAny(row, ["admission_imaging", "imaging_to_order"]),
    orderReason: getAny(row, ["training_focus", "order_agent_release"]),
    consultDepartments: getAny(row, ["mdt", "consult_departments"]),
    consultQuestions: getAny(row, ["mdt_question", "mdt_questions"]),
    immediateTreatment: get(row, "initial_treatment"),
    definitiveTreatment: getAny(row, ["definitive_treatment", "definitive_treatment_plan", "next_management"]),
    followUp: getAny(row, ["next_management", "next_treatment_after_results"]),
    commonMisses: getAny(row, ["evaluator", "evaluator_deduct_points"]),
    teacherScoringPoints: getAny(row, ["evaluator", "evaluator_deduct_points"]),
    stagePath: "接诊与问诊->查体->开单检查->诊断与鉴别->会诊/MDT->治疗决策->随访与教育->复盘反馈"
  };
}

function makePatientAnswers(row: Row): PatientAnswers {
  return {
    color: get(row, "hematuria_color"),
    phase: get(row, "hematuria_phase"),
    clots: getAny(row, ["clots", "clot"]),
    pain: get(row, "pain_relation"),
    irritativeSymptoms: get(row, "luts"),
    fever: getAny(row, ["fever", "fever_chills"]),
    stoneClues: getAny(row, ["flank_pain", "pain_relation"]),
    tumorRisk: getAny(row, ["risk", "mdt"]),
    glomerularClues: getAny(row, ["glomerular", "glomerular_clues"]),
    opening: get(row, "chief_complaint")
  };
}

function makeStudentChiefComplaint(row: Row) {
  let chief = get(row, "chief_complaint");
  chief = chief.replace(/无痛性/g, "");
  chief = chief.replace(/肉眼血尿/g, "小便变红");
  chief = chief.replace(/镜下血尿/g, "尿检发现异常");
  chief = chief.replace(/血尿/g, "小便变红");
  chief = chief.replace(/肉眼小便变红/g, "小便变红");
  chief = chief.replace(/全程|终末|初始|起始/g, "");
  chief = chief.replace(/\s+/g, "").replace(/，+/g, "，").replace(/^，|，$/g, "");
  return chief || "小便颜色异常";
}

const physicalExamItems: PhysicalExamItem[] = [
  { examId: "PE001", category: "一般情况与生命体征", displayName: "体温", synonyms: ["体温", "发热", "测体温", "最高体温"] },
  { examId: "PE002", category: "一般情况与生命体征", displayName: "血压", synonyms: ["血压", "高血压", "测血压"] },
  { examId: "PE003", category: "一般情况与生命体征", displayName: "心率/呼吸/血氧", synonyms: ["心率", "脉搏", "呼吸", "血氧", "生命体征"] },
  { examId: "PE004", category: "一般情况与生命体征", displayName: "贫血貌/脱水貌/意识", synonyms: ["贫血貌", "脱水貌", "意识", "精神状态", "一般情况"] },
  { examId: "PE101", category: "腹部与泌尿系统", displayName: "腹部压痛", synonyms: ["腹部压痛", "肚子压痛", "下腹压痛", "腹痛查体"] },
  { examId: "PE102", category: "腹部与泌尿系统", displayName: "肾区叩击痛", synonyms: ["肾区叩击痛", "肾区", "叩击痛", "腰部叩痛", "肋脊角"] },
  { examId: "PE103", category: "腹部与泌尿系统", displayName: "输尿管走行区压痛", synonyms: ["输尿管压痛", "输尿管走行区", "输尿管点压痛"] },
  { examId: "PE104", category: "腹部与泌尿系统", displayName: "耻骨上膀胱充盈", synonyms: ["耻骨上", "膀胱充盈", "尿潴留", "下腹包块"] },
  { examId: "PE105", category: "腹部与泌尿系统", displayName: "腰部包块", synonyms: ["腰部包块", "肾区包块", "腹部包块"] },
  { examId: "PE201", category: "男性泌尿生殖", displayName: "外生殖器/尿道口", synonyms: ["外生殖器", "尿道口", "尿道口滴血", "阴茎"] },
  { examId: "PE202", category: "男性泌尿生殖", displayName: "阴囊", synonyms: ["阴囊", "睾丸", "附睾"] },
  { examId: "PE203", category: "男性泌尿生殖", displayName: "直肠指检/前列腺", synonyms: ["直肠指检", "前列腺", "肛诊", "DRE"] },
  { examId: "PE301", category: "女性相关", displayName: "妇科查体/阴道出血", synonyms: ["妇科查体", "阴道出血", "月经污染", "阴道污染", "外阴"] },
  { examId: "PE401", category: "全身系统", displayName: "水肿", synonyms: ["水肿", "下肢水肿", "眼睑水肿", "浮肿"] },
  { examId: "PE402", category: "全身系统", displayName: "皮疹紫癜/关节", synonyms: ["皮疹", "紫癜", "关节痛", "关节", "狼疮"] },
  { examId: "PE403", category: "全身系统", displayName: "心肺听诊", synonyms: ["心肺", "听诊", "肺部", "心脏"] }
];

function hasAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function makePatientPersona(row: Row): PatientPersona {
  if (get(row, "persona")) {
    return {
      emotion: get(row, "persona"),
      expressionAbility: "能用普通人语言描述症状，但不会主动使用医学术语。",
      healthLiteracy: "医学知识有限，不会主动解释诊断、机制或治疗方案。",
      memoryReliability: "根据追问提供信息，细节需学生主动确认。",
      cooperation: "学生问到具体问题时配合回答；未问到的关键事实不主动透露。",
      communicationNote: "回答保持标准化模拟患者风格：只回答被问到的信息，可表达担心，不给诊断和治疗建议。"
    };
  }
  const signal = [get(row, "disease_category"), get(row, "chief_complaint"), getAny(row, ["fever", "fever_chills"]), get(row, "pain_relation"), getAny(row, ["mdt", "mdt_trigger"])].join("；");
  const emotion = hasAny(signal, ["高热", "寒战", "梗阻", "休克"])
    ? "紧张、担心病情加重，疼痛或发热时表达急切"
    : hasAny(signal, ["肿瘤", "癌", "血块"])
      ? "焦虑，担心小便变红是不是严重疾病"
      : hasAny(signal, ["肾小球", "蛋白尿", "水肿"])
        ? "担心肾功能和长期影响，描述较谨慎"
        : "轻度担心，愿意配合问诊";
  return {
    emotion,
    expressionAbility: "能用普通人语言描述症状，但不会主动使用医学术语。",
    healthLiteracy: "医学知识有限，不会主动解释诊断、机制或治疗方案。",
    memoryReliability: hasAny(signal, ["反复", "间断", "长期"]) ? "大致可靠，具体时间需要学生追问确认。" : "较可靠。",
    cooperation: "学生问到具体问题时配合回答；未问到的关键事实不主动透露。",
    communicationNote: "回答保持标准化模拟患者风格：只回答被问到的信息，可表达担心，不给诊断和治疗建议。"
  };
}

function physicalResultFor(row: Row, item: PhysicalExamItem): PhysicalExamResult {
  const fever = getAny(row, ["fever", "fever_chills"]);
  const pain = get(row, "pain_relation");
  const luts = get(row, "luts");
  const clot = getAny(row, ["clots", "clot"]);
  const glomerular = getAny(row, ["glomerular", "glomerular_clues"]);
  const falseHematuria = get(row, "false_hematuria_exclusion");
  const history = get(row, "medical_history");
  const diagnosisSignal = [get(row, "primary_diagnosis"), getAny(row, ["preoperative_diagnosis", "preoperative_or_final_diagnosis"]), get(row, "disease_category"), getAny(row, ["mdt", "mdt_trigger"])].join("；");
  let result = "未见明确异常；该项查体需结合学生现场检查记录。";

  if (item.examId === "PE001") result = fever || "未诉发热寒战，体温未见明确异常。";
  if (item.examId === "PE002") result = hasAny(glomerular + history + diagnosisSignal, ["高血压", "肾炎", "肾小球"]) ? "需测量并记录血压；本例应特别关注血压升高线索。" : "血压未见明确异常。";
  if (item.examId === "PE003") result = hasAny(fever + diagnosisSignal, ["高热", "寒战", "脓毒症", "休克"]) ? "可见感染/疼痛相关心率增快风险，需同步记录呼吸和血氧。" : "心率、呼吸、血氧未见明确异常。";
  if (item.examId === "PE004") result = hasAny(fever + clot + diagnosisSignal, ["休克", "大量", "贫血", "脱水"]) ? "需关注贫血貌、脱水貌和意识状态；本例存在急症评估价值。" : "一般情况尚可，意识清楚。";
  if (item.examId === "PE101") result = luts || pain || "腹部未诉明显压痛。";
  if (item.examId === "PE102") result = pain || "未诉明显腰痛或肾区叩击痛线索。";
  if (item.examId === "PE103") result = hasAny(pain + diagnosisSignal, ["结石", "绞痛", "输尿管"]) ? "输尿管走行区压痛需重点检查，符合结石/梗阻定位思路。" : "输尿管走行区未见明确压痛线索。";
  if (item.examId === "PE104") result = hasAny(clot + luts + diagnosisSignal, ["血块", "尿潴留", "排尿困难", "前列腺"]) ? "需触诊耻骨上区，评估膀胱充盈和血块尿潴留。" : "耻骨上区未见明确膀胱充盈线索。";
  if (item.examId === "PE105") result = hasAny(diagnosisSignal, ["巨大肾", "肾癌", "肿块", "瘤栓"]) ? "需检查腰腹部包块和压痛，辅助评估肾脏占位。" : "未见明确腰部包块线索。";
  if (item.examId === "PE201") result = "外生殖器和尿道口需检查有无损伤、滴血、分泌物或污染；当前病例无额外主动暴露信息。";
  if (item.examId === "PE202") result = "阴囊、睾丸和附睾未见明确异常线索。";
  if (item.examId === "PE203") result = hasAny(diagnosisSignal, ["前列腺", "BPH", "PSA"]) ? "需行直肠指检评估前列腺大小、质地、压痛和结节。" : "直肠指检/前列腺未见明确异常线索。";
  if (item.examId === "PE301") result = falseHematuria || (get(row, "gender") === "女" ? "女性病例需排除月经、阴道出血或标本污染。" : "本项对男性病例通常不适用。");
  if (item.examId === "PE401") result = hasAny(glomerular + diagnosisSignal, ["水肿", "蛋白尿", "肾小球", "肾炎"]) ? "需查眼睑和双下肢水肿；本例存在肾小球性线索时尤为重要。" : "未见明确水肿线索。";
  if (item.examId === "PE402") result = hasAny(glomerular + diagnosisSignal, ["狼疮", "紫癜", "ANCA", "免疫", "关节"]) ? "需查皮疹、紫癜、关节压痛/肿胀等系统性疾病线索。" : "未见明确皮疹紫癜或关节异常线索。";
  if (item.examId === "PE403") result = "心肺听诊未见明确异常线索；如存在感染、贫血、容量负荷或围术期风险需完整记录。";

  return {
    caseId: rowCaseId(row),
    examId: item.examId,
    displayName: item.displayName,
    category: item.category,
    result,
    teachingNote: "Exam Agent 只在学生选择或输入该查体项目后返回结果。"
  };
}

function makeCase(row: Row, answers: Record<string, InterviewAnswer>, cards: CaseCardItem[]): CaseData {
  const id = rowCaseId(row);
  const diagnosis = getAny(row, ["final_diagnosis", "primary_diagnosis"]);
  return {
    id,
    sourcePatientId: get(row, "patient_id"),
    title: getAny(row, ["source_sheet", "模板sheet", "primary_diagnosis"]) || id,
    difficulty: get(row, "difficulty"),
    diseaseCategory: get(row, "disease_category"),
    age: get(row, "age"),
    sex: get(row, "gender"),
    studentChiefComplaint: makeStudentChiefComplaint(row),
    chiefComplaint: get(row, "chief_complaint"),
    presentIllness: makePresentIllness(row),
    riskFactors: makeRiskFactors(row),
    pastHistory: get(row, "medical_history"),
    personalHistory: get(row, "medical_history"),
    familyHistory: get(row, "medical_history"),
    medication: get(row, "medication"),
    urineTestResult: get(row, "urine_test_result"),
    investigations: [
      { type: "尿检", result: get(row, "urine_test_result") },
      { type: "影像", result: get(row, "imaging_finding") }
    ].filter((item) => item.result),
    patientAnswers: makePatientAnswers(row),
    patientPersona: makePatientPersona(row),
    diagnosis,
    teachingPoints: splitList(get(row, "clinical_guardrail")),
    standardSummary: `${get(row, "chief_complaint")}。${get(row, "symptoms_detail")} ${get(row, "medical_history")}`,
    differentialDiagnosis: splitList(getAny(row, ["training_focus", "risk", "clinical_guardrail"])),
    teacherComment: getAny(row, ["evaluator", "evaluator_deduct_points"]),
    scoringKey: splitList(getAny(row, ["evaluator", "evaluator_deduct_points"])),
    clinical: makeClinical(row),
    stageTasks: [],
    interviewAnswers: answers,
    caseCard: cards,
    raw: {
      symptomsDetail: get(row, "symptoms_detail"),
      medicalHistory: get(row, "medical_history"),
      sheetName: "总表_V2病例库"
    }
  };
}

function makeQuestionAnswer(row: Row): InterviewAnswer {
  return {
    caseId: rowCaseId(row),
    slotId: get(row, "slot_id"),
    label: get(row, "slot_name"),
    possibleQuestion: getAny(row, ["student_possible_question", "学生可能问法"]),
    patientAnswer: getAny(row, ["patient_answer", "Patient Agent标准回答"]) || "未诉/否认",
    clinicalMeaning: getAny(row, ["teacher_note", "教师提示"]),
    scoringKeywords: getAny(row, ["score_keywords", "是否关键槽位"]),
    finalDiagnosis: "",
    correctedDiseaseCategory: ""
  };
}

function makeSlot(row: Row): InterviewSlot {
  const question = getAny(row, ["student_possible_question", "学生可能问法"]);
  const isKeyText = getAny(row, ["score_keywords", "是否关键槽位"]);
  return {
    slotId: get(row, "slot_id"),
    label: get(row, "slot_name"),
    recommendedQuestion: question,
    triggers: splitList(question),
    wideField: get(row, "slot_name"),
    isKey: /是|关键|必问|得分/.test(isKeyText),
    score: /是|关键|必问|得分/.test(isKeyText) ? 5 : 2,
    missingFeedback: getAny(row, ["teacher_note", "教师提示"])
  };
}

function makeCard(row: Row): CaseCardItem {
  return {
    caseId: rowCaseId(row),
    category: getAny(row, ["section", "字段分类"]),
    fieldName: getAny(row, ["field_label", "字段名", "field_key"]),
    value: getAny(row, ["value", "内容"]),
    visibility: getAny(row, ["visibility", "显示权限/释放阶段"]) || "teacher",
    releaseCondition: getAny(row, ["visibility", "显示权限/释放阶段"]) || "teacher",
    agent: getAny(row, ["field_key", "英文key"])
  };
}

function makeOrderResult(row: Row): OrderResultItem {
  return {
    caseId: rowCaseId(row),
    orderId: get(row, "order_id"),
    diagnosis: "",
    diseaseType: "",
    orderCategory: getAny(row, ["order_category", "医嘱分类"]) || getAny(row, ["order_name", "规范医嘱名"]),
    synonyms: [getAny(row, ["order_name", "规范医嘱名"]), ...splitList(getAny(row, ["synonyms", "同义词"]))].filter(Boolean),
    result: getAny(row, ["result_after_order", "模拟返回结果"]) || "该病例暂无此项阳性结果，需结合临床判断。",
    abnormalLevel: "模拟返回",
    teachingExplanation: getAny(row, ["release_rule", "释放规则"]),
    isKey: true,
    prerequisite: getAny(row, ["release_rule", "释放规则"])
  };
}

function makeMdt(row: Row): MdtTrigger {
  return {
    caseId: rowCaseId(row),
    diagnosis: getAny(row, ["diagnosis", "final_diagnosis"]),
    diseaseType: getAny(row, ["diagnosis", "final_diagnosis"]),
    required: Boolean(getAny(row, ["recommended_departments", "建议会诊科室"])),
    idealTiming: getAny(row, ["trigger_summary", "MDT触发点"]),
    departments: getAny(row, ["recommended_departments", "建议会诊科室"]),
    purpose: getAny(row, ["consult_question", "会诊需解决的问题"]),
    missedPenalty: getAny(row, ["evaluator_rule", "扣分点"]),
    expertChallenge: getAny(row, ["evaluator_rule", "优秀表现"])
  };
}

function makeUiRule(row: Row): UiReleaseRule {
  return {
    stage: get(row, "字段分类"),
    preSubmitAllowed: get(row, "学生端释放规则") === "student_entry" ? get(row, "推荐字段名") : "",
    preSubmitForbidden: get(row, "学生端释放规则") === "student_entry" ? "" : get(row, "推荐字段名"),
    postSubmitAllowed: get(row, "推荐字段名"),
    technicalAdvice: get(row, "Codex用途")
  };
}

function sanitizeSourceRows(items: Row[]) {
  const legacyCaseTerm = ["补充", "病例"].join("");
  const legacyLibraryTerm = ["旧", "病例库"].join("");
  const legacyGeneratedTerm = ["此前由助手生成的36个补充教学", "病例"].join("");
  return items.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    compact(value)
      .replaceAll(legacyCaseTerm, "非V2病例")
      .replaceAll(legacyLibraryTerm, "非V2病例库")
      .replaceAll(legacyGeneratedTerm, "此前非V2教学病例")
  ])));
}

function makeRubric(): EvaluatorRubricItem[] {
  return [
    { dimension: "病史采集与血尿定位", max: 50, observation: "主诉、起病、可见性、时相、颜色、血块、疼痛、伴随症状", autoEvidence: "命中问诊槽位HX001-HX012", redFlags: "提交前不得显示漏项；未问时相/血块/感染/肾小球线索扣分", relatedAgent: "Patient+Evaluator" },
    { dimension: "危险因素和安全网", max: 40, observation: "既往史、用药史、个人史、肿瘤/感染/肾小球/假性血尿安全网", autoEvidence: "命中HX013-HX015", redFlags: "抗凝药不能直接解释血尿；女性需排除污染", relatedAgent: "Patient+Evaluator" },
    { dimension: "查体与急症识别", max: 35, observation: "针对性查体与休克、脓毒症、尿潴留、AKI、外伤识别", autoEvidence: "Examination Agent查体和时间线", redFlags: "急症病例未评估生命体征或稳定患者", relatedAgent: "Examination/Order Agent" },
    { dimension: "诊断与鉴别诊断", max: 45, observation: "定位、最可能诊断、至少3项鉴别及确认计划", autoEvidence: "诊断阶段提交记录", redFlags: "遗漏高危诊断或单一病因化", relatedAgent: "Diagnostic Reasoning Agent" },
    { dimension: "检验、影像、内镜及病理决策", max: 55, observation: "必要检查、前置条件、重复与过度检查", autoEvidence: "结构化医嘱和报告日志", redFlags: "未开不得显示结果；关键漏检、重复和过度检查分别计分", relatedAgent: "Examination/Order Agent" },
    { dimension: "MDT与会诊", max: 45, observation: "科室、触发原因、问题、证据和汇报摘要", autoEvidence: "MDT申请和专家意见", redFlags: "只勾科室不写目的不得提交", relatedAgent: "MDT Agent" },
    { dimension: "治疗及围术期管理", max: 50, observation: "即时、病因、确定性和围术期管理", autoEvidence: "治疗与围术期提交记录", redFlags: "感染梗阻不得先碎石；肿瘤治疗需病理/分期", relatedAgent: "Treatment+Perioperative" },
    { dimension: "随访、教育和表达效率", max: 40, observation: "复查时点、教育、表达和资源效率", autoEvidence: "完整训练时间线", redFlags: "无随访计划或重复操作堆砌", relatedAgent: "Evaluator Agent" }
  ];
}

function makeOsceRubric(): OsceRubricItem[] {
  return [
    { station: "Agent 1", dimension: "病史采集与血尿定位", max: 50, observableBehavior: "确认真性血尿并完成核心定位。", criticalErrors: "未完成基本定位即直接诊断。" },
    { station: "Agent 1/7", dimension: "危险因素和安全网", max: 40, observableBehavior: "覆盖病例特异危险因素和安全网。", criticalErrors: "把抗栓药作为唯一病因或漏急症红旗。" },
    { station: "Agent 2", dimension: "查体与急症识别", max: 35, observableBehavior: "选择针对性查体并先稳定急症。", criticalErrors: "休克、脓毒症、尿潴留、AKI或外伤漏识别。" },
    { station: "Agent 3", dimension: "诊断与鉴别诊断", max: 45, observableBehavior: "最可能诊断、依据、至少3项鉴别和确认计划。", criticalErrors: "遗漏高危诊断。" },
    { station: "Agent 2", dimension: "检验、影像、内镜及病理决策", max: 55, observableBehavior: "合理开单并避免重复过度检查。", criticalErrors: "引用未开结果或关键漏检。" },
    { station: "Agent 4", dimension: "MDT与会诊", max: 45, observableBehavior: "填写科室、触发原因、问题、证据和摘要。", criticalErrors: "只勾科室。" },
    { station: "Agent 5-6", dimension: "治疗及围术期管理", max: 50, observableBehavior: "即时、病因、确定性和围术期处理顺序安全。", criticalErrors: "感染性梗阻直接碎石或无病理分期治疗肿瘤。" },
    { station: "Agent 7", dimension: "随访、教育和表达效率", max: 40, observableBehavior: "随访时点、教育、表达与资源效率。", criticalErrors: "无随访计划。" }
  ];
}

function main() {
  const workbook = XLSX.readFile(input);
  const totalSheet = pickSheet(workbook, ["总表_V2病例库", "总表_导师模板补全"]);
  const qaSheet = pickSheet(workbook, ["问诊槽位答案_逐项", "血尿问诊_逐项答案"]);
  const cardSheet = pickSheet(workbook, ["病例卡_导师模板长表"]);
  const orderSheet = pickSheet(workbook, ["开单返回结果_病例级"]);
  const mdtSheet = pickSheet(workbook, ["MDT触发_病例级"]);
  const totalRows = filterAllowedRows(rows(workbook, totalSheet));
  const qaRows = filterAllowedRows(rows(workbook, qaSheet));
  const cardRows = filterAllowedRows(rows(workbook, cardSheet));
  const orderRows = filterAllowedRows(rows(workbook, orderSheet));
  const mdtRows = filterAllowedRows(rows(workbook, mdtSheet));
  const fieldRows = hasSheet(workbook, "导师模板字段定义") ? rows(workbook, "导师模板字段定义") : [];
  const sourceRows = hasSheet(workbook, "来源与使用说明") ? rows(workbook, "来源与使用说明") : [];

  const qa = qaRows.map(makeQuestionAnswer).filter((item) => allowedCaseIds.has(item.caseId) && item.slotId);
  const answersByCase = qa.reduce<Record<string, Record<string, InterviewAnswer>>>((acc, item) => {
    acc[item.caseId] ??= {};
    acc[item.caseId][item.slotId] = item;
    return acc;
  }, {});
  const cards = cardRows.map(makeCard).filter((item) => allowedCaseIds.has(item.caseId) && item.fieldName);
  const cardsByCase = cards.reduce<Record<string, CaseCardItem[]>>((acc, item) => {
    acc[item.caseId] ??= [];
    acc[item.caseId].push(item);
    return acc;
  }, {});
  const slots = Array.from(new Map(qaRows.map(makeSlot).filter((item) => item.slotId).map((item) => [item.slotId, item])).values());

  const cases = totalRows.map((row) => makeCase(row, answersByCase[rowCaseId(row)] ?? {}, cardsByCase[rowCaseId(row)] ?? [])).filter((item) => allowedCaseIds.has(item.id));
  const orderResults = orderRows.map(makeOrderResult).filter((item) => allowedCaseIds.has(item.caseId) && item.orderId);
  const mdtTriggers = mdtRows.map(makeMdt).filter((item) => allowedCaseIds.has(item.caseId));
  const uiReleaseRules = fieldRows.map(makeUiRule).filter((item) => item.stage || item.postSubmitAllowed);
  const physicalExamResults = totalRows.flatMap((row) => physicalExamItems.map((item) => physicalResultFor(row, item))).filter((item) => allowedCaseIds.has(item.caseId));

  writeJson("cases.json", cases);
  writeJson("case_cards.json", cards);
  writeJson("question_answers.json", qa);
  writeJson("interview_answers.json", qa);
  writeJson("interview_slots.json", slots);
  writeJson("question_slots.json", slots);
  writeJson("physical_exam_items.json", physicalExamItems);
  writeJson("physical_exam_results.json", physicalExamResults);
  writeJson("order_results.json", orderResults);
  writeJson("mdt_triggers.json", mdtTriggers);
  writeJson("evaluator_rubric.json", makeRubric());
  writeJson("osce_rubric.json", makeOsceRubric());
  writeJson("stage_tasks.json", []);
  writeJson("ui_release_rules.json", uiReleaseRules);
  writeJson("tutor_template_sources.json", sanitizeSourceRows(sourceRows));
  writeJson("excel-import-report.json", {
    input,
    caseLibraryVersion: "V2-only",
    generatedAt: process.env.CASE_LIBRARY_BUILD_ID || "deterministic",
    cases: cases.length,
    caseCards: cards.length,
    questionAnswers: qa.length,
    orderResults: orderResults.length,
    mdtTriggers: mdtTriggers.length,
    physicalExamItems: physicalExamItems.length,
    physicalExamResults: physicalExamResults.length,
    uiReleaseRules: uiReleaseRules.length,
    allowedCaseIds: Array.from(allowedCaseIds),
    sourceSheets: workbook.SheetNames
  });

  console.log(`Converted V2-only case library: ${cases.length} cases, ${qa.length} question answers, ${orderResults.length} order results.`);
}

main();
