import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import type { ConsultCatalogItem, OrderCatalogItem, OrderPackage, UiReleaseRule } from "../src/lib/types";
import { readWorkbookFile } from "./lib/safe-workbook";

const input = process.argv[2] ?? "work/source/frontend_order_consult_fix.xlsx";
const outputDir = process.argv[3] ?? "data";

type Row = Record<string, unknown>;

function compact(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function get(row: Row, key: string) {
  return compact(row[key]);
}

function split(text: string) {
  return compact(text).split(/[|｜;；、\n]/).map((item) => item.trim()).filter(Boolean);
}

function writeJson(name: string, data: unknown) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, name), JSON.stringify(data, null, 2), "utf8");
}

function sheetRows(workbook: XLSX.WorkBook, sheetName: string): Row[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Missing required sheet: ${sheetName}`);
  return XLSX.utils.sheet_to_json<Row>(sheet, { defval: "" });
}

function normalizeLabSecondary(value: string) {
  const map: Record<string, string> = {
    尿液蛋白: "尿液蛋白/肾小球线索",
    凝血输血: "凝血/输血",
    感染: "炎症感染",
    "感染/围术期": "炎症感染",
    特殊人群: "大便/全身鉴别",
    "肿瘤/前列腺": "尿液肿瘤",
    "代谢/内分泌": "大便/全身鉴别",
    围术期: "血液基础",
    尿液性病: "尿液感染"
  };
  return map[value] ?? value;
}

function normalizePrimary(row: Row, fallback: string): OrderCatalogItem["primaryCategory"] {
  const primary = get(row, "一级类别") || fallback;
  const secondary = get(row, "二级类别");
  if (/病理|组织|内镜\+病理/.test(primary + secondary)) return "病理/操作";
  if (/围术期/.test(secondary)) return "围术期评估";
  return primary;
}

function makeLab(row: Row): OrderCatalogItem {
  const displayName = get(row, "医嘱显示名");
  return {
    orderId: get(row, "order_id"),
    primaryCategory: normalizePrimary(row, "检验"),
    secondaryCategory: normalizeLabSecondary(get(row, "二级类别")),
    displayName,
    synonyms: Array.from(new Set([displayName, ...split(get(row, "同义词/触发词"))])),
    scenario: get(row, "适用场景"),
    resultShouldInclude: get(row, "返回结果应包含"),
    priority: get(row, "优先级"),
    studentDisplayHint: get(row, "学生端展示建议"),
    cautions: get(row, "注意/禁忌/扣分点"),
    sourceUrl: get(row, "来源URL")
  };
}

function makeImaging(row: Row): OrderCatalogItem {
  const displayName = get(row, "医嘱显示名");
  return {
    orderId: get(row, "order_id"),
    primaryCategory: normalizePrimary(row, "检查"),
    secondaryCategory: get(row, "二级类别"),
    tertiaryCategory: get(row, "三级类别/部位"),
    displayName,
    synonyms: Array.from(new Set([displayName, ...split(get(row, "同义词/触发词"))])),
    scenario: get(row, "适用场景"),
    resultShouldInclude: get(row, "返回结果应包含"),
    priority: get(row, "优先级"),
    studentDisplayHint: get(row, "学生端展示建议"),
    cautions: get(row, "注意/禁忌/扣分点"),
    sourceUrl: get(row, "来源URL")
  };
}

function makeConsult(row: Row): ConsultCatalogItem {
  return {
    consultId: get(row, "consult_id"),
    group: get(row, "大类"),
    department: get(row, "科室"),
    triggers: get(row, "适用触发点"),
    questions: get(row, "要解决的问题"),
    commonCases: get(row, "常见血尿病例"),
    coreLevel: get(row, "是否MDT核心"),
    studentDisplayHint: get(row, "学生端展示建议"),
    evaluatorRule: get(row, "后台扣分/质询规则")
  };
}

function makePackage(row: Row): OrderPackage {
  return {
    packageId: get(row, "package_id"),
    name: get(row, "套餐名称"),
    scenario: get(row, "适用场景"),
    basicLabs: get(row, "默认包含检验"),
    specialTests: "",
    imagingAndProcedures: get(row, "默认包含检查/操作"),
    requiredConsults: get(row, "必须触发会诊"),
    reason: get(row, "适用场景"),
    cautions: get(row, "不应包含/注意"),
    sourceUrls: "",
    frontendTag: get(row, "用于前端")
  };
}

function makeReleaseRule(row: Row): UiReleaseRule {
  return {
    stage: get(row, "阶段"),
    preSubmitAllowed: get(row, "提交前学生端可以显示"),
    preSubmitForbidden: get(row, "提交前禁止显示"),
    postSubmitAllowed: get(row, "提交后允许显示"),
    technicalAdvice: get(row, "技术实现建议")
  };
}

function main() {
  const workbook = readWorkbookFile(input);
  const labs = sheetRows(workbook, "开单检验项目库").map(makeLab).filter((item) => item.orderId && item.displayName);
  const imaging = sheetRows(workbook, "开单检查项目库").map(makeImaging).filter((item) => item.orderId && item.displayName);
  const labsOnly = labs.filter((item) => item.primaryCategory === "检验");
  const imagingOnly = imaging.filter((item) => item.primaryCategory === "检查");
  const procedures = [...labs, ...imaging].filter((item) => item.primaryCategory === "病理/操作");
  const perioperative = [...labs, ...imaging].filter((item) => item.primaryCategory === "围术期评估");
  const consults = sheetRows(workbook, "会诊科室库").map(makeConsult).filter((item) => item.consultId && item.department);
  const packages = sheetRows(workbook, "医嘱套餐模板").map(makePackage).filter((item) => item.packageId && item.name);
  const releaseRules = sheetRows(workbook, "学生端隐藏规则").map(makeReleaseRule).filter((item) => item.stage);

  writeJson("order_catalog_labs.json", labsOnly);
  writeJson("order_catalog_imaging.json", imagingOnly);
  writeJson("order_catalog_procedures.json", procedures);
  writeJson("order_catalog_perioperative.json", perioperative);
  writeJson("consult_catalog.json", consults);
  writeJson("ui_release_rules.json", releaseRules);
  writeJson("order_packages.json", packages);

  console.log(`Generated ${labsOnly.length} lab orders, ${imagingOnly.length} imaging orders, ${procedures.length} procedures, ${perioperative.length} perioperative orders, ${consults.length} consult departments, ${packages.length} packages.`);
}

main();
