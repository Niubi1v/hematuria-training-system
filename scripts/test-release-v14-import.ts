import assert from "node:assert/strict";
import fs from "node:fs";

type NormalizedCase = {
  displayCaseId: string;
  runtimeCaseId: string;
  presentIllness: string;
  pastHistory: string;
  personalHistory: string;
  familyHistory: string;
  medicationHistory: string;
  reviewStatus: string;
  factCount: number;
  orders: Array<{ displayName: string; classification: string }>;
  treatments: Array<{ recommendation: string; contraindication: string; dangerousSequenceError: string }>;
  rubricItems: Array<{ dimensionId: string; dimensionMax: number; requirement: string; itemType: string; patientSafetyCritical: boolean; criticalError: string }>;
};

const data = JSON.parse(fs.readFileSync("data/hematuria_release_v14_normalized.json", "utf8")) as {
  caseCount: number; factCount: number; formalUseAllowed: boolean; cases: NormalizedCase[]; facts: Array<Record<string, unknown>>;
};
const byId = new Map(data.cases.map((item) => [item.displayCaseId, item]));
const caseText = (id: string) => {
  const item = byId.get(id);
  assert.ok(item, `${id} missing`);
  return item;
};
const orderText = (id: string) => caseText(id).orders.map((item) => `${item.displayName}:${item.classification}`).join("；");
const treatmentText = (id: string) => caseText(id).treatments.map((item) => `${item.recommendation} ${item.contraindication} ${item.dangerousSequenceError}`).join("；");

assert.equal(data.caseCount, 42);
assert.equal(data.factCount, 572);
assert.equal(data.formalUseAllowed, false);
assert.equal(new Set(data.cases.map((item) => item.displayCaseId)).size, 42);
assert.equal(new Set(data.cases.map((item) => item.runtimeCaseId)).size, 42);
assert.equal(data.facts.length, 572);
assert.ok(data.facts.every((item) => String(item["来源"] || "").trim()), "Every fact must retain provenance");
assert.ok(data.cases.every((item) => item.reviewStatus === "needs_revision"), "Import must not approve cases");

const p016 = caseText("P016");
assert.match(p016.presentIllness, /右侧腰|右腰/);
assert.doesNotMatch(p016.presentIllness, /左侧腰|左腰/);
assert.match(p016.presentIllness, /乏力/);
assert.match(p016.presentIllness, /食欲下降/);
assert.match(caseText("P003").pastHistory, /胆囊切除/);
assert.match(caseText("P003").pastHistory, /输血/);
assert.doesNotMatch(caseText("P003").pastHistory, /没有输过血|否认输血/);
assert.match(caseText("P005").pastHistory + caseText("P005").personalHistory, /冠脉.*支架|冠脉支架/);
assert.match(caseText("P030").familyHistory, /兄弟.*前列腺癌/);

for (const id of ["P004", "P016"]) {
  const required = caseText(id).orders.filter((item) => item.classification === "必须").map((item) => item.displayName).join("；");
  assert.match(required, /肾脏多期增强CT/);
  assert.doesNotMatch(required, /尿脱落细胞学|CTU|膀胱镜/);
}
assert.match(orderText("P008"), /膀胱超声.*必须/);
assert.match(treatmentText("P008"), /结石.*BPH|BPH.*结石/);
assert.match(orderText("P025"), /PCNL:禁忌或不适用/);
assert.match(treatmentText("P027"), /尿液碱化/);
assert.match(orderText("P027"), /尿pH动态监测:必须/);
assert.match(orderText("P018"), /PCT:不常规推荐/);
assert.match(orderText("P020") + treatmentText("P020"), /禁止用力前列腺按摩|用力前列腺按摩:禁忌或不适用/);
assert.match(treatmentText("P022"), /持续血尿.*风险分层/);
assert.match(orderText("P034"), /遗传检测/);
assert.match(orderText("P034"), /听力学与眼科评估/);
assert.match(orderText("P037"), /侵入性泌尿检查:禁忌或不适用/);
assert.match(orderText("P041"), /左肾静脉多普勒超声/);
assert.match(treatmentText("P042"), /未发现肿瘤前不得释放根治手术或系统治疗/);

const safetyPattern = /脓毒|休克|感染性梗阻|直接碎石|ABC|抗凝|抗血小板|病理|分期|未发现肿瘤|月经污染|侵入性|严重AKI|肺水肿|少尿|高血压急症/;
for (const item of data.cases) {
  const dimensions = new Map<string, number>();
  for (const rubric of item.rubricItems) dimensions.set(rubric.dimensionId, rubric.dimensionMax);
  assert.equal([...dimensions.values()].reduce((sum, value) => sum + value, 0), 360, `${item.displayCaseId} must total 360`);
  for (const rubric of item.rubricItems.filter((entry) => entry.patientSafetyCritical)) {
    assert.match(`${rubric.requirement} ${rubric.criticalError}`, safetyPattern, `${item.displayCaseId}/${rubric.requirement} is not a safety event`);
    assert.doesNotMatch(rubric.requirement, /吸烟史|普通家族史|职业暴露/, "Ordinary history must not be a safety gate");
  }
}

const runtimeCases = JSON.parse(fs.readFileSync("data/cases.json", "utf8")) as Array<{ id: string; displayCaseId?: string; medicalReview?: { status: string }; releaseV14?: { factCount: number; formalUseAllowed: boolean } }>;
assert.equal(runtimeCases.length, 42);
assert.ok(runtimeCases.every((item) => item.displayCaseId && item.medicalReview?.status === "needs_revision" && item.releaseV14?.formalUseAllowed === false));
assert.equal(runtimeCases.reduce((sum, item) => sum + (item.releaseV14?.factCount || 0), 0), 572);
assert.equal(runtimeCases.find((item) => item.id === "HX-ADD-001")?.displayCaseId, "P013");
const runtimeDetails = JSON.parse(fs.readFileSync("data/cases.json", "utf8")) as Array<{ id: string; structuredHistory?: { surgeryHistory: { patientAnswerZh: string; patientAnswerEn: string }; transfusionHistory: { status: string; patientAnswerZh: string }; coronaryDisease: { status: string }; familyHistory: { patientAnswerZh: string; patientAnswerEn: string } } }>;
const runtime = (id: string) => runtimeDetails.find((item) => item.id === id)?.structuredHistory;
assert.equal(runtime("P003")?.transfusionHistory.status, "present");
assert.match(runtime("P003")?.surgeryHistory.patientAnswerZh || "", /胆囊切除/);
assert.match(runtime("P005")?.surgeryHistory.patientAnswerEn || "", /coronary stent/i);
assert.equal(runtime("P005")?.coronaryDisease.status, "present");
assert.match(runtime("HX-ADD-018")?.familyHistory.patientAnswerEn || "", /brother.*prostate cancer/i);

console.log("Reviewed v1.4 import checks passed: 42 cases, 572 facts, case-specific templates, 360-point rubrics.");
