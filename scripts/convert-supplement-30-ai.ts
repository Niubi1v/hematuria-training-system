import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { readWorkbookFile } from "./lib/safe-workbook";

const input = process.argv[2] ?? "work/source/supplement_30_ai.xlsx";
const outputDir = process.argv[3] ?? "data";
const defaultCaseSet = process.env.CASE_SET || process.env.NEXT_PUBLIC_CASE_SET || "v2_plus_30";
const v2Ids = new Set(Array.from({ length: 12 }, (_, index) => `P${String(index + 1).padStart(3, "0")}`));
const addIds = new Set(Array.from({ length: 30 }, (_, index) => `HX-ADD-${String(index + 1).padStart(3, "0")}`));

type Row = Record<string, unknown>;
type JsonObject = Record<string, unknown>;

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

function readJson<T>(name: string, fallback: T): T {
  const file = path.join(outputDir, name);
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function writeJson(name: string, data: unknown) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, name), JSON.stringify(data, null, 2), "utf8");
}

function splitList(text: string) {
  return compact(text).split(/[；;、,\n]/).map((item) => item.trim()).filter(Boolean);
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function rowId(row: Row) {
  return get(row, "patient_id") || get(row, "case_id");
}

function isV2(id: string) {
  return v2Ids.has(id);
}

function isAdd(id: string) {
  return addIds.has(id);
}

function loadV2Data<T extends JsonObject>(fileName: string, idKey: "id" | "caseId") {
  const existingV2 = readJson<T[]>(fileName.replace(".json", "_v2.json"), []);
  if (existingV2.length) return existingV2.filter((item) => v2Ids.has(String(item[idKey] ?? "")));
  const current = readJson<T[]>(fileName, []);
  return current.filter((item) => v2Ids.has(String(item[idKey] ?? "")));
}

function makePresentIllness(row: Row) {
  return {
    onset: get(row, "symptoms_detail"),
    hematuriaType: get(row, "hematuria_type"),
    hematuriaPhase: get(row, "hematuria_phase"),
    color: get(row, "hematuria_color"),
    clots: get(row, "clots"),
    duration: get(row, "chief_complaint"),
    trigger: "",
    pain: get(row, "pain_relation"),
    urinaryFrequency: get(row, "luts"),
    urgency: get(row, "luts"),
    dysuria: get(row, "luts"),
    flankPain: get(row, "flank_pain") || get(row, "pain_relation"),
    fever: get(row, "fever"),
    voidingDifficulty: get(row, "luts")
  };
}

function sentenceWith(text: string, words: string[]) {
  return splitList(text).find((part) => words.some((word) => part.includes(word))) || "";
}

function makeRiskFactors(row: Row) {
  const history = get(row, "medical_history");
  const risk = get(row, "risk");
  const source = `${history}；${risk}`;
  return {
    smoking: sentenceWith(source, ["吸烟"]) || "否认/未诉吸烟史",
    alcohol: sentenceWith(source, ["饮酒", "喝酒", "酒"]) || "否认/未诉饮酒史",
    occupation: sentenceWith(source, ["职业", "染料", "芳香胺", "橡胶", "皮革", "化工", "重金属"]) || "否认/未诉职业暴露",
    stoneHistory: sentenceWith(source, ["结石"]) || "否认/未诉结石史",
    infectionHistory: sentenceWith(source, ["感染"]) || "否认/未诉感染史",
    trauma: sentenceWith(source, ["外伤", "操作"]) || "否认/未诉外伤或尿路操作",
    anticoagulants: get(row, "medication") || "未诉长期特殊用药",
    tumorHistory: sentenceWith(source, ["肿瘤", "放化疗"]) || "否认/未诉肿瘤史",
    familyHistory: sentenceWith(source, ["家族"]) || "无明确家族史"
  };
}

function makeClinical(row: Row) {
  return {
    source: get(row, "case_source"),
    diseaseCategory: get(row, "disease_category"),
    difficulty: get(row, "difficulty"),
    triage: get(row, "mdt"),
    primaryProblem: get(row, "primary_diagnosis"),
    redFlags: `${get(row, "risk")}；${get(row, "mdt")}`,
    diagnosticReasoning: get(row, "preoperative_diagnosis") || get(row, "primary_diagnosis"),
    mustDifferentials: get(row, "training_focus"),
    keyHistory: [
      get(row, "hematuria_type"),
      get(row, "hematuria_phase"),
      get(row, "hematuria_color"),
      get(row, "clots"),
      get(row, "pain_relation"),
      get(row, "fever"),
      get(row, "flank_pain"),
      get(row, "luts"),
      get(row, "glomerular")
    ].filter(Boolean).join("；"),
    physicalExam: get(row, "physical_exam"),
    requiredLabs: get(row, "admission_labs"),
    specialTests: get(row, "positive_findings"),
    imagingAndProcedures: get(row, "admission_imaging"),
    orderReason: get(row, "training_focus"),
    consultDepartments: get(row, "mdt"),
    consultQuestions: get(row, "mdt_question"),
    immediateTreatment: get(row, "initial_treatment"),
    definitiveTreatment: get(row, "definitive_treatment") || get(row, "next_management"),
    followUp: get(row, "next_management"),
    commonMisses: get(row, "evaluator"),
    teacherScoringPoints: get(row, "evaluator"),
    stagePath: "1病史采集>2查体与检查>3诊断与鉴别>4MDT会诊>5治疗决策>6围术期管理>7复盘反馈"
  };
}

function makePatientFacingProfile(row: Row) {
  return {
    caseId: rowId(row),
    age: get(row, "age"),
    sex: get(row, "gender"),
    chiefComplaint: get(row, "chief_complaint"),
    subjectiveHistory: get(row, "symptoms_detail"),
    hematuriaType: get(row, "hematuria_type"),
    hematuriaPhase: get(row, "hematuria_phase"),
    urineColor: get(row, "hematuria_color"),
    clots: get(row, "clots"),
    painRelation: get(row, "pain_relation"),
    fever: get(row, "fever"),
    flankPain: get(row, "flank_pain"),
    luts: get(row, "luts"),
    glomerularClues: get(row, "glomerular"),
    knownPastHistory: get(row, "medical_history"),
    knownMedication: get(row, "medication"),
    personalAndFamilyRisk: get(row, "risk"),
    persona: get(row, "persona"),
    reportBoundary: "患者可以说做过检查，但不能说出尿检、影像、膀胱镜、病理等报告细节。"
  };
}

function makeTeacherOnlyData(row: Row) {
  return {
    urineTestResult: get(row, "urine_test_result"),
    imagingFinding: get(row, "imaging_finding"),
    primaryDiagnosis: get(row, "primary_diagnosis"),
    admissionLabs: get(row, "admission_labs"),
    admissionImaging: get(row, "admission_imaging"),
    initialTreatment: get(row, "initial_treatment"),
    positiveFindings: get(row, "positive_findings"),
    nextManagement: get(row, "next_management"),
    preoperativeDiagnosis: get(row, "preoperative_diagnosis"),
    perioperativePoints: get(row, "perioperative_points"),
    definitiveTreatment: get(row, "definitive_treatment"),
    mdt: get(row, "mdt"),
    mdtQuestion: get(row, "mdt_question"),
    evaluator: get(row, "evaluator")
  };
}

function makeCase(row: Row, answersByCase: Record<string, JsonObject>, cardsByCase: Record<string, JsonObject[]>) {
  const id = rowId(row);
  const patientFacingProfile = makePatientFacingProfile(row);
  const teacherOnlyData = makeTeacherOnlyData(row);
  return {
    id,
    sourcePatientId: get(row, "source_sheet") || id,
    title: get(row, "primary_diagnosis") || id,
    difficulty: get(row, "difficulty"),
    diseaseCategory: get(row, "disease_category"),
    age: get(row, "age"),
    sex: get(row, "gender"),
    studentChiefComplaint: get(row, "chief_complaint"),
    chiefComplaint: get(row, "chief_complaint"),
    presentIllness: makePresentIllness(row),
    riskFactors: makeRiskFactors(row),
    pastHistory: get(row, "medical_history"),
    personalHistory: get(row, "risk") || get(row, "medical_history"),
    familyHistory: sentenceWith(get(row, "risk") || get(row, "medical_history"), ["家族"]) || "无明确家族史",
    medication: get(row, "medication"),
    urineTestResult: get(row, "urine_test_result"),
    investigations: [
      { type: "尿检", result: get(row, "urine_test_result") },
      { type: "影像/内镜", result: get(row, "imaging_finding") }
    ].filter((item) => item.result),
    patientAnswers: {
      color: get(row, "hematuria_color"),
      phase: get(row, "hematuria_phase"),
      clots: get(row, "clots"),
      pain: get(row, "pain_relation"),
      irritativeSymptoms: get(row, "luts"),
      fever: get(row, "fever"),
      stoneClues: get(row, "flank_pain"),
      tumorRisk: get(row, "risk"),
      glomerularClues: get(row, "glomerular"),
      opening: get(row, "chief_complaint")
    },
    patientPersona: {
      emotion: get(row, "persona"),
      expressionAbility: "能用普通人语言描述症状，不主动使用医学诊断术语。",
      healthLiteracy: "医学知识有限，不主动解释诊断、检查或治疗方案。",
      memoryReliability: "按学生追问提供具体信息。",
      cooperation: "问到具体问题时配合回答；未问到的关键事实不主动透露。",
      communicationNote: get(row, "persona")
    },
    patientFacingProfile,
    teacherOnlyData,
    diagnosis: get(row, "primary_diagnosis"),
    teachingPoints: splitList(get(row, "training_focus")),
    standardSummary: `${get(row, "chief_complaint")}。${get(row, "symptoms_detail")} ${get(row, "medical_history")}`,
    differentialDiagnosis: splitList(get(row, "training_focus")),
    teacherComment: get(row, "evaluator"),
    scoringKey: splitList(get(row, "evaluator")),
    clinical: makeClinical(row),
    stageTasks: [],
    interviewAnswers: answersByCase[id] || {},
    caseCard: cardsByCase[id] || [],
    agentProfile: {
      patientPersona: get(row, "persona"),
      patientVisibleInfo: JSON.stringify(patientFacingProfile),
      layeredReleaseRule: "Standardized Patient Agent only receives patientFacingProfile and the current matched slot answer. Investigation/MDT/Evaluator read teacherOnlyData only after the relevant stage action or submission.",
      labOrders: get(row, "admission_labs"),
      imagingOrders: get(row, "admission_imaging"),
      resultInterpretation: get(row, "positive_findings"),
      initialTreatmentPlan: get(row, "initial_treatment"),
      nextTreatmentAfterResults: get(row, "next_management"),
      perioperativePreparation: get(row, "perioperative_points"),
      mdtDepartments: get(row, "mdt"),
      mdtTrigger: get(row, "mdt_question"),
      mdtQuestions: get(row, "mdt_question"),
      evaluatorDeductions: get(row, "evaluator"),
      pathwayGuardrail: get(row, "training_focus"),
      ragPriority: get(row, "difficulty")
    },
    raw: {
      symptomsDetail: get(row, "symptoms_detail"),
      medicalHistory: get(row, "medical_history"),
      sheetName: "总表_42病例"
    }
  };
}

function makeQuestionAnswer(row: Row) {
  return {
    caseId: get(row, "case_id"),
    slotId: get(row, "slot_id"),
    label: get(row, "slot_name"),
    possibleQuestion: get(row, "trigger_words"),
    patientAnswer: get(row, "patient_answer_raw") || "我不太清楚。",
    clinicalMeaning: "",
    scoringKeywords: get(row, "score_weight"),
    finalDiagnosis: "",
    correctedDiseaseCategory: "",
    aiAllowedContext: get(row, "ai_allowed_context"),
    teacherHint: get(row, "teacher_hint"),
    scoreWeight: get(row, "score_weight")
  };
}

function makeCard(row: Row) {
  return {
    caseId: get(row, "case_id"),
    category: get(row, "字段分类"),
    fieldName: get(row, "字段名"),
    value: get(row, "字段值"),
    visibility: get(row, "学生端释放规则") || "teacher",
    releaseCondition: get(row, "学生端释放规则") || "teacher",
    agent: get(row, "字段分类")
  };
}

function makeOrderResult(row: Row) {
  return {
    caseId: get(row, "case_id"),
    orderId: get(row, "order_id"),
    diagnosis: "",
    diseaseType: "",
    orderCategory: get(row, "order_category") || get(row, "order_name"),
    synonyms: unique([get(row, "order_name"), ...splitList(get(row, "order_name")), ...splitList(get(row, "purpose"))]).filter(Boolean),
    result: get(row, "result_if_ordered") || "该病例暂无此项可返回结果。",
    abnormalLevel: "模拟返回",
    teachingExplanation: get(row, "purpose"),
    isKey: true,
    prerequisite: get(row, "release_rule")
  };
}

function makeMdt(row: Row) {
  return {
    caseId: get(row, "case_id"),
    diagnosis: get(row, "disease_category"),
    diseaseType: get(row, "disease_category"),
    required: Boolean(get(row, "recommended_departments")),
    idealTiming: get(row, "mdt_urgency"),
    departments: get(row, "recommended_departments"),
    purpose: get(row, "consult_questions"),
    missedPenalty: get(row, "trigger_rule"),
    expertChallenge: get(row, "trigger_rule")
  };
}

function main() {
  const workbook = readWorkbookFile(input);
  const totalRows = rows(workbook, "总表_42病例").filter((row) => isV2(rowId(row)) || isAdd(rowId(row)));
  const addRows = totalRows.filter((row) => isAdd(rowId(row)));
  const qaRows = rows(workbook, "问诊槽位答案_补充30").filter((row) => isAdd(get(row, "case_id")));
  const cardRows = rows(workbook, "病例卡_补充30长表").filter((row) => isAdd(get(row, "case_id")));
  const orderRows = rows(workbook, "开单返回结果_补充30").filter((row) => isAdd(get(row, "case_id")));
  const mdtRows = rows(workbook, "MDT触发_补充30").filter((row) => isAdd(get(row, "case_id")));

  const v2Cases = loadV2Data<JsonObject>("cases.json", "id");
  const v2Cards = loadV2Data<JsonObject>("case_cards.json", "caseId");
  const v2Qa = loadV2Data<JsonObject>("question_answers.json", "caseId");
  const v2InterviewAnswers = loadV2Data<JsonObject>("interview_answers.json", "caseId");
  const v2Orders = loadV2Data<JsonObject>("order_results.json", "caseId");
  const v2Mdt = loadV2Data<JsonObject>("mdt_triggers.json", "caseId");

  if (!fs.existsSync(path.join(outputDir, "cases_v2.json"))) writeJson("cases_v2.json", v2Cases);
  if (!fs.existsSync(path.join(outputDir, "case_cards_v2.json"))) writeJson("case_cards_v2.json", v2Cards);
  if (!fs.existsSync(path.join(outputDir, "question_answers_v2.json"))) writeJson("question_answers_v2.json", v2Qa);
  if (!fs.existsSync(path.join(outputDir, "interview_answers_v2.json"))) writeJson("interview_answers_v2.json", v2InterviewAnswers);
  if (!fs.existsSync(path.join(outputDir, "order_results_v2.json"))) writeJson("order_results_v2.json", v2Orders);
  if (!fs.existsSync(path.join(outputDir, "mdt_triggers_v2.json"))) writeJson("mdt_triggers_v2.json", v2Mdt);

  const addQa = qaRows.map(makeQuestionAnswer).filter((item) => item.caseId && item.slotId);
  const answersByCase = addQa.reduce<Record<string, Record<string, JsonObject>>>((acc, item) => {
    acc[item.caseId] ??= {};
    acc[item.caseId][item.slotId] = item;
    return acc;
  }, {});
  const addCards = cardRows.map(makeCard).filter((item) => item.caseId && item.fieldName);
  const cardsByCase = addCards.reduce<Record<string, JsonObject[]>>((acc, item) => {
    acc[item.caseId] ??= [];
    acc[item.caseId].push(item);
    return acc;
  }, {});
  const addCases = addRows.map((row) => makeCase(row, answersByCase, cardsByCase));
  const addOrders = orderRows.map(makeOrderResult).filter((item) => item.caseId && item.orderId);
  const addMdt = mdtRows.map(makeMdt).filter((item) => item.caseId);

  const cases42 = [...v2Cases, ...addCases];
  const cards42 = [...v2Cards, ...addCards];
  const qa42 = [...v2Qa, ...addQa];
  const interview42 = [...v2InterviewAnswers, ...addQa];
  const orders42 = [...v2Orders, ...addOrders];
  const mdt42 = [...v2Mdt, ...addMdt];

  writeJson("cases_42.json", cases42);
  writeJson("case_cards_42.json", cards42);
  writeJson("question_answers_42.json", qa42);
  writeJson("interview_answers_42.json", interview42);
  writeJson("order_results_42.json", orders42);
  writeJson("mdt_triggers_42.json", mdt42);
  writeJson("case_set_config.json", {
    defaultCaseSet,
    supported: ["v2_only", "v2_plus_30"],
    generatedAt: process.env.CASE_LIBRARY_BUILD_ID || "deterministic",
    v2Count: v2Cases.length,
    addCount: addCases.length,
    totalCount: cases42.length
  });

  if (defaultCaseSet === "v2_only") {
    writeJson("cases.json", v2Cases);
    writeJson("case_cards.json", v2Cards);
    writeJson("question_answers.json", v2Qa);
    writeJson("interview_answers.json", v2InterviewAnswers);
    writeJson("order_results.json", v2Orders);
    writeJson("mdt_triggers.json", v2Mdt);
  } else {
    writeJson("cases.json", cases42);
    writeJson("case_cards.json", cards42);
    writeJson("question_answers.json", qa42);
    writeJson("interview_answers.json", interview42);
    writeJson("order_results.json", orders42);
    writeJson("mdt_triggers.json", mdt42);
  }

  writeJson("supplement-30-import-report.json", {
    input,
    generatedAt: process.env.CASE_LIBRARY_BUILD_ID || "deterministic",
    caseSet: defaultCaseSet,
    totalSheetRows: totalRows.length,
    supplementCases: addCases.length,
    casesJsonCount: defaultCaseSet === "v2_only" ? v2Cases.length : cases42.length,
    caseCardsAdded: addCards.length,
    questionAnswersAdded: addQa.length,
    orderResultsAdded: addOrders.length,
    mdtTriggersAdded: addMdt.length,
    addCaseIds: addCases.map((item) => item.id)
  });

  console.log(`Generated ${defaultCaseSet}: V2=${v2Cases.length}, supplement=${addCases.length}, active=${defaultCaseSet === "v2_only" ? v2Cases.length : cases42.length}`);
}

main();
