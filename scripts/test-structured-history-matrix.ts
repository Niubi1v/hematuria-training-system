import assert from "node:assert/strict";
import casesJson from "../data/cases.json";
import { generatePatientReply } from "../src/lib/patientEngine";
import type { CaseData } from "../src/lib/types";

const cases = casesJson as CaseData[];
const questions = [
  "你吸烟吗？", "吸烟多少年？", "每天吸多少支？", "喝酒吗？", "抽烟吗，喝酒吗？", "做什么工作？", "接触染料或化工品吗？",
  "有高血压吗？", "有糖尿病吗？", "以前得过结石吗？", "以前有尿路感染吗？", "做过手术吗？", "输过血吗？", "有什么过敏吗？",
  "平时都吃什么药？", "吃抗凝药或抗血小板药吗？", "家里有人有类似病吗？"
];
const forbidden = ["未诉", "需追问", "需主动询问", "根据原始病史", "根据病例资料", "训练中若被问及", "原表未记录", "评分点", "CT提示", "最终诊断"];

assert.equal(cases.length, 42);
for (const caseData of cases) {
  assert.ok(caseData.structuredHistory, `${caseData.id} missing structuredHistory`);
  for (const question of questions) {
    const first = generatePatientReply({ caseData, userQuestion: question, language: "zh", mode: "rule" });
    const second = generatePatientReply({ caseData, userQuestion: question, language: "zh", mode: "rule" });
    assert.equal(first.replyText, second.replyText, `${caseData.id} reply must be deterministic: ${question}`);
    assert.ok(first.matchedSlotIds.length, `${caseData.id} did not match slot: ${question}`);
    assert.ok(first.matchedFacts?.length, `${caseData.id} did not return facts: ${question}`);
    assert.ok(!/^[-•*#]/m.test(first.replyText), `${caseData.id} returned markdown bullets: ${first.replyText}`);
    assert.ok(forbidden.every((word) => !first.replyText.includes(word)), `${caseData.id} leaked placeholder/backend text: ${first.replyText}`);
    assert.ok(!/CTU|膀胱镜结果|病理结果|癌栓|最终诊断/.test(first.replyText), `${caseData.id} leaked report or diagnosis: ${first.replyText}`);
  }
  const compound = generatePatientReply({ caseData, userQuestion: "抽烟吗，喝酒吗？", language: "zh", mode: "rule" });
  assert.ok(compound.matchedSlotIds.includes("LIFE_SMOKING") && compound.matchedSlotIds.includes("LIFE_ALCOHOL"), `${caseData.id} compound question incomplete`);
  const zhSmoking = generatePatientReply({ caseData, userQuestion: "抽烟吗？", language: "zh", mode: "rule" });
  const enSmoking = generatePatientReply({ caseData, userQuestion: "Do you smoke?", language: "en", mode: "rule" });
  assert.equal(zhSmoking.answerSource, enSmoking.answerSource, `${caseData.id} zh/en provenance mismatch`);
}

const p001 = cases.find((item) => item.id === "P001")!;
assert.match(generatePatientReply({ caseData: p001, userQuestion: "有高血压吗？" }).replyText, /有高血压/);
assert.match(generatePatientReply({ caseData: p001, userQuestion: "有糖尿病吗？" }).replyText, /没有糖尿病/);
const meds = generatePatientReply({ caseData: p001, userQuestion: "平时都吃什么药？" });
assert.match(meds.replyText, /缬沙坦/);
assert.match(meds.replyText, /阿司匹林/);

console.log(`Structured history regression passed: ${cases.length} cases x ${questions.length} questions.`);
