import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import type { CaseData, StructuredPatientFact } from "../src/lib/types";

type Row = Record<string, unknown>;
type MutableCase = CaseData & Record<string, unknown>;
type ReviewQueueItem = Record<string, unknown> & {
  reviewItemId: string;
  caseId: string;
  field: string;
};

const root = process.cwd();
const dataDir = path.join(root, "data");
const defaultWorkbook = path.join(root, "docs", "medical-review", "血尿病例_42例医学内容审校修订候选版_待人工终签.xlsx");
const workbookPath = path.resolve(process.argv.find((item) => item.endsWith(".xlsx")) || defaultWorkbook);
const importVersion = "medical-review-candidate-2026-07-12";
const importDate = "2026-07-12";
const forbiddenZh = /根据原始病史|根据病例资料|原始(?:病历|资料)|未主动诉|需追问|需主动询问|教师提示|评分点|需要重新询问|未记录|不能设定|不得改写|需核实/;
const forbiddenEn = /according to (?:the )?(?:original history|case data)|source record|not documented|must be re-elicited|ask specifically|teacher hint|scoring point|must not be defaulted|needs verification/i;
const answerOverrides: Record<string, { zh: string; en: string }> = {
  "MR-0388": {
    zh: "我没有服用阿司匹林或氯吡格雷，但长期自行服用布洛芬和复方止痛药。",
    en: "I do not take aspirin or clopidogrel, but I have used ibuprofen and compound painkillers for a long time."
  }
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function text(value: unknown) {
  return String(value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function readJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf8")) as T;
}

function writeJson(name: string, value: unknown) {
  fs.writeFileSync(path.join(dataDir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function rows(workbook: XLSX.WorkBook, sheetName: string): Row[] {
  const sheet = workbook.Sheets[sheetName];
  assert(sheet, `Missing medical-review sheet: ${sheetName}`);
  return XLSX.utils.sheet_to_json<Row>(sheet, { defval: "", raw: false });
}

function caseByDisplay(cases: MutableCase[], displayCaseId: string) {
  const found = cases.find((item) => (item.displayCaseId || item.id) === displayCaseId);
  assert(found, `Missing runtime case for ${displayCaseId}`);
  assert(found.structuredHistory, `${displayCaseId} is missing structuredHistory`);
  return found;
}

function structuredFact(caseData: MutableCase, field: string) {
  const history = caseData.structuredHistory as unknown as Record<string, unknown>;
  const fact = history[field] as StructuredPatientFact | undefined;
  assert(fact && typeof fact === "object" && "patientAnswerZh" in fact, `${caseData.displayCaseId || caseData.id}.${field} is not a patient fact`);
  return fact;
}

function setPatientAnswer(caseData: MutableCase, field: string, zh: string, en: string) {
  assert(zh && en, `${caseData.displayCaseId || caseData.id}.${field} has an empty revised answer`);
  assert(zh.length <= 80, `${caseData.displayCaseId || caseData.id}.${field} Chinese answer exceeds 80 characters`);
  assert(en.length <= 180, `${caseData.displayCaseId || caseData.id}.${field} English answer exceeds 180 characters`);
  assert(!forbiddenZh.test(zh), `${caseData.displayCaseId || caseData.id}.${field} contains teacher-facing Chinese`);
  assert(!forbiddenEn.test(en), `${caseData.displayCaseId || caseData.id}.${field} contains teacher-facing English`);
  assert(!/[\u3400-\u9fff]/.test(en), `${caseData.displayCaseId || caseData.id}.${field} English answer contains Chinese`);
  const fact = structuredFact(caseData, field);
  fact.patientAnswerZh = zh;
  fact.patientAnswerEn = en;
  fact.teacherReviewRequired = true;
}

function effectiveAnswers(row: Row) {
  const override = answerOverrides[text(row["审核项ID"])];
  if (override) return override;
  const decision = text(row["AI预审建议"]);
  return {
    zh: decision === "修改" ? text(row["修订中文回答"]) : text(row["当前中文患者回答"]),
    en: decision === "修改" ? text(row["修订英文回答"]) : text(row["当前英文患者回答"])
  };
}

function syncHistorySummaries(caseData: MutableCase) {
  const history = caseData.structuredHistory!;
  caseData.personalHistory = [
    history.smokingHistory.patientAnswerZh,
    history.alcoholHistory.patientAnswerZh,
    history.occupation.patientAnswerZh,
    history.occupationalExposure.patientAnswerZh
  ].filter(Boolean).join("；");
  caseData.familyHistory = history.familyHistory.patientAnswerZh;
  caseData.medication = history.medicationList.length ? history.medicationList.map((item) => item.name).join("、") : "无长期用药";
  caseData.patientAnswers = {
    ...(caseData.patientAnswers || {}),
    smoking: history.smokingHistory.patientAnswerZh,
    alcohol: history.alcoholHistory.patientAnswerZh
  };
  caseData.riskFactors = {
    ...caseData.riskFactors,
    smoking: history.smokingHistory.patientAnswerZh,
    alcohol: history.alcoholHistory.patientAnswerZh,
    occupation: history.occupationalExposure.patientAnswerZh,
    stoneHistory: history.stoneHistory.patientAnswerZh,
    infectionHistory: history.urinaryInfectionHistory.patientAnswerZh,
    trauma: history.traumaHistory.patientAnswerZh,
    anticoagulants: `${history.anticoagulantUse.patientAnswerZh} ${history.antiplateletUse.patientAnswerZh}`.trim(),
    tumorHistory: history.malignancyHistory.patientAnswerZh,
    familyHistory: history.familyHistory.patientAnswerZh
  };
}

function setDiagnosis(caseData: MutableCase, title: string, diagnosis: string, subcategory = diagnosis) {
  caseData.title = title;
  caseData.diagnosis = diagnosis;
  caseData.diseaseSubcategory = subcategory;
  caseData.teacherComment = `重点评价学生能否识别${subcategory}的定位线索、危险信号和正确操作顺序。`;
  if (caseData.clinical) {
    caseData.clinical.primaryProblem = diagnosis;
    caseData.clinical.diseaseCategory = `${caseData.diseaseCategory || "血尿待查"}/${subcategory}`;
  }
}

function applyFixedPatches(cases: MutableCase[]) {
  const p003 = caseByDisplay(cases, "P003");
  p003.structuredHistory!.transfusionHistory = {
    status: "present",
    patientAnswerZh: "5年前做胆囊切除时输过血。",
    patientAnswerEn: "I received a blood transfusion during gallbladder surgery five years ago.",
    provenance: "source",
    teacherReviewRequired: false
  };

  const p005 = caseByDisplay(cases, "P005");
  setDiagnosis(p005, "前列腺增生，前列腺癌待排/鉴别", "前列腺增生", "前列腺增生/前列腺癌鉴别");
  p005.structuredHistory!.coronaryDisease = {
    status: "present",
    patientAnswerZh: "6年前因冠脉狭窄做过冠脉支架植入。",
    patientAnswerEn: "I had a coronary stent placed for coronary artery stenosis six years ago.",
    provenance: "source",
    teacherReviewRequired: false
  };

  const p013 = caseByDisplay(cases, "P013");
  p013.structuredHistory!.smokingHistory = {
    status: "former",
    cigarettesPerDay: 20,
    years: 40,
    quitYears: 5,
    packYears: 40,
    patientAnswerZh: "以前每天吸烟约20支，吸了40年，5年前戒烟，累计约40包年。",
    patientAnswerEn: "I used to smoke 20 cigarettes a day for 40 years and quit five years ago, totaling about 40 pack-years.",
    provenance: "source",
    teacherReviewRequired: false
  };
  p013.structuredHistory!.medicationList = [{
    name: "氨氯地平",
    dose: "",
    frequency: "每日",
    indication: "高血压",
    provenance: "source",
    teacherReviewRequired: false
  }];
  p013.structuredHistory!.medicationAnswerZh = "我长期服用氨氯地平。";
  p013.structuredHistory!.medicationAnswerEn = "I regularly take amlodipine.";
  p013.structuredHistory!.anticoagulantUse = {
    status: "absent",
    patientAnswerZh: "我没有服用华法林、利伐沙班等抗凝药。",
    patientAnswerEn: "I do not take warfarin, rivaroxaban, or another anticoagulant.",
    provenance: "source",
    teacherReviewRequired: false
  };
  p013.structuredHistory!.antiplateletUse = {
    status: "absent",
    patientAnswerZh: "我没有服用阿司匹林或氯吡格雷。",
    patientAnswerEn: "I do not take aspirin or clopidogrel.",
    provenance: "source",
    teacherReviewRequired: false
  };

  setDiagnosis(caseByDisplay(cases, "P030"), "前列腺癌待排/鉴别", "前列腺癌待排/鉴别");
  setDiagnosis(caseByDisplay(cases, "P033"), "COL4相关薄基底膜病待确认", "COL4相关薄基底膜病待确认");
  setDiagnosis(caseByDisplay(cases, "P034"), "疑似Alport综合征（待遗传学/病理证实）", "疑似Alport综合征（待遗传学/病理证实）");
  setDiagnosis(caseByDisplay(cases, "P042"), "高危无症状镜下血尿待查（肿瘤筛查路径）", "高危无症状镜下血尿待查（肿瘤筛查路径）");
}

function applyToCases(cases: MutableCase[], queueRows: Row[], workbookHash: string) {
  assert(cases.length === 42, `Expected 42 runtime cases, received ${cases.length}`);
  for (const row of queueRows) {
    const caseData = caseByDisplay(cases, text(row["病例ID"]));
    const decision = text(row["AI预审建议"]);
    assert(decision === "保留" || decision === "修改", `${text(row["审核项ID"])} has unsupported decision ${decision}`);
    const answer = effectiveAnswers(row);
    setPatientAnswer(caseData, text(row["字段"]), answer.zh, answer.en);
  }
  applyFixedPatches(cases);
  for (const caseData of cases) {
    syncHistorySummaries(caseData);
    caseData.medicalReview = {
      ...(caseData.medicalReview || { references: [], lastReviewedDate: "" }),
      status: "needs_revision"
    };
    caseData.medicalReviewImport = {
      version: importVersion,
      sourceWorkbook: path.basename(workbookPath),
      sourceSha256: workbookHash,
      importedOn: importDate,
      userAcceptedForPractice: true,
      licensedExpertSignoffPending: true,
      formalUseAllowed: false
    };
  }
  return cases;
}

function updateEnglishCases() {
  const cases = readJson<Array<Record<string, unknown>>>("cases_en.json");
  const updates: Record<string, { title: string; initialDiagnosis: string; diseaseCategory?: string }> = {
    P005: { title: "Benign prostatic hyperplasia; prostate cancer to be excluded", initialDiagnosis: "Benign prostatic hyperplasia" },
    "HX-ADD-018": { title: "Prostate cancer to be excluded or differentiated", initialDiagnosis: "Prostate cancer to be excluded or differentiated" },
    "HX-ADD-021": { title: "Possible COL4-related thin basement membrane disease", initialDiagnosis: "Possible COL4-related thin basement membrane disease" },
    "HX-ADD-022": { title: "Suspected Alport syndrome pending genetic or pathologic confirmation", initialDiagnosis: "Suspected Alport syndrome pending genetic or pathologic confirmation" },
    "HX-ADD-030": { title: "High-risk asymptomatic microhematuria under evaluation", initialDiagnosis: "High-risk asymptomatic microhematuria under evaluation" }
  };
  for (const item of cases) {
    const update = updates[text(item.id)];
    if (update) Object.assign(item, update);
  }
  writeJson("cases_en.json", cases);
}

function updateNormalizedRelease(sourceRows: Row[], finalRows: Row[]) {
  const normalized = readJson<Record<string, unknown> & { cases: Array<Record<string, unknown>>; facts: Array<Record<string, unknown>> }>("hematuria_release_v14_normalized.json");
  const diagnosisByDisplay = new Map(finalRows.map((row) => [text(row["病例ID"]), text(row["诊断/主题"])]));
  for (const item of normalized.cases) {
    const diagnosis = diagnosisByDisplay.get(text(item.displayCaseId));
    if (diagnosis) item.diagnosis = diagnosis;
  }
  const correctedSource = new Map(sourceRows.map((row) => [`${text(row["病例ID"])}|${text(row["字段"])}`, text(row["当前结构化内容"])]));
  for (const fact of normalized.facts) {
    const key = `${text(fact.caseId)}|${text(fact["原字段"])}`;
    const corrected = correctedSource.get(key);
    if (!corrected) continue;
    if (key === "P003|transfusionHistory" || key === "P005|coronaryDisease") {
      fact["当前内容"] = corrected;
      fact["来源"] = "source";
      fact["是否程序或AI补充"] = "否";
      fact["保留/修改/删除/待确认"] = "来源纠正，待持证专家核对";
    }
  }
  normalized.medicalReviewImport = {
    version: importVersion,
    sourceWorkbook: path.basename(workbookPath),
    importedOn: importDate,
    userAcceptedForPractice: true,
    licensedExpertSignoffPending: true,
    formalUseAllowed: false
  };
  writeJson("hematuria_release_v14_normalized.json", normalized);
}

function updateReviewQueue(queueRows: Row[], sourceRows: Row[], patchRows: Row[], workbookHash: string) {
  const review = readJson<Record<string, unknown> & { sourceTrace: Array<Record<string, unknown>>; queue: ReviewQueueItem[] }>("medical_review_queue.json");
  const workbookQueue = new Map(queueRows.map((row) => [text(row["审核项ID"]), row]));
  assert(review.queue.length === 419 && workbookQueue.size === 419, "Medical-review queue must contain 419 unique rows");
  let modified = 0;
  let retained = 0;
  review.queue = review.queue.map((item) => {
    const row = workbookQueue.get(item.reviewItemId);
    assert(row, `Workbook is missing ${item.reviewItemId}`);
    assert(item.caseId === text(row["病例ID"]) && item.field === text(row["字段"]), `${item.reviewItemId} identity mismatch`);
    const aiDecision = text(row["AI预审建议"]);
    if (aiDecision === "修改") modified += 1;
    else if (aiDecision === "保留") retained += 1;
    else throw new Error(`${item.reviewItemId} has invalid AI pre-review decision`);
    const answer = effectiveAnswers(row);
    return {
      ...item,
      aiPreReviewDecision: aiDecision,
      effectivePatientAnswerZh: answer.zh,
      effectivePatientAnswerEn: answer.en,
      aiEvidenceOrGuideline: text(row["病例/指南依据"]),
      aiReviewer: text(row["AI预审者"]),
      suggestedHumanReviewer: text(row["建议人工终审专科"]),
      aiReviewDate: importDate,
      humanReviewStatus: "pending_licensed_expert",
      userAcceptedForPractice: true,
      decision: "待确认",
      correctedAnswerZh: "",
      correctedAnswerEn: "",
      evidenceOrGuideline: "",
      reviewerName: "",
      reviewerSpecialty: "",
      reviewDate: "",
      reviewNotes: text(row["人工审核状态/备注"])
    };
  });
  assert(modified === 179 && retained === 240, `Unexpected review decisions: modified=${modified}, retained=${retained}`);

  const sourceByKey = new Map(sourceRows.map((row) => [`${text(row["病例ID"])}|${text(row["字段"])}`, row]));
  review.sourceTrace = review.sourceTrace.map((item) => {
    const row = sourceByKey.get(`${text(item.caseId)}|${text(item.field)}`);
    if (!row) return item;
    return {
      ...item,
      currentContent: text(row["当前结构化内容"]),
      humanReviewStatus: "pending_licensed_source_verification",
      verificationNote: text(row["备注"])
    };
  });
  Object.assign(review, {
    schemaVersion: "medical-review-queue-v2",
    importedReviewCandidate: {
      version: importVersion,
      sourceWorkbook: path.basename(workbookPath),
      sourceSha256: workbookHash,
      importedOn: importDate,
      userAcceptedForPractice: true,
      licensedExpertSignoffCount: 0,
      licensedExpertSignoffPending: 419,
      sourceVerificationPending: 153,
      caseOwnerSignoffPending: 42,
      aiModifiedCount: modified,
      aiRetainedCount: retained,
      formalUseAllowed: false
    },
    systemApplicationPatches: patchRows.map((row) => ({
      caseId: text(row["病例ID"]),
      runtimeCaseId: text(row["运行时ID"]),
      targetField: text(row["目标字段"]),
      valueZh: text(row["建议值（中文/结构化）"]),
      valueEn: text(row["建议值（英文）"]),
      reason: text(row["修改理由"]),
      humanReviewStatus: text(row["人工审核状态"]),
      appliedToPractice: true
    })),
    approvalPolicy: "AI预审和用户确认仅允许进入公开练习版；正式OSCE/RCT仍需153条来源核对、419条持证专家终签及42例病例负责人签署。",
    formalUseAllowed: false
  });
  writeJson("medical_review_queue.json", review);
}

assert(fs.existsSync(workbookPath), `Missing medical-review workbook: ${workbookPath}`);
const workbookBytes = fs.readFileSync(workbookPath);
const workbookHash = createHash("sha256").update(workbookBytes).digest("hex");
const workbook = XLSX.read(workbookBytes, { type: "buffer", cellFormula: true });
const requiredSheets = ["审核概览", "专家审核队列", "来源事实核对", "审核说明", "病例级终审", "参考文献", "系统应用补丁"];
for (const sheetName of requiredSheets) assert(workbook.SheetNames.includes(sheetName), `Workbook is missing ${sheetName}`);
const queueRows = rows(workbook, "专家审核队列");
const sourceRows = rows(workbook, "来源事实核对");
const finalRows = rows(workbook, "病例级终审");
const patchRows = rows(workbook, "系统应用补丁");
assert(queueRows.length === 419, `Expected 419 review rows, received ${queueRows.length}`);
assert(sourceRows.length === 153, `Expected 153 source rows, received ${sourceRows.length}`);
assert(finalRows.length === 42, `Expected 42 case signoff rows, received ${finalRows.length}`);
assert(patchRows.length === 9, `Expected 9 system patches, received ${patchRows.length}`);
assert(finalRows.every((row) => text(row["人工终签"]) === "待持证病例负责人签署"), "Workbook contains an unexpected case-level approval");

for (const fileName of ["cases.json", "cases_42.json"]) {
  const cases = readJson<MutableCase[]>(fileName);
  writeJson(fileName, applyToCases(cases, queueRows, workbookHash));
}
updateEnglishCases();
updateNormalizedRelease(sourceRows, finalRows);
updateReviewQueue(queueRows, sourceRows, patchRows, workbookHash);

console.log(`Applied ${importVersion}: 179 revised answers, 240 retained answers, 9 case patches; formal use remains disabled.`);
