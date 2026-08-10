import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.LLM_PROVIDER = "none";

const require = createRequire(import.meta.url);
const cases = require("../data/cases_public.json");
const { generatePatientAnswer } = require("../server/patientSession.js");

const questions = [
  "你哪里不舒服？", "什么时候开始的？", "小便是什么颜色？", "尿里有血块吗？", "腰痛吗？",
  "小便的时候痛不痛？", "有没有发烧？", "小便泡沫多吗？", "眼皮或腿脚肿吗？", "小便次数多吗？",
  "一有尿意会很急吗？", "晚上要起夜吗？", "小便费劲吗？", "尿完觉得排干净了吗？", "抽烟吗？",
  "喝酒吗？", "平时做什么工作？", "以前得过结石吗？", "家里有人有类似情况吗？", "平时吃什么药？"
];
const forbidden = /患者|主诉|未诉|需追问|提交前|评分|教师|标准答案|JSON|matchedSlot|尿检(?:发现|提示)|镜下血尿|肉眼血尿/iu;
const questionEcho = /^(?:有没有|是否|腰侧有没有|小便时是否)[^。！？]{0,30}(?:说不准|不清楚)/u;

async function ask(caseId, sessionId, question) {
  const answer = await generatePatientAnswer({ sessionId, caseId, studentInput: question, conversationHistory: [], language: "zh" });
  assert.ok(answer.replyText?.trim(), `${caseId}/${question} returned a blank answer`);
  assert.ok(answer.replyText.split(/\r?\n/).filter(Boolean).length <= 2, `${caseId}/${question} exceeded two sentences`);
  assert.doesNotMatch(answer.replyText, forbidden, `${caseId}/${question} exposed clinician or internal wording`);
  assert.doesNotMatch(answer.replyText, questionEcho, `${caseId}/${question} echoed a question as the patient answer`);
  return answer;
}

const p035 = [
  ["你哪里不舒服？", /^我体检的时候尿检说有血。$/u],
  ["腰痛吗？", /^没有，我没有腰疼。$/u],
  ["血尿是什么颜色？", /^我大多数时候看着和平常一样，偶尔像茶一样。$/u],
  ["多久了？", /^我是差不多2周前发现的。$/u],
  ["有没有发烧？", /^有，我发过烧。$/u],
  ["以前有过吗？", /^(?:我|这个)/u]
];
for (const [question, expected] of p035) {
  const answer = await ask("HX-ADD-023", "spoken-p035", question);
  assert.match(answer.replyText, expected, `P035 '${question}' was not realized as ordinary patient speech`);
  if (question === "你哪里不舒服？") {
    assert.doesNotMatch(answer.replyText, /泡沫|皮疹|2周/u, "P035 opening disclosed details before they were asked");
  }
}

let checked = 0;
for (const currentCase of cases) {
  for (const question of questions) {
    await ask(currentCase.id, `spoken-${currentCase.id}`, question);
    checked += 1;
  }
}

assert.equal(checked, 42 * 20);
console.log(`Patient spoken-language realism passed: P035 6/6 and ${checked}/${checked} fixed natural questions.`);
