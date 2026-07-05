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
    { dimension: "诊断与鉴别", max: 45, observation: "定位内外科来源，提出至少3个鉴别诊断", autoEvidence: "诊断文本关键词与病例路径匹配", redFlags: "只按单一病因处理扣分", relatedAgent: "Evaluator" },
    { dimension: "开单检查", max: 55, observation: "检验、检查、病理/操作、围术期评估合理", autoEvidence: "Order Agent命中规范医嘱", redFlags: "未开不得显示结果；缺尿沉渣/CTU/膀胱镜/肾活检等按场景扣分", relatedAgent: "Order+Evaluator" },
    { dimension: "会诊与MDT", max: 45, observation: "科室选择、触发时机、会诊目的聚焦", autoEvidence: "MDT触发规则与学生科室匹配", redFlags: "只勾科室不写目的不得提交", relatedAgent: "MDT+Evaluator" },
    { dimension: "治疗决策", max: 50, observation: "即时处理、确定性治疗、围术期准备", autoEvidence: "治疗文本与病例路径匹配", redFlags: "感染梗阻不得先碎石；肿瘤治疗需病理/分期", relatedAgent: "Evaluator" },
    { dimension: "随访与教育", max: 30, observation: "复查、随访、患者教育和生活方式", autoEvidence: "随访文本关键词", redFlags: "缺关键复查计划扣分", relatedAgent: "Evaluator" },
    { dimension: "效率与表达", max: 45, observation: "问诊逻辑、资源使用、表达清晰", autoEvidence: "完整训练记录", redFlags: "跳步或提前暴露标准答案扣分", relatedAgent: "Evaluator" }
  ];
}

function makeOsceRubric(): OsceRubricItem[] {
  return [
    { station: "接诊与问诊", dimension: "围绕主诉开放式开场并追问血尿特征", max: 25, observableBehavior: "能主动追问出现时间、肉眼/镜下、时相、颜色、血块、诱因和持续时间。", criticalErrors: "未问血尿特征即进入诊断或开单。" },
    { station: "接诊与问诊", dimension: "伴随症状和危险因素安全网", max: 25, observableBehavior: "覆盖尿路刺激征、腰痛/肾绞痛、发热寒战、排尿困难、吸烟、职业暴露、抗凝/抗血小板、结石/感染史。", criticalErrors: "无痛肉眼血尿漏问吸烟/血块/时相；感染病例漏问发热寒战和腰痛。" },
    { station: "查体", dimension: "按定位选择查体项目", max: 20, observableBehavior: "能按病情选择生命体征、腹部/肾区、耻骨上区、外生殖器/妇科污染、皮疹水肿等查体。", criticalErrors: "急症病例未评估生命体征或肾区叩击痛。" },
    { station: "开单检查", dimension: "检验、影像、内镜/病理、围术期评估合理", max: 40, observableBehavior: "按疾病定位选择尿常规/沉渣、培养、肾功能、凝血、CTU/CT KUB、膀胱镜、病理、肾活检等。", criticalErrors: "未开项目却引用结果；感染性梗阻未做培养和影像评估。" },
    { station: "诊断与鉴别", dimension: "能提出定位诊断和至少3个鉴别诊断", max: 35, observableBehavior: "每个鉴别诊断有支持点、反驳点和下一步确认检查。", criticalErrors: "将抗凝药直接作为唯一病因。" },
    { station: "会诊/MDT", dimension: "会诊触发、科室选择和问题聚焦", max: 30, observableBehavior: "能判断是否需要会诊，选择相关科室，提交结构化会诊目的和交接摘要。", criticalErrors: "只勾科室不写会诊目的；肾小球安全网未请肾内科。" },
    { station: "治疗决策", dimension: "即时处理、确定性治疗、围术期和MDT后修订", max: 35, observableBehavior: "区分急症处理、入院初始处理、病理/分期后的确定性治疗、围术期准备和MDT修订。", criticalErrors: "感染性梗阻未引流先碎石；血块尿潴留未导尿冲洗。" },
    { station: "随访与复盘", dimension: "随访复查、患者教育与学习反思", max: 20, observableBehavior: "能提出复查项目、复诊时点、生活方式和复盘改进点。", criticalErrors: "肿瘤或肾小球病例无随访计划。" }
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
    generatedAt: new Date().toISOString(),
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
