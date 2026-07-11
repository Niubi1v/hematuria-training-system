import assert from "node:assert/strict";
import casesJson from "../data/cases.json";
import type { CaseData } from "../src/lib/types";

const { validateDiagnosis, validateTreatment, validateStage } = require("../server/clinicalAssessment.js");

const cases = casesJson as CaseData[];
const p001 = cases.find((item) => item.id === "P001")!;
const p006 = cases.find((item) => item.id === "P006")!;

const nonEmpty = validateDiagnosis(p001, { diagnosis: "随便写点文字", diagnosticEvidence: "内容很多但完全无关", differentials: "甲；乙；丙", confirmatoryTests: "继续观察" }, new Date(0).toISOString(), "spam");
assert.equal(nonEmpty.events.length, 0, "arbitrary non-empty text must not earn diagnosis evidence");

const wrong = validateDiagnosis(p001, { diagnosis: "急性阑尾炎", diagnosticEvidence: "右下腹痛和反跳痛", differentials: "胃炎；胆囊炎；胰腺炎", confirmatoryTests: "腹部平片" }, new Date(0).toISOString(), "wrong");
assert.equal(wrong.events.some((event: { actionId?: string }) => event.actionId === "primary"), false, "wrong diagnosis must not earn primary diagnosis credit");
assert.ok(wrong.warnings.some((item: string) => item.includes("不符")), "wrong diagnosis must produce an explicit warning");

const template = validateDiagnosis(p001, { diagnosis: "肿瘤、结石、感染、肾小球", diagnosticEvidence: "肿瘤、结石、感染、肾小球", differentials: "肿瘤；结石；感染", confirmatoryTests: "肿瘤、结石、感染、肾小球" }, new Date(0).toISOString(), "template");
assert.equal(template.events.length, 0, "keyword template spam must not earn diagnosis credit");

const correct = validateDiagnosis(p001, {
  diagnosis: "膀胱恶性肿瘤",
  diagnosticEvidence: "老年患者反复无痛性全程肉眼血尿并有小血块，需警惕膀胱肿瘤",
  differentials: "尿路感染；膀胱结石；上尿路尿路上皮癌",
  confirmatoryTests: "尿常规和尿细胞学，CTU评估上尿路，膀胱镜并TURBT取得病理"
}, new Date(0).toISOString(), "correct");
assert.ok(correct.events.some((event: { actionId?: string }) => event.actionId === "primary"), "correct diagnosis with case evidence should earn explainable evidence");
assert.ok(correct.events.filter((event: { actionId?: string }) => event.actionId?.startsWith("differential_")).length >= 3, "three appropriate differentials should be validated");

const dangerous = validateTreatment(p006, { immediateTreatment: "感染未控制前立即碎石，不需要抗感染和引流", admissionTreatment: "", definitiveTreatment: "", perioperativePreparation: "", followUp: "", patientEducation: "" }, new Date(0).toISOString(), "danger");
assert.ok(dangerous.events.some((event: { type: string }) => event.type === "critical_error"), "dangerous treatment must create a critical error");
assert.equal(dangerous.events.some((event: { type: string }) => event.type === "treatment_action"), false, "dangerous treatment must not earn treatment credit");

const repeated = validateStage(p001, "treatment", { immediateTreatment: "治疗治疗治疗", admissionTreatment: "治疗治疗治疗", definitiveTreatment: "治疗治疗治疗" });
assert.equal(repeated.events.length, 0, "repeated template text must not earn treatment credit");

console.log("Adversarial scoring passed: non-empty, wrong, dangerous, forged-template, and correct-answer behavior validated.");
