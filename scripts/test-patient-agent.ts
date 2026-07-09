import { allCases } from "@/src/lib/cases";
import { generatePatientReply } from "@/src/lib/patientEngine";

const forbidden = [
  "CT提示",
  "CTU提示",
  "占位",
  "癌栓",
  "淋巴结",
  "骨转移",
  "诊断",
  "根据原始病史",
  "根据病例资料",
  "未主动诉",
  "未诉",
  "需追问",
  "教师提示",
  "评分点",
  "膀胱镜",
  "病理",
  "尿检以",
  "肌酐",
  "eGFR",
  "PSA",
  "尿培养",
  "肾活检"
];

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function assertNotContains(text: string, words: string[], context: string) {
  const hits = words.filter((word) => text.includes(word));
  assert(hits.length === 0, `${context} leaked forbidden words: ${hits.join(", ")}\n${text}`);
}

function pickCase(id: string) {
  const item = allCases.find((caseItem) => caseItem.id === id);
  if (!item) throw new Error(`Missing test case ${id}`);
  return item;
}

function ask(caseId: string, question: string) {
  return generatePatientReply({ caseData: pickCase(caseId), userQuestion: question });
}

assert(allCases.length === 42, `default case set should contain 42 cases, got ${allCases.length}`);
for (let i = 1; i <= 30; i += 1) {
  const id = `HX-ADD-${String(i).padStart(3, "0")}`;
  assert(allCases.some((item) => item.id === id), `missing supplemental case ${id}`);
}

const color = ask("HX-ADD-001", "尿是鲜红色吗？");
assert(color.replyText.includes("暗红") || color.replyText.includes("洗肉水") || color.replyText.includes("红"), `color answer should mention color: ${color.replyText}`);
assertNotContains(color.replyText, forbidden, "color question");

const clot = ask("HX-ADD-001", "有血块吗？");
assert(clot.replyText.includes("血块") || clot.replyText.includes("没有注意到"), `clot answer should answer clots: ${clot.replyText}`);
assertNotContains(clot.replyText, ["鲜红", "暗红", "洗肉水", "全程", "无痛", ...forbidden], "clot question");

const phase = ask("HX-ADD-001", "全程都红还是终末红？");
assert(phase.replyText.includes("全程") || phase.replyText.includes("整个") || phase.replyText.includes("开始"), `phase answer should answer phase: ${phase.replyText}`);
assertNotContains(phase.replyText, ["CT", "占位", "诊断", "血块"], "phase question");

const smoking = ask("HX-ADD-001", "你抽烟吗？");
assert(smoking.replyText.includes("吸烟") || smoking.replyText.includes("包年") || smoking.replyText.includes("不吸烟"), `smoking answer should mention smoking only: ${smoking.replyText}`);
assertNotContains(smoking.replyText, ["乙肝", "糖尿病", "饮酒", "输血", "子女", "高血压", ...forbidden], "smoking question");

const drinking = ask("HX-ADD-001", "喝酒吗？");
assert(drinking.replyText.includes("饮酒") || drinking.replyText.includes("喝酒"), `drinking answer should mention drinking: ${drinking.replyText}`);
assertNotContains(drinking.replyText, ["吸烟", "包年", "乙肝", "高血压", "糖尿病"], "drinking question");

const hypertension = ask("HX-ADD-001", "有高血压吗？");
assert(hypertension.replyText.includes("高血压") || hypertension.replyText.includes("没有"), `hypertension answer should mention hypertension: ${hypertension.replyText}`);
assertNotContains(hypertension.replyText, ["糖尿病", "乙肝", "结核", "吸烟", "饮酒", "输血", "子女"], "hypertension question");

const dysuria = ask("P001", "小便疼吗？");
assert(dysuria.replyText.includes("痛") || dysuria.replyText.includes("疼") || dysuria.replyText.includes("烧灼"), `dysuria answer should mention pain only: ${dysuria.replyText}`);
assertNotContains(dysuria.replyText, forbidden, "dysuria question");

const glomerular = ask("P012", "有没有泡沫尿、水肿？");
assert(glomerular.replyText.includes("泡沫") || glomerular.replyText.includes("水肿") || glomerular.replyText.includes("没有"), `glomerular clue answer should stay at symptom level: ${glomerular.replyText}`);
assertNotContains(glomerular.replyText, ["提示肾小球", "肾小球肾炎", "诊断", ...forbidden], "glomerular clue question");

const ct = ask("P004", "做过CT吗，结果怎么样？");
assert(ct.safetyFlags.includes("blocked_report_request"), "CT question should be blocked as report request");
assert(ct.replyText.includes("报告") || ct.replyText.includes("说不清楚"), `CT answer should redirect to reports: ${ct.replyText}`);
assertNotContains(ct.replyText, ["占位", "癌栓", "淋巴结", "骨转移", "CT提示", "诊断"], "CT question");

const diagnosis = ask("HX-ADD-001", "这是什么病？");
assert(diagnosis.safetyFlags.includes("blocked_diagnosis_request"), "diagnosis question should be blocked");
assert(diagnosis.replyText.includes("不清楚") && diagnosis.replyText.includes("医生判断"), `diagnosis answer should not diagnose: ${diagnosis.replyText}`);
assertNotContains(diagnosis.replyText, ["膀胱癌", "肾癌", "IgA", "诊断", "肿瘤"], "diagnosis question");

console.log("Patient Agent tests passed.");
