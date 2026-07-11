import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import type { CaseData, OrderCatalogItem } from "../src/lib/types";

type Row = Record<string, unknown>;
type ReviewClass = "必须" | "条件性" | "可选" | "不常规推荐" | "禁忌或不适用" | "待专家确认";

const dataDir = path.resolve("data");
const reviewDir = path.resolve("docs", "medical-review");
const sourceVersion = "v1.4-release-expanded" as const;
const requiredSheets = ["版本说明", "42例临床问诊病例", "P013_P042扩写病例", "扩写质量校验", "发布前总校验", "医学依据", "诊断与鉴别", "检查项目审核", "治疗与禁忌", "评分权重", "医学事实追踪", "问题汇总", "指南与文献明细"];

const text = (value: unknown) => String(value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
const number = (value: unknown) => Number.isFinite(Number(text(value))) ? Number(text(value)) : 0;
const bool = (value: unknown) => /^(是|true|1|关键|有)$/i.test(text(value));
const normalize = (value: string) => value.toLowerCase().replace(/[\s+＋/（）()、，,：:;；\-]/g, "");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function findWorkbook() {
  if (process.argv[2]) return path.resolve(process.argv[2]);
  const name = fs.readdirSync(reviewDir).find((item) => item.startsWith("Hematuria_AI_Training_Final_v1.4_RELEASE_P013-P042") && item.includes("医学审核修订版") && item.endsWith(".xlsx"));
  if (!name) throw new Error("Missing reviewed v1.4 workbook in docs/medical-review.");
  return path.join(reviewDir, name);
}

function rows(workbook: XLSX.WorkBook, name: string, headerRow = 3): Row[] {
  const sheet = workbook.Sheets[name];
  if (!sheet) throw new Error(`Missing sheet: ${name}`);
  return XLSX.utils.sheet_to_json<Row>(sheet, { defval: "", raw: false, range: headerRow - 1 });
}

function readJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf8")) as T;
}

function writeJson(name: string, value: unknown) {
  fs.writeFileSync(path.join(dataDir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function makeOrderMatcher(catalog: OrderCatalogItem[]) {
  const candidates = catalog.flatMap((item) => [item.displayName, ...(item.synonyms || [])]
    .map((name) => ({ item, key: normalize(name) }))).filter((entry) => entry.key);
  return (displayName: string) => {
    const key = normalize(displayName);
    const exact = candidates.find((entry) => entry.key === key);
    if (exact) return exact.item.orderId;
    const partial = candidates.filter((entry) => entry.key.length >= 4 && (key.includes(entry.key) || entry.key.includes(key)))
      .sort((a, b) => b.key.length - a.key.length)[0];
    return partial?.item.orderId || `REVIEW-${Buffer.from(displayName).toString("hex").slice(0, 20).toUpperCase()}`;
  };
}

const workbookPath = findWorkbook();
const workbook = XLSX.readFile(workbookPath, { cellFormula: true });
for (const name of requiredSheets) assert(workbook.SheetNames.includes(name), `Required sheet missing: ${name}`);

const mainRows = rows(workbook, "42例临床问诊病例");
const diagnosisRows = rows(workbook, "诊断与鉴别");
const orderRows = rows(workbook, "检查项目审核");
const treatmentRows = rows(workbook, "治疗与禁忌");
const scoringRows = rows(workbook, "评分权重");
const factRows = rows(workbook, "医学事实追踪");
const issueRows = rows(workbook, "问题汇总");
const guidelineRows = rows(workbook, "指南与文献明细");

assert(mainRows.length === 42, `Expected 42 cases, received ${mainRows.length}`);
const displayIds = mainRows.map((row) => text(row["统一病例ID"]));
const runtimeIds = mainRows.map((row) => text(row["原始病例ID"]));
assert(new Set(displayIds).size === 42, "Display case IDs are not unique.");
assert(new Set(runtimeIds).size === 42, "Runtime case IDs are not unique.");
for (let index = 0; index < 42; index += 1) {
  const display = `P${String(index + 1).padStart(3, "0")}`;
  const runtime = index < 12 ? display : `HX-ADD-${String(index - 11).padStart(3, "0")}`;
  assert(displayIds[index] === display && runtimeIds[index] === runtime, `Invalid ID mapping for ${display}: ${runtimeIds[index]}`);
}
assert(factRows.length === 572, `Expected 572 traceable facts, received ${factRows.length}`);
assert(factRows.every((row) => text(row["来源"])), "Every simulated fact must have provenance.");

const mainByDisplay = new Map(mainRows.map((row) => [text(row["统一病例ID"]), row]));
const p003 = mainByDisplay.get("P003")!;
const p005 = mainByDisplay.get("P005")!;
const p016 = mainByDisplay.get("P016")!;
const p030 = mainByDisplay.get("P030")!;
const p016History = text(p016["患者第一句话"]) + text(p016["完整现病史"]);
assert(/右腰|右侧腰/.test(p016History) && !/左腰|左侧腰/.test(p016History), "P016 flank side must be right only.");
assert(/乏力/.test(p016History) && /食欲下降/.test(p016History), "P016 fatigue/appetite facts are missing.");
const p003History = text(p003["详细既往史"]) + text(p003["手术/输血/过敏/泌尿操作史"]);
assert(/胆囊切除/.test(p003History) && /输血史/.test(p003History), "P003 surgery/transfusion facts are missing.");
assert(!/没有输过血|否认输血/.test(p003History), "P003 still denies transfusion.");
const p005Operations = text(p005["手术/输血/过敏/泌尿操作史"]);
assert(/冠脉支架/.test(p005Operations) && /非泌尿操作/.test(p005Operations), "P005 coronary stent correction is missing.");
assert(/兄弟.*前列腺癌/.test(text(p030["家族史"])), "P030 must retain the original brother prostate-cancer history.");

const scoreRowsFor = (display: string) => scoringRows.filter((row) => text(row.caseId) === display);
for (const display of displayIds) {
  const dimensions = new Map<string, number>();
  for (const row of scoreRowsFor(display)) dimensions.set(text(row.dimensionId), number(row["维度分值"]));
  assert([...dimensions.values()].reduce((sum, value) => sum + value, 0) === 360, `${display} scoring dimensions do not total 360.`);
}
assert(mainRows.every((row) => !/approved|已批准|已审核通过/i.test(text(row["审核状态"]))), "No case may be promoted to approved.");

const catalog = [
  ...readJson<OrderCatalogItem[]>("order_catalog_labs.json"),
  ...readJson<OrderCatalogItem[]>("order_catalog_imaging.json"),
  ...readJson<OrderCatalogItem[]>("order_catalog_procedures.json"),
  ...readJson<OrderCatalogItem[]>("order_catalog_perioperative.json")
];
const matchOrderId = makeOrderMatcher(catalog);
const byDisplay = (source: Row[], display: string) => source.filter((row) => text(row.caseId) === display);

const normalizedCases = mainRows.map((row) => {
  const displayCaseId = text(row["统一病例ID"]);
  const runtimeCaseId = text(row["原始病例ID"]);
  const orders = byDisplay(orderRows, displayCaseId).map((item) => ({
    orderId: matchOrderId(text(item["检查名称"])), displayName: text(item["检查名称"]), classification: text(item["建议分类"]) as ReviewClass,
    purpose: text(item["检查目的"]), indication: text(item["适应证"]), prerequisite: text(item["前置条件"]), guidelineUrl: text(item["指南URL"]),
    guidelineSection: text(item["指南章节"]), reviewStatus: text(item["审核状态"])
  }));
  const treatments = byDisplay(treatmentRows, displayCaseId).map((item) => ({
    category: text(item["治疗类别"]), recommendation: text(item["建议内容"]), indication: text(item["适应证"]), prerequisite: text(item["前置条件"]),
    contraindication: text(item["禁忌证"]), dangerousSequenceError: text(item["危险顺序错误"]), guidelineUrl: text(item["指南URL"]),
    guidelineSection: text(item["指南章节"]), reviewStatus: text(item["审核状态"])
  }));
  const rubricItems = byDisplay(scoringRows, displayCaseId).map((item) => ({
    dimensionId: text(item.dimensionId), dimensionMax: number(item["维度分值"]), rubricItemId: text(item.rubricItemId), requirement: text(item["评分要求"]),
    max: number(item["评分项满分"]), itemType: text(item["评分项类型"]), patientSafetyCritical: bool(item["患者安全关键项"]),
    dimensionZeroError: text(item["维度0分错误"]), totalCapError: text(item["总分封顶错误"]), partialCreditRule: text(item["部分得分规则"]), criticalError: text(item["关键错误"])
  }));
  return {
    displayCaseId, runtimeCaseId, age: text(row["年龄"]), sex: text(row["性别"]), opening: text(row["患者第一句话"]), chiefComplaint: text(row["原始主诉"]),
    presentIllness: text(row["完整现病史"]), pastHistory: text(row["详细既往史"]), medicationHistory: text(row["详细用药史"]),
    personalHistory: text(row["个人史/危险因素"]), familyHistory: text(row["家族史"]), menstrualHistory: text(row["婚育/月经史"]),
    diagnosis: text(row["训练目标诊断（待审核）"]), diseaseCategory: text(row["疾病分类"]), reviewStatus: "needs_revision" as const,
    orders, treatments, rubricItems, factCount: byDisplay(factRows, displayCaseId).length
  };
});

writeJson("hematuria_release_v14_normalized.json", {
  schemaVersion: "hematuria-release-v14-normalized-1", sourceVersion, sourceWorkbook: path.basename(workbookPath), formalUseAllowed: false,
  caseCount: normalizedCases.length, factCount: factRows.length, cases: normalizedCases, diagnoses: diagnosisRows, facts: factRows, issues: issueRows, guidelines: guidelineRows
});

const normalizedByRuntime = new Map(normalizedCases.map((item) => [item.runtimeCaseId, item]));
for (const fileName of ["cases.json", "cases_42.json"]) {
  const cases = readJson<CaseData[]>(fileName);
  assert(cases.length === 42, `${fileName} must contain 42 cases before the v1.4 overlay.`);
  writeJson(fileName, cases.map((caseData) => {
    const source = normalizedByRuntime.get(caseData.id);
    assert(source, `No v1.4 source row for runtime case ${caseData.id}`);
    return {
      ...caseData,
      displayCaseId: source.displayCaseId,
      caseVersion: sourceVersion,
      presentIllness: { ...caseData.presentIllness, onset: source.presentIllness },
      pastHistory: source.pastHistory,
      personalHistory: source.personalHistory,
      familyHistory: source.familyHistory,
      medication: source.medicationHistory,
      patientAnswers: { ...caseData.patientAnswers, opening: source.opening },
      medicalReview: { ...(caseData.medicalReview || { references: [], lastReviewedDate: "" }), status: "needs_revision" as const },
      releaseV14: {
        sourceVersion, sourceWorkbook: path.basename(workbookPath), formalUseAllowed: false as const, reviewStatus: "needs_revision" as const,
        factCount: source.factCount, orderRules: source.orders, treatmentRules: source.treatments
      }
    };
  }));
}

console.log(`Imported reviewed v1.4 overlay: ${normalizedCases.length} cases, ${factRows.length} traceable facts, formal use disabled.`);
