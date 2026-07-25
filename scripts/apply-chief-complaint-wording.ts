import fs from "node:fs";
import path from "node:path";
import policyJson from "../data/chief_complaint_wording.json";

type JsonObject = Record<string, any>;
type Update = {
  displayCaseId: string;
  classification: string;
  zh: string;
  en: string;
  openingZh: string;
  openingEn: string;
};

const root = path.resolve(process.cwd(), "data");
const updates = policyJson.updates as Record<string, Update>;
const blocked = new Set(Object.keys(policyJson.blockedMedical));

function read<T>(fileName: string): T {
  return JSON.parse(fs.readFileSync(path.join(root, fileName), "utf8"));
}

function write(fileName: string, value: unknown) {
  fs.writeFileSync(path.join(root, fileName), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function changedPaths(before: unknown, after: unknown, prefix = ""): string[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (!before || !after || typeof before !== "object" || typeof after !== "object") return [prefix];
  const beforeRecord = before as Record<string, unknown>;
  const afterRecord = after as Record<string, unknown>;
  const keys = new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)]);
  return [...keys].flatMap((key) => changedPaths(beforeRecord[key], afterRecord[key], prefix ? `${prefix}.${key}` : key));
}

function allowedCasePath(caseData: JsonObject, pathName: string) {
  if (["chiefComplaint", "studentChiefComplaint", "standardChiefComplaint", "patientFacingProfile.chiefComplaint", "patientAnswers.opening", "agentProfile.patientVisibleInfo"].includes(pathName)) return true;
  const interview = /^interviewAnswers\.([^.]+)\.patientAnswer$/.exec(pathName);
  if (interview) return /主诉|来诊原因/.test(String(caseData.interviewAnswers?.[interview[1]]?.label || ""));
  const card = /^caseCard\.(\d+)\.value$/.exec(pathName);
  if (card) return caseData.caseCard?.[Number(card[1])]?.fieldName === "chief_complaint";
  return false;
}

function updateChineseCase(caseData: JsonObject, update: Update) {
  const before = clone(caseData);
  caseData.studentChiefComplaint = update.zh;
  caseData.chiefComplaint = update.zh;
  if ("standardChiefComplaint" in caseData) caseData.standardChiefComplaint = update.zh;
  if (caseData.patientFacingProfile) caseData.patientFacingProfile.chiefComplaint = update.zh;
  if (caseData.patientAnswers) caseData.patientAnswers.opening = update.openingZh;
  for (const answer of Object.values(caseData.interviewAnswers || {}) as JsonObject[]) {
    if (/主诉|来诊原因/.test(String(answer.label || ""))) answer.patientAnswer = update.openingZh;
  }
  for (const card of caseData.caseCard || []) {
    if (card.fieldName === "chief_complaint") card.value = update.zh;
  }
  if (typeof caseData.agentProfile?.patientVisibleInfo === "string") {
    const visible = JSON.parse(caseData.agentProfile.patientVisibleInfo);
    visible.chiefComplaint = update.zh;
    caseData.agentProfile.patientVisibleInfo = JSON.stringify(visible);
  }
  const unexpected = changedPaths(before, caseData).filter((pathName) => !allowedCasePath(caseData, pathName));
  if (unexpected.length) throw new Error(`${caseData.id} attempted non-expression changes: ${unexpected.join(", ")}`);
}

function updateCaseFile(fileName: string, language: "zh" | "en") {
  const cases = read<JsonObject[]>(fileName);
  for (const caseData of cases) {
    const update = updates[String(caseData.id)];
    if (!update) continue;
    if (blocked.has(String(caseData.id))) throw new Error(`${caseData.id} is both blocked and updateable`);
    if (language === "zh") updateChineseCase(caseData, update);
    else {
      caseData.chiefComplaint = update.en;
      caseData.studentChiefComplaint = update.en;
    }
  }
  write(fileName, cases);
}

for (const fileName of ["cases.json", "cases_42.json", "cases_v2.json"]) updateCaseFile(fileName, "zh");
for (const fileName of ["cases_en.json", "cases_zh.json"]) updateCaseFile(fileName, "en");

const studentCases = read<JsonObject[]>("cases_student.json");
for (const item of studentCases) if (updates[item.id]) item.studentChiefComplaint = updates[item.id].zh;
write("cases_student.json", studentCases);

const publicCases = read<JsonObject[]>("cases_public.json");
for (const item of publicCases) {
  const update = updates[item.id];
  if (!update) continue;
  item.studentChiefComplaint = update.zh;
  item.chiefComplaintEn = update.en;
}
write("cases_public.json", publicCases);

for (const [fileName, language] of [["case_cards.json", "zh"], ["case_cards_42.json", "zh"], ["case_cards_v2.json", "zh"], ["case_cards_en.json", "en"]] as const) {
  const cards = read<JsonObject[]>(fileName);
  for (const card of cards) {
    const update = updates[card.caseId];
    if (update && card.fieldName === "chief_complaint") card.value = language === "zh" ? update.zh : update.en;
  }
  write(fileName, cards);
}

for (const fileName of ["interview_answers.json", "interview_answers_42.json", "question_answers.json", "question_answers_42.json"]) {
  const answers = read<JsonObject[]>(fileName);
  for (const answer of answers) {
    const update = updates[answer.caseId];
    if (update && /主诉|来诊原因/.test(String(answer.label || ""))) answer.patientAnswer = update.openingZh;
  }
  write(fileName, answers);
}

const slots = read<Record<string, JsonObject>>("patient_slots_bilingual.json");
for (const [caseId, update] of Object.entries(updates)) {
  const complaint = slots[caseId]?.chief_complaint;
  if (!complaint) throw new Error(`${caseId} has no bilingual chief complaint slot`);
  complaint.patientAnswerZh = update.zh;
  complaint.patientAnswerEn = update.en;
}
write("patient_slots_bilingual.json", slots);

write("chief_complaint_wording_runtime.json", {
  version: policyJson.version,
  updates: Object.fromEntries(Object.entries(updates).map(([caseId, update]) => [caseId, {
    zh: update.zh,
    en: update.en,
    openingZh: update.openingZh,
    openingEn: update.openingEn
  }]))
});

console.log(`Applied patient-facing chief complaint wording to ${Object.keys(updates).length} cases; ${blocked.size} cases remained BLOCKED_MEDICAL.`);
