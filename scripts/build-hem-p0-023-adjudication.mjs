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
  "审核项ID", "病例ID", "字段", "中文当前值", "英文当前值", "冲突类型", "原始资料摘录",
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
  return [
    item.reviewItemId,
    item.caseId,
    item.field,
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
if (rows.some((row) => row.slice(11).some((value) => value !== ""))) throw new Error("Expert decision fields must remain blank");

const workbook = Workbook.create();
const guide = workbook.worksheets.add("填写说明");
guide.showGridLines = false;
guide.getRange("A1:F1").merge();
guide.getRange("A1").values = [["HEM-P0-023 双语医学语义冲突专家裁决包"]];
guide.getRange("A1:F1").format = { fill: "#17365D", font: { bold: true, color: "#FFFFFF", size: 16 }, rowHeight: 30 };
guide.getRange("A3:B10").values = [
  ["状态", "医学语义裁决仍阻塞；本表不决定医学真值"],
  ["范围", "18条冲突事实，涉及11例病例"],
  ["运行时隔离", "不参与评分、不进入确定性Patient Agent上下文"],
  ["审核状态", "teacherReviewRequired=true；needs_revision保持不变"],
  ["黄色区域", "仅供具名专家与复核人填写"],
  ["决定选项", "保留中文 / 保留英文 / 双方修改 / 删除"],
  ["禁止", "不得自动翻转、翻译、批准或解除needs_revision"],
  ["日志原因", "medical_bilingual_conflict_pending_review"]
];
guide.getRange("A3:A10").format = { fill: "#D9EAF7", font: { bold: true, color: "#17365D" } };
guide.getRange("A3:B10").format.wrapText = true;
guide.getRange("A3:B10").format.borders = { preset: "inside", style: "thin", color: "#D9E2F3" };
guide.getRange("A3").format.columnWidth = 18;
guide.getRange("B3").format.columnWidth = 70;

const sheet = workbook.worksheets.add("18条冲突裁决");
sheet.showGridLines = false;
sheet.getRange("A1:U1").merge();
sheet.getRange("A1").values = [["HEM-P0-023：18条双语医学冲突裁决表（专家填写区为黄色）"]];
sheet.getRange("A1:U1").format = { fill: "#17365D", font: { bold: true, color: "#FFFFFF", size: 14 }, rowHeight: 28 };
sheet.getRange("A2:U2").merge();
sheet.getRange("A2").values = [["隔离不等于裁决：当前事实不参与评分、不进入确定性患者上下文；所有最终值、决定、审核信息和导入状态均保持空白。"]];
sheet.getRange("A2:U2").format = { fill: "#FCE4D6", font: { color: "#9C0006", italic: true }, wrapText: true, rowHeight: 32 };
sheet.getRange("A4:U4").values = [fields];
sheet.getRange("A5:U22").values = rows;
sheet.getRange("A4:U4").format = { fill: "#4472C4", font: { bold: true, color: "#FFFFFF" }, wrapText: true, rowHeight: 42 };
sheet.getRange("A5:U22").format = { wrapText: true, verticalAlignment: "top", rowHeight: 72 };
sheet.getRange("A4:U22").format.borders = { insideHorizontal: { style: "thin", color: "#D9E2F3" } };
sheet.getRange("L5:U22").format.fill = "#FFF2CC";
sheet.getRange("J5:J22").format.fill = "#FCE4D6";
sheet.getRange("A4:U22").format.font = { name: "Microsoft YaHei", size: 10 };
sheet.getRange("A4:U4").format.font = { name: "Microsoft YaHei", size: 10, bold: true, color: "#FFFFFF" };
sheet.freezePanes.freezeRows(4);
sheet.freezePanes.freezeColumns(3);
sheet.tables.add("A4:U22", true, "HemP0023AdjudicationTable").style = "TableStyleMedium2";
sheet.getRange("N5:N22").dataValidation = { rule: { type: "list", values: ["保留中文", "保留英文", "双方修改", "删除"] } };
sheet.getRange("U5:U22").dataValidation = { rule: { type: "list", values: ["待导入", "已导入", "导入失败"] } };

const widths = [18, 13, 19, 24, 28, 34, 52, 24, 15, 28, 30, 24, 28, 34, 36, 16, 20, 15, 16, 15, 16];
widths.forEach((width, index) => { sheet.getRangeByIndexes(3, index, 19, 1).format.columnWidth = width; });

const outDir = path.resolve("outputs/medical-review");
await fs.mkdir(outDir, { recursive: true });

const guidePreview = await workbook.render({ sheetName: "填写说明", range: "A1:F10", scale: 1.5, format: "png" });
await fs.writeFile(path.join(outDir, "HEM-P0-023_填写说明_preview.png"), new Uint8Array(await guidePreview.arrayBuffer()));
const tablePreview = await workbook.render({ sheetName: "18条冲突裁决", range: "A1:U8", scale: 0.8, format: "png" });
await fs.writeFile(path.join(outDir, "HEM-P0-023_裁决表_preview.png"), new Uint8Array(await tablePreview.arrayBuffer()));

const inspection = await workbook.inspect({ kind: "table", range: "18条冲突裁决!A4:U22", include: "values,formulas", tableMaxRows: 20, tableMaxCols: 21, maxChars: 9000 });
console.log(inspection.ndjson);
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 100 }, summary: "final formula error scan" });
console.log(errors.ndjson);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(path.join(outDir, "HEM-P0-023_18条双语医学裁决表.xlsx"));
console.log(`Created ${rows.length}-row adjudication workbook with blank expert decision fields.`);
