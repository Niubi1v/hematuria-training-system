import fs from "node:fs";
import { simulatedPhysicalExamResult } from "../shared/dataAgentPresentation.js";
import type { CaseData, PhysicalExamResult } from "../src/lib/types";

const cases = JSON.parse(fs.readFileSync("data/cases.json", "utf8")) as CaseData[];
const exams = JSON.parse(fs.readFileSync("data/physical_exam_results.json", "utf8")) as PhysicalExamResult[];
const examItems = JSON.parse(fs.readFileSync("data/physical_exam_items.json", "utf8")) as Array<{ examId: string; displayName: string }>;
const forbidden = /需检查|建议检查|应关注|应重点|符合.+(?:疾病|结石|梗阻)|提示诊断|需结合|学生应|当前病例无额外|未诉|需测量/;

function assert(condition: unknown, message: string) { if (!condition) throw new Error(message); }

for (const caseData of cases) {
  const rows = exams.filter((item) => item.caseId === caseData.id);
  assert(rows.length >= 6, `${caseData.id} has fewer than six core examination results`);
  for (const row of rows) {
    assert(row.studentVisibleAfterSelection === true, `${caseData.id}/${row.examId} release rule missing`);
    assert(Boolean(row.teacherOnlyRationale), `${caseData.id}/${row.examId} teacher rationale missing`);
    assert(!forbidden.test(row.result), `${caseData.id}/${row.examId} is instruction/diagnostic text: ${row.result}`);
    assert(/\d|无|未见|阳性|清楚|呼吸音清|柔软|增大|血迹|水肿|压痛|触及|浊音|结节/.test(row.result), `${caseData.id}/${row.examId} is not an objective result: ${row.result}`);
    if (caseData.sex === "女") assert(!/阴囊|睾丸|附睾|前列腺/.test(row.displayName), `${caseData.id} female case exposes male examination`);
    if (caseData.sex === "男") assert(!/妇科|阴道/.test(row.displayName), `${caseData.id} male case exposes gynecological examination`);
    if (Number(caseData.age) < 18) assert(!/前列腺|直肠指检/.test(row.displayName), `${caseData.id} child case exposes adult prostate examination`);
  }
}

const p001Abdomen = exams.find((item) => item.caseId === "P001" && item.examId === "PE101");
assert(p001Abdomen?.result.includes("腹部柔软"), "P001 abdominal examination was not corrected");
const p011 = exams.filter((item) => item.caseId === "P011");
assert(!p011.some((item) => /阴囊|前列腺|睾丸/.test(item.displayName)), "P011 contains male examination");
const p012 = exams.filter((item) => item.caseId === "P012");
assert(!p012.some((item) => /妇科|阴道|输尿管走行区/.test(item.displayName)), "P012 contains female or stone-localization examination");

let simulatedNormalCount = 0;
let failClosedCount = 0;
for (const caseData of cases) {
  const configuredIds = new Set(exams.filter((item) => item.caseId === caseData.id).map((item) => item.examId));
  const applicableItems = examItems.filter((item) => !(item.examId.startsWith("PE2") && caseData.sex === "女")
    && !(item.examId.startsWith("PE3") && caseData.sex === "男"));
  for (const item of applicableItems) {
    if (configuredIds.has(item.examId)) continue;
    const simulated = simulatedPhysicalExamResult(item, "zh");
    if (simulated) {
      assert(caseData.sex === "男" && item.examId === "PE202", `${caseData.id}/${item.examId} is outside the explicit simulated-normal policy`);
      assert(simulated.provenance === "simulated_normal" && simulated.affectsDiagnosis === false && simulated.affectsScore === false && simulated.reviewerStatus === "not_required", `${caseData.id}/${item.examId} simulated-normal metadata is incomplete`);
      simulatedNormalCount += 1;
    } else {
      failClosedCount += 1;
    }
  }
}
assert(simulatedNormalCount > 0, "the explicit non-critical physical-exam simulation policy has no coverage");
assert(failClosedCount > 0, "critical or unapproved missing examinations must remain fail-closed");

const report = [
  "# 查体数据库质控报告",
  "",
  `病例数：${cases.length}`,
  `病例级查体结果：${exams.length}`,
  "",
  "- 每例至少6项核心客观查体：通过",
  "- 性别适用性：通过",
  "- 儿童前列腺项目排除：通过",
  "- 症状/操作提示/诊断提示禁入查体结果：通过",
  "- P001腹部查体、P011女性、P012 IgA肾病专项回归：通过"
].join("\n");
const reportPath = "PHYSICAL_EXAM_QC_REPORT.md";
const existing = fs.readFileSync(reportPath, "utf8").replace(/\r\n/g, "\n");
const existingWithoutTimestamp = existing.replace(/^# 查体数据库质控报告\n\n生成时间：[^\n]+\n/, "# 查体数据库质控报告\n\n").trim();
if (existingWithoutTimestamp !== report.trim()) throw new Error("physical examination QC report is stale; review differences before using UPDATE_PHYSICAL_EXAM_QC_REPORT=1");
if (process.env.UPDATE_PHYSICAL_EXAM_QC_REPORT === "1") {
  const updated = report.replace("# 查体数据库质控报告\n\n", `# 查体数据库质控报告\n\n生成时间：${new Date().toISOString()}\n`);
  fs.writeFileSync(reportPath, `${updated}\n`, "utf8");
}
console.log(`Physical examination QC passed: ${cases.length} cases, ${exams.length} source results, ${simulatedNormalCount} policy-approved simulations, ${failClosedCount} fail-closed missing selections.`);
