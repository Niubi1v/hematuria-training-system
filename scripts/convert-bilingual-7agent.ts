import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const input = process.argv[2] ?? "work/source/v2_bilingual.xlsx";
const outputDir = process.argv[3] ?? "data";
const allowedCaseIds = new Set(Array.from({ length: 12 }, (_, index) => `P${String(index + 1).padStart(3, "0")}`));

type Row = Record<string, unknown>;

function compact(value: unknown) {
  return String(value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function get(row: Row, key: string) {
  return compact(row[key]);
}

function rows(workbook: XLSX.WorkBook, sheetName: string): Row[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Missing sheet: ${sheetName}`);
  return XLSX.utils.sheet_to_json<Row>(sheet, { defval: "", raw: false });
}

function writeJson(name: string, data: unknown) {
  fs.mkdirSync(path.dirname(path.join(outputDir, name)), { recursive: true });
  fs.writeFileSync(path.join(outputDir, name), JSON.stringify(data, null, 2), "utf8");
}

function filterCases(items: Row[], key = "patient_id") {
  return items.filter((row) => allowedCaseIds.has(get(row, key)));
}

function makeAgents(rows: Row[]) {
  return rows.map((row) => ({
    stageNo: Number(get(row, "stage_no")),
    key: `agent${get(row, "stage_no")}`,
    agentName: {
      zh: get(row, "agent_name_zh"),
      en: get(row, "agent_name_en")
    },
    leftNavLabel: {
      zh: get(row, "left_nav_label_zh"),
      en: get(row, "left_nav_label_en")
    },
    competency: {
      zh: get(row, "resident_core_competency_zh"),
      en: get(row, "resident_core_competency_en")
    },
    mainWindowFunction: {
      zh: get(row, "main_window_function_zh"),
      en: get(row, "main_window_function_en")
    },
    keyRule: get(row, "key_rule")
  })).filter((item) => item.stageNo >= 1 && item.stageNo <= 7);
}

function makeEnglishCase(row: Row) {
  return {
    id: get(row, "patient_id"),
    sourcePatientId: get(row, "patient_id"),
    title: get(row, "source_sheet_en") || get(row, "initial_diagnosis_en") || get(row, "patient_id"),
    source: get(row, "case_source_en"),
    age: get(row, "age"),
    sex: get(row, "sex_en"),
    difficulty: get(row, "difficulty_en"),
    diseaseCategory: get(row, "disease_category_en"),
    trainingFocus: get(row, "training_focus_en"),
    chiefComplaint: get(row, "chief_complaint_en"),
    studentChiefComplaint: get(row, "chief_complaint_en"),
    symptomsDetail: get(row, "symptoms_detail_en"),
    hematuriaType: get(row, "hematuria_type_en"),
    hematuriaPhase: get(row, "hematuria_phase_en"),
    urineColor: get(row, "urine_color_en"),
    clots: get(row, "clots_en"),
    painRelation: get(row, "pain_relation_en"),
    feverChills: get(row, "fever_chills_en"),
    flankPain: get(row, "flank_pain_en"),
    luts: get(row, "luts_en"),
    glomerularClues: get(row, "glomerular_clues_en"),
    pastHistory: get(row, "past_history_en"),
    medications: get(row, "medications_en"),
    riskSummary: get(row, "risk_summary_en"),
    patientPersona: get(row, "patient_persona_en"),
    physicalExam: get(row, "physical_exam_en"),
    urineTest: get(row, "urine_test_en"),
    imaging: get(row, "imaging_en"),
    initialDiagnosis: get(row, "initial_diagnosis_en"),
    admissionLabs: get(row, "admission_labs_en"),
    admissionImaging: get(row, "admission_imaging_en"),
    initialTreatmentPlan: get(row, "initial_treatment_plan_en"),
    keyPositiveFindings: get(row, "key_positive_findings_en"),
    nextManagement: get(row, "next_management_en"),
    finalDiagnosis: get(row, "preoperative_or_final_diagnosis_en") || get(row, "initial_diagnosis_en"),
    perioperativePoints: get(row, "perioperative_points_en"),
    definitiveTreatment: get(row, "definitive_treatment_en"),
    mdtDepartments: get(row, "mdt_departments_en"),
    mdtQuestion: get(row, "mdt_question_en"),
    evaluatorKeyPoints: get(row, "evaluator_key_points_en")
  };
}

function makeChineseCase(row: Row) {
  return {
    id: get(row, "patient_id"),
    title: get(row, "disease_zh"),
    titleEn: get(row, "disease_en"),
    age: get(row, "age"),
    sex: get(row, "gender_zh"),
    sexEn: get(row, "sex_en"),
    chiefComplaint: get(row, "chief_complaint_zh"),
    chiefComplaintEn: get(row, "chief_complaint_en"),
    symptomsDetail: get(row, "symptoms_detail_zh"),
    symptomsDetailEn: get(row, "symptoms_detail_en"),
    diagnosis: get(row, "primary_diagnosis_zh"),
    diagnosisEn: get(row, "initial_diagnosis_en"),
    admissionLabs: get(row, "admission_labs_zh"),
    admissionLabsEn: get(row, "admission_labs_en"),
    admissionImaging: get(row, "admission_imaging_zh"),
    admissionImagingEn: get(row, "admission_imaging_en"),
    treatment: get(row, "initial_treatment_zh"),
    treatmentEn: get(row, "initial_treatment_plan_en"),
    mdt: get(row, "mdt_zh"),
    mdtEn: get(row, "mdt_departments_en"),
    evaluator: get(row, "evaluator_zh"),
    evaluatorEn: get(row, "evaluator_key_points_en")
  };
}

function makeEnCard(row: Row) {
  return {
    caseId: get(row, "case_id"),
    stageNo: Number(get(row, "stage_no")),
    agentStage: get(row, "agent_stage_en"),
    fieldKey: get(row, "field_key"),
    fieldLabel: get(row, "field_label_en"),
    value: get(row, "value_en"),
    studentVisibleTiming: get(row, "student_visible_timing"),
    teacherOnly: /^yes$/i.test(get(row, "teacher_only"))
  };
}

function makeWorkflow(rows: Row[]) {
  return rows.map((row) => ({
    component: get(row, "component"),
    requirement: {
      zh: get(row, "requirement_zh"),
      en: get(row, "requirement_en")
    },
    implementationNote: get(row, "implementation_note")
  }));
}

function zhI18n() {
  return {
    languageName: "中文",
    appTitle: "血尿 7-Agent 临床思维训练工作台",
    appSubtitle: "按 1→7 顺序完成接诊、检查、诊断、MDT、治疗、围术期管理与复盘。",
    backToCases: "返回病例库",
    freeTraining: "自由训练",
    osceMode: "OSCE 模式",
    visibleInfo: "当前可见资料",
    trainingState: "训练状态",
    chiefComplaint: "主诉",
    ageSex: "年龄/性别",
    currentTask: "当前任务",
    obtainedData: "已获得资料",
    timeline: "时间线",
    saveDraft: "保存草稿",
    submitStage: "提交本阶段",
    nextStage: "进入下一智能体",
    locked: "未解锁",
    completed: "已完成",
    active: "当前",
    submitFirst: "请先提交前一阶段",
    language: "语言",
    zh: "中文",
    en: "English",
    inputQuestion: "输入问诊问题",
    send: "发送",
    generating: "生成中",
    voiceAsk: "语音提问",
    historySummary: "病史小结",
    noFeedbackBeforeSubmit: "提交前不显示病例特异漏项、得分点或标准答案。",
    stageFeedback: "阶段反馈",
    labs: "检验",
    imaging: "检查",
    procedures: "病理/操作",
    perioperativeOrders: "围术期评估",
    orderSearch: "搜索医嘱名称或同义词，例如 CTU、尿培养、膀胱镜",
    orderAndReturn: "开立并返回结果",
    selectedOrderResults: "返回已选项目结果",
    diagnosis: "最可能诊断",
    diagnosticEvidence: "诊断依据",
    differentials: "至少 3 个鉴别诊断",
    differentialAnalysis: "各鉴别诊断的支持点与反对点",
    confirmatoryTests: "还需哪些检查进一步确认",
    consultNeed: "是否需要会诊",
    consultPurpose: "会诊目的和要解决的问题",
    consultQuestions: "希望专家回答的具体问题",
    consultSummary: "病例汇报摘要",
    startMdt: "发起 MDT 并获取专家意见",
    treatmentImmediate: "急诊或入院即时处理",
    treatmentDefinitive: "确定性治疗/后续治疗",
    mdtRevisedPlan: "MDT 后修订方案",
    perioperativeTitle: "围术期管理方案",
    perioperativeFields: "术前问题、麻醉评估、心肺功能、备血、感染控制、抗凝/抗血小板、血糖/血压/贫血/肾功能优化、VTE 预防、ERAS、术后并发症预防",
    debriefTitle: "评估复盘",
    finalReport: "最终能力画像",
    studentRecords: "学生记录",
    standardPath: "标准路径摘要",
    purposeRequired: "请填写会诊目的和需要解决的问题，不能只勾选科室。",
    teachingOnly: "所有答案均为教学模拟，不作为真实诊疗建议。"
  };
}

function enI18n() {
  return {
    languageName: "English",
    appTitle: "Hematuria 7-Agent Clinical Reasoning Workspace",
    appSubtitle: "Complete the full workflow in order: interview, investigation, diagnosis, MDT, treatment, perioperative management, and debriefing.",
    backToCases: "Back to cases",
    freeTraining: "Free training",
    osceMode: "OSCE mode",
    visibleInfo: "Visible information",
    trainingState: "Training state",
    chiefComplaint: "Chief complaint",
    ageSex: "Age / Sex",
    currentTask: "Current task",
    obtainedData: "Obtained data",
    timeline: "Timeline",
    saveDraft: "Save draft",
    submitStage: "Submit stage",
    nextStage: "Next Agent",
    locked: "Locked",
    completed: "Completed",
    active: "Active",
    submitFirst: "Submit the previous stage first",
    language: "Language",
    zh: "中文",
    en: "English",
    inputQuestion: "Enter an interview question",
    send: "Send",
    generating: "Generating",
    voiceAsk: "Voice question",
    historySummary: "History summary",
    noFeedbackBeforeSubmit: "Before submission, case-specific omissions, scoring points, and standard answers are hidden.",
    stageFeedback: "Stage feedback",
    labs: "Laboratory",
    imaging: "Imaging / tests",
    procedures: "Pathology / procedure",
    perioperativeOrders: "Perioperative assessment",
    orderSearch: "Search orders or synonyms, e.g. CTU, urine culture, cystoscopy",
    orderAndReturn: "Order and return results",
    selectedOrderResults: "Return selected results",
    diagnosis: "Most likely diagnosis",
    diagnosticEvidence: "Diagnostic evidence",
    differentials: "At least 3 differential diagnoses",
    differentialAnalysis: "Supportive and opposing points for each differential",
    confirmatoryTests: "Further tests needed to confirm",
    consultNeed: "Need consultation?",
    consultPurpose: "Consultation purpose and problem to solve",
    consultQuestions: "Specific questions for consultants",
    consultSummary: "Case handoff summary",
    startMdt: "Start MDT and get expert opinions",
    treatmentImmediate: "Immediate ED/admission management",
    treatmentDefinitive: "Definitive / subsequent treatment",
    mdtRevisedPlan: "Post-MDT revised plan",
    perioperativeTitle: "Perioperative management plan",
    perioperativeFields: "Preoperative problems, anesthesia assessment, cardiopulmonary function, blood preparation, infection control, antithrombotic management, glucose/BP/anemia/renal optimization, VTE prevention, ERAS, and postoperative complication prevention",
    debriefTitle: "Assessment & Debriefing",
    finalReport: "Final competency profile",
    studentRecords: "Learner records",
    standardPath: "Standard pathway summary",
    purposeRequired: "Please enter the consultation purpose and problem to solve. Departments alone are not enough.",
    teachingOnly: "For educational simulation only. Not medical advice."
  };
}

function rubric(name: string) {
  return {
    version: "7-agent-bilingual-v1",
    total: name === "diagnostic" ? 100 : name === "perioperative" ? 60 : 100,
    dimensions: name === "diagnostic"
      ? [
        "Confirm true hematuria",
        "Localize medical vs surgical hematuria",
        "Identify tumor, stone, infection, glomerular and pseudohematuria pathways",
        "Provide at least 3 differentials with supporting and opposing evidence",
        "Avoid high-risk premature closure"
      ]
      : name === "perioperative"
        ? [
          "Preoperative optimization",
          "Anesthesia and cardiopulmonary assessment",
          "Bleeding, anticoagulant and transfusion planning",
          "Infection control and renal function protection",
          "VTE prevention, ERAS and postoperative complication prevention"
        ]
        : [
          "History record",
          "Investigation record",
          "Diagnostic reasoning",
          "MDT coordination",
          "Clinical decision support",
          "Perioperative management",
          "Timeline and reflection",
          "Dangerous errors and learning plan"
        ]
  };
}

function main() {
  const workbook = XLSX.readFile(input);
  const agents = makeAgents(rows(workbook, "7_Agent_UI_Bilingual"));
  const casesEn = filterCases(rows(workbook, "EN_Case_Master")).map(makeEnglishCase);
  const casesZh = filterCases(rows(workbook, "Case_Master_Bilingual")).map(makeChineseCase);
  const cardsEn = rows(workbook, "EN_Case_Cards_Long").filter((row) => allowedCaseIds.has(get(row, "case_id"))).map(makeEnCard);
  const workflow = makeWorkflow(rows(workbook, "UI_Workflow_Spec"));

  writeJson("agents.json", agents);
  writeJson("cases_en.json", casesEn);
  writeJson("cases_zh.json", casesZh);
  writeJson("case_cards_en.json", cardsEn);
  writeJson("i18n/zh.json", zhI18n());
  writeJson("i18n/en.json", enI18n());
  writeJson("ui_workflow_spec.json", workflow);
  writeJson("diagnostic_rubric.json", rubric("diagnostic"));
  writeJson("perioperative_rubric.json", rubric("perioperative"));
  writeJson("debriefing_rubric.json", rubric("debriefing"));
  writeJson("bilingual-import-report.json", {
    input,
    generatedAt: new Date().toISOString(),
    casesEn: casesEn.length,
    casesZh: casesZh.length,
    cardsEn: cardsEn.length,
    agents: agents.length,
    allowedCaseIds: Array.from(allowedCaseIds),
    sourceSheets: workbook.SheetNames
  });

  console.log(`Generated bilingual 7-Agent data: ${agents.length} agents, ${casesEn.length} EN cases, ${cardsEn.length} EN cards.`);
}

main();
