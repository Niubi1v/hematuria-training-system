import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import casesJson from "../data/cases.json";
import casesEnJson from "../data/cases_en.json";
import evaluatorRubricJson from "../data/evaluator_rubric.json";
import { emptyRctRecord, validateRctRecord, type RctRecord } from "../src/components/RctResearchClient";
import { validateCaseLibrary } from "../src/lib/caseSchema";
import { matchOrderResults, score360 } from "../src/lib/multiAgents";
import { readJsonStorage, writeJsonStorage } from "../src/lib/safeStorage";
import type { CaseData, EvaluatorRubricItem } from "../src/lib/types";

const cases = casesJson as CaseData[];
const byId = new Map(cases.map((item) => [item.id, item]));
const report = validateCaseLibrary(cases);
assert.equal(report.caseCount, 42, "病例总数应保留为42");
assert.equal(report.errorCount, 0, JSON.stringify(report.issues.filter((item) => item.severity === "error"), null, 2));

const expectedCategories: Record<string, string> = {
  "HX-ADD-005": "药物/凝血相关",
  "HX-ADD-016": "前列腺疾病",
  "HX-ADD-019": "肾小球疾病",
  "HX-ADD-025": "假性血尿",
  "HX-ADD-026": "外伤",
  "HX-ADD-029": "血管性疾病"
};
for (const [id, category] of Object.entries(expectedCategories)) assert.equal(byId.get(id)?.diseaseCategory, category, `${id}分类错误`);
assert.ok(!JSON.stringify(cases).includes("IGA肾病"), "医学术语必须统一为IgA肾病");
assert.ok(cases.every((item) => item.differentialDiagnosis.length >= 3), "每例至少需要3项鉴别诊断");

for (const id of ["P001", "P006", "P009", "P007", "P011", "HX-ADD-026", "HX-ADD-025"]) {
  const item = byId.get(id);
  assert.ok(item, `缺少代表病例${id}`);
  const evaluation = score360(item!, { events: [], askedSlots: [], examTexts: [], orderTexts: [], diagnosisText: "", mdtDepartments: [], mdtPurpose: "", mdtStarted: false, treatmentText: "", followUpText: "" });
  assert.equal(evaluation.max, 360, `${id}终末评分口径必须为360`);
}

const rubric = evaluatorRubricJson as EvaluatorRubricItem[];
assert.equal(rubric.length, 8, "360评分应包含8个维度");
assert.equal(rubric.reduce((sum, item) => sum + item.max, 0), 360, "评分满分必须为360");

const p001 = byId.get("P001");
assert.ok(p001, "缺少P001");
const withoutCtu = matchOrderResults(p001!, "尿常规");
assert.ok(!withoutCtu.results.some((item) => /CTU/i.test(`${item.orderCategory} ${item.synonyms.join(" ")}`)), "未开CTU不得显示CTU结果");
const withCtu = matchOrderResults(p001!, "CTU", { previousOrderIds: ["LAB-BL-003"], stageNo: 2 });
assert.ok(withCtu.matchedOrders.some((item) => /CTU/i.test(item.displayName)), "CTU同义词应匹配规范医嘱");
assert.ok(withCtu.results.length > 0, "开立CTU后应返回该病例已配置报告");
const repeatedCtu = matchOrderResults(p001!, "CTU", { previousOrderIds: withCtu.matchedOrders.map((item) => item.orderId), stageNo: 2 });
assert.ok(repeatedCtu.duplicateOrderIds?.length, "重复医嘱应被记录");

const englishIds = new Set((casesEnJson as Array<{ id: string }>).map((item) => item.id));
assert.equal(englishIds.size, cases.length, "英文病例索引应覆盖全部病例");
assert.ok(cases.every((item) => englishIds.has(item.id)), "中英文病例ID必须一致");

const clinicalSource = fs.readFileSync(path.join(process.cwd(), "src/components/ClinicalTrainingClient.tsx"), "utf8");
assert.match(clinicalSource, /!isOsce \|\| activeStageNo === 7/, "OSCE阶段反馈必须延迟到终末复盘");
assert.match(clinicalSource, /status: "ordered"/, "检查应先进入已开具状态");
assert.match(clinicalSource, /修改后重新提交/, "阶段反馈后应允许修改并重新提交");
assert.doesNotMatch(clinicalSource, /events: buildScoringEvents/, "终末评分不得提交客户端构造的满分事件");
assert.doesNotMatch(clinicalSource, />DeepSeek AI</, "生产界面不得展示模型品牌作为模式按钮");

class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  key(index: number) { return [...this.map.keys()][index] ?? null; }
  getItem(key: string) { return this.map.get(key) ?? null; }
  setItem(key: string, value: string) { this.map.set(key, value); }
  removeItem(key: string) { this.map.delete(key); }
  clear() { this.map.clear(); }
}
const storage = new MemoryStorage();
Object.defineProperty(globalThis, "window", { value: { localStorage: storage }, configurable: true });
assert.equal(writeJsonStorage("ok", { value: 1 }).ok, true);
assert.deepEqual(readJsonStorage("ok", {}).value, { value: 1 });
storage.setItem("broken", "{not-json");
const recovered = readJsonStorage("broken", { safe: true });
assert.equal(recovered.recovered, true, "损坏缓存应自动恢复");
assert.deepEqual(recovered.value, { safe: true });

const now = new Date().toISOString();
const validRct: RctRecord = { ...emptyRctRecord, participantId: "STU_001", consentStatus: "已同意", consentDate: "2026-07-10", eligibilityStatus: "纳入", grade: "临床医学四年级", randomizationStratum: "四年级", sequenceNumber: "R001", raterCode: "RATER01", createdAt: now, updatedAt: now };
assert.equal(validateRctRecord(validRct, [], null).length, 0, "合法RCT记录应通过校验");
assert.ok(validateRctRecord({ ...validRct, postTest: "361" }, [], null).some((item) => item.includes("0-360")), "RCT分数范围应校验");
assert.ok(validateRctRecord(validRct, [validRct], null).some((item) => item.includes("重复")), "participant_id应检查重复");

const nextConfig = fs.readFileSync(path.join(process.cwd(), "next.config.mjs"), "utf8");
const workflow = fs.readFileSync(path.join(process.cwd(), ".github/workflows/deploy.yml"), "utf8");
assert.match(nextConfig, /basePath/);
assert.match(nextConfig, /trailingSlash:\s*true/);
assert.match(workflow, /NEXT_PUBLIC_BASE_PATH/);
assert.match(workflow, /upload-pages-artifact/);

console.log("Product audit tests passed: cases, 360 scoring, order release, OSCE, storage, RCT, i18n and GitHub Pages config.");
