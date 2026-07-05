import { allCases } from "@/src/lib/cases";
import { generatePatientReply } from "@/src/lib/patientEngine";

const forbidden = [
  "CT",
  "CTU",
  "占位",
  "癌栓",
  "淋巴结",
  "诊断",
  "根据原始病史",
  "根据病例资料",
  "未主动诉",
  "需追问",
  "教师提示",
  "评分点",
  "膀胱镜",
  "病理",
  "尿常规",
  "肌酐",
  "eGFR",
  "PSA",
  "尿培养",
  "肾活检"
];

function pickCase(id: string) {
  const item = allCases.find((caseItem) => caseItem.id === id);
  if (!item) throw new Error(`Missing test case ${id}`);
  return item;
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function assertNotContains(text: string, words: string[], context: string) {
  const hits = words.filter((word) => text.includes(word));
  assert(hits.length === 0, `${context} leaked forbidden words: ${hits.join(", ")}\n${text}`);
}

function ask(caseId: string, question: string) {
  return generatePatientReply({ caseData: pickCase(caseId), userQuestion: question });
}

const color = ask("P001", "尿是鲜红色吗？");
assert(color.matchedSlotIds.includes("HX007"), "color question should match HX007");
assert(/[红茶洗肉水酱油颜色]/.test(color.replyText), `color answer should mention urine color: ${color.replyText}`);
assertNotContains(color.replyText, forbidden, "color question");

const clot = ask("P001", "有血块吗？");
assert(clot.matchedSlotIds.includes("HX008"), "clot question should match HX008");
assert(/血块|没有注意到|没有明显/.test(clot.replyText), `clot answer should only answer clots: ${clot.replyText}`);
assertNotContains(clot.replyText, ["未主动诉", "需追问", "全程血尿", "无痛", "鲜红色", ...forbidden], "clot question");

const dysuria = ask("P001", "小便疼吗？");
assert(dysuria.matchedSlotIds.includes("HX009"), "dysuria question should match HX009");
assert(/疼|痛|烧灼|不疼|没有明显/.test(dysuria.replyText), `dysuria answer should mention pain only: ${dysuria.replyText}`);
assertNotContains(dysuria.replyText, forbidden, "dysuria question");

const ct = ask("P004", "做过CT吗，结果怎么样？");
assert(ct.safetyFlags.includes("blocked_report_request"), "CT question should be blocked as report request");
assert(/检查报告|报告/.test(ct.replyText), `CT answer should redirect to reports: ${ct.replyText}`);
assertNotContains(ct.replyText, ["占位", "癌栓", "淋巴结", "骨转移", "CT提示", "诊断"], "CT question");

const smoking = ask("P001", "你抽烟吗？");
assert(smoking.matchedSlotIds.includes("HX023"), "smoking question should match HX023");
assert(/烟|吸|抽|不吸|没有/.test(smoking.replyText), `smoking answer should mention smoking only: ${smoking.replyText}`);
assertNotContains(smoking.replyText, forbidden, "smoking question");

const diagnosis = ask("P001", "这是什么病？");
assert(diagnosis.safetyFlags.includes("blocked_diagnosis_request"), "diagnosis question should be blocked");
assert(/不清楚|医生判断/.test(diagnosis.replyText), `diagnosis answer should not diagnose: ${diagnosis.replyText}`);
assertNotContains(diagnosis.replyText, ["膀胱癌", "肾癌", "IgA", "诊断", "恶性肿瘤"], "diagnosis question");

console.log("Patient Agent tests passed.");
