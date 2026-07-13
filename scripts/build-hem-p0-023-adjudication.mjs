import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const require = createRequire(path.join(process.cwd(), "package.json"));
const conflictModule = require(path.join(process.cwd(), "server/bilingualConflictQuarantine.js"));
const slots = require(path.join(process.cwd(), "data/patient_slots_bilingual.json"));
const cases = require(path.join(process.cwd(), "data/cases.json"));
const normalized = require(path.join(process.cwd(), "data/hematuria_release_v14_normalized.json"));

const { bilingualConflictEntries } = conflictModule;
const fields = [
  "审核项ID", "病例ID", "字段", "病种（当前病例设定）", "原始病历索引", "中文当前值", "英文当前值", "冲突类型", "原始资料摘录",
  "source/derived来源", "影响诊断", "影响评分", "推荐审核专科", "中文最终值", "英文最终值",
  "决定：保留中文/保留英文/双方修改/删除", "医学依据", "审核人", "审核人专科", "审核日期",
  "复核人", "复核日期", "导入状态"
];

const caseById = new Map(cases.map((item) => [item.id, item]));
const auditByKey = new Map(normalized.facts.map((item) => [`${item.caseId}:${item["原字段"]}`, item]));

function sourceExcerpt(caseData) {
  const source = caseData?.sourceFacts || {};
  const text = [source.pastHistory, source.personalHistory, source.familyHistory, source.medication]
    .filter((value) => typeof value === "string" && value.trim())
    .join("；");
  return text || "原始资料未找到该症状的直接摘录；请回查原始病历。";
}

const rows = bilingualConflictEntries.map((item) => {
  const current = slots[item.caseId][item.field];
  const audit = auditByKey.get(`${item.caseId}:${item.field}`) || {};
  const caseData = caseById.get(item.caseId);
  return [
    item.reviewItemId,
    item.caseId,
    item.field,
    caseData?.diagnosis || caseData?.diseaseSubcategory || caseData?.title || "",
    `原始病历!${item.caseId}`,
    current.patientAnswerZh,
    current.patientAnswerEn,
    "中英文症状陈述存在极性冲突或一方作出另一方未确认的肯定陈述",
    sourceExcerpt(caseById.get(item.caseId)),
    current.provenance,
    audit["是否影响诊断"] || "待专家评估",
    "已临时隔离，不参与评分；待专家裁决",
    "泌尿外科或肾内科；必要时医学翻译复核",
    "", "", "", "", "", "", "", "", "", ""
  ];
});

if (rows.length !== 18) throw new Error(`Expected 18 rows, received ${rows.length}`);
if (rows.some((row) => row.slice(13).some((value) => value !== ""))) throw new Error("Expert decision fields must remain blank");

const affectedCaseIds = [...new Set(bilingualConflictEntries.map((item) => item.caseId))];
const originalRecordRows = affectedCaseIds.map((caseId) => {
  const caseData = caseById.get(caseId);
  if (!caseData) throw new Error(`Missing case ${caseId}`);
  return [
    caseId,
    caseId,
    caseData.diagnosis || caseData.diseaseSubcategory || caseData.title || "",
    caseData.diseaseCategory || "",
    caseData.raw?.symptomsDetail || "原始症状资料未记录",
    caseData.raw?.medicalHistory || "原始既往/个人/家族史未记录",
    caseData.raw?.sheetName || "",
    "data/cases.json.raw（由原始病例工作表导入，未在本裁决包中修改）"
  ];
});
if (originalRecordRows.length !== 11) throw new Error(`Expected 11 affected cases, received ${originalRecordRows.length}`);

const workbook = Workbook.create();
const guide = workbook.worksheets.add("填写说明");
guide.showGridLines = false;
guide.getRange("A1:F1").merge();
guide.getRange("A1").values = [["HEM-P0-023 双语医学语义冲突专家裁决包"]];
guide.getRange("A1:F1").format = { fill: "#17365D", font: { bold: true, color: "#FFFFFF", size: 16 }, rowHeight: 30 };
guide.getRange("A3:B11").values = [
  ["状态", "医学语义裁决仍阻塞；本表不决定医学真值"],
  ["范围", "18条冲突事实，涉及11例病例"],
  ["原始病历", "见“原始病历”工作表；主表按病例ID提供索引"],
  ["运行时隔离", "不参与评分、不进入确定性Patient Agent上下文"],
  ["审核状态", "teacherReviewRequired=true；needs_revision保持不变"],
  ["黄色区域", "仅供具名专家与复核人填写"],
  ["决定选项", "保留中文 / 保留英文 / 双方修改 / 删除"],
  ["禁止", "不得自动翻转、翻译、批准或解除needs_revision"],
  ["日志原因", "medical_bilingual_conflict_pending_review"]
];
guide.getRange("A3:A11").format = { fill: "#D9EAF7", font: { bold: true, color: "#17365D" } };
guide.getRange("A3:B11").format.wrapText = true;
guide.getRange("A3:B11").format.borders = { preset: "inside", style: "thin", color: "#D9E2F3" };
guide.getRange("A3").format.columnWidth = 18;
guide.getRange("B3").format.columnWidth = 70;

const sheet = workbook.worksheets.add("18条冲突裁决");
sheet.showGridLines = false;
sheet.getRange("A1:W1").merge();
sheet.getRange("A1").values = [["HEM-P0-023：18条双语医学冲突裁决表（专家填写区为黄色）"]];
sheet.getRange("A1:W1").format = { fill: "#17365D", font: { bold: true, color: "#FFFFFF", size: 14 }, rowHeight: 28 };
sheet.getRange("A2:W2").merge();
sheet.getRange("A2").values = [["隔离不等于裁决：当前事实不参与评分、不进入确定性患者上下文；所有最终值、决定、审核信息和导入状态均保持空白。"]];
sheet.getRange("A2:W2").format = { fill: "#FCE4D6", font: { color: "#9C0006", italic: true }, wrapText: true, rowHeight: 32 };
sheet.getRange("A4:W4").values = [fields];
sheet.getRange("A5:W22").values = rows;
sheet.getRange("A4:W4").format = { fill: "#4472C4", font: { bold: true, color: "#FFFFFF" }, wrapText: true, rowHeight: 42 };
sheet.getRange("A5:W22").format = { wrapText: true, verticalAlignment: "top", rowHeight: 72 };
sheet.getRange("A4:W22").format.borders = { insideHorizontal: { style: "thin", color: "#D9E2F3" } };
sheet.getRange("N5:W22").format.fill = "#FFF2CC";
sheet.getRange("L5:L22").format.fill = "#FCE4D6";
sheet.getRange("D5:E22").format.fill = "#E2F0D9";
sheet.getRange("A4:W22").format.font = { name: "Microsoft YaHei", size: 10 };
sheet.getRange("A4:W4").format.font = { name: "Microsoft YaHei", size: 10, bold: true, color: "#FFFFFF" };
sheet.freezePanes.freezeRows(4);
sheet.freezePanes.freezeColumns(3);
sheet.tables.add("A4:W22", true, "HemP0023AdjudicationTable").style = "TableStyleMedium2";
sheet.getRange("P5:P22").dataValidation = { rule: { type: "list", values: ["保留中文", "保留英文", "双方修改", "删除"] } };
sheet.getRange("W5:W22").dataValidation = { rule: { type: "list", values: ["待导入", "已导入", "导入失败"] } };

const widths = [18, 13, 19, 28, 18, 24, 28, 34, 52, 24, 15, 28, 30, 24, 28, 34, 36, 16, 20, 15, 16, 15, 16];
widths.forEach((width, index) => { sheet.getRangeByIndexes(3, index, 19, 1).format.columnWidth = width; });

const originalSheet = workbook.worksheets.add("原始病历");
originalSheet.showGridLines = false;
originalSheet.getRange("A1:H1").merge();
originalSheet.getRange("A1").values = [["HEM-P0-023 涉及病例的原始病历与病种"]];
originalSheet.getRange("A1:H1").format = { fill: "#17365D", font: { bold: true, color: "#FFFFFF", size: 14 }, rowHeight: 28 };
originalSheet.getRange("A2:H2").merge();
originalSheet.getRange("A2").values = [["以下内容直接来自 data/cases.json 的 raw 原始病例字段；仅用于专家裁决上下文，本工作簿未修改原始病例。"]];
originalSheet.getRange("A2:H2").format = { fill: "#E2F0D9", font: { color: "#375623", italic: true }, wrapText: true, rowHeight: 30 };
originalSheet.getRange("A4:H4").values = [["原始病历索引", "病例ID", "病种/诊断（当前病例设定）", "疾病大类", "原始现病史/症状详情", "原始既往史/个人史/家族史", "原始工作表", "数据来源"]];
originalSheet.getRange("A5:H15").values = originalRecordRows;
originalSheet.getRange("A4:H4").format = { fill: "#548235", font: { bold: true, color: "#FFFFFF", name: "Microsoft YaHei", size: 10 }, wrapText: true, rowHeight: 38 };
originalSheet.getRange("A5:H15").format = { font: { name: "Microsoft YaHei", size: 10 }, wrapText: true, verticalAlignment: "top", rowHeight: 110 };
originalSheet.getRange("A4:H15").format.borders = { insideHorizontal: { style: "thin", color: "#D9EAD3" } };
originalSheet.tables.add("A4:H15", true, "HemP0023OriginalRecordsTable").style = "TableStyleMedium4";
originalSheet.freezePanes.freezeRows(4);
originalSheet.freezePanes.freezeColumns(2);
[18, 13, 30, 20, 70, 70, 20, 48].forEach((width, index) => { originalSheet.getRangeByIndexes(3, index, 12, 1).format.columnWidth = width; });

const outDir = path.resolve("outputs/medical-review");
await fs.mkdir(outDir, { recursive: true });

const guidePreview = await workbook.render({ sheetName: "填写说明", range: "A1:F11", scale: 1.5, format: "png" });
await fs.writeFile(path.join(outDir, "HEM-P0-023_填写说明_preview.png"), new Uint8Array(await guidePreview.arrayBuffer()));
const tablePreview = await workbook.render({ sheetName: "18条冲突裁决", range: "A1:W8", scale: 0.75, format: "png" });
await fs.writeFile(path.join(outDir, "HEM-P0-023_裁决表_preview.png"), new Uint8Array(await tablePreview.arrayBuffer()));
const originalPreview = await workbook.render({ sheetName: "原始病历", range: "A1:H8", scale: 0.9, format: "png" });
await fs.writeFile(path.join(outDir, "HEM-P0-023_原始病历_preview.png"), new Uint8Array(await originalPreview.arrayBuffer()));

const inspection = await workbook.inspect({ kind: "table", range: "18条冲突裁决!A4:W22", include: "values,formulas", tableMaxRows: 20, tableMaxCols: 23, maxChars: 9000 });
console.log(inspection.ndjson);
const originalInspection = await workbook.inspect({ kind: "table", range: "原始病历!A4:H15", include: "values,formulas", tableMaxRows: 12, tableMaxCols: 8, maxChars: 7000 });
console.log(originalInspection.ndjson);
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 100 }, summary: "final formula error scan" });
console.log(errors.ndjson);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(path.join(outDir, "HEM-P0-023_18条双语医学裁决表.xlsx"));
console.log(`Created ${rows.length}-row adjudication workbook with blank expert decision fields.`);
