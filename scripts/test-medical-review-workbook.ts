import assert from "node:assert/strict";
import path from "node:path";
import * as XLSX from "xlsx";
import { readWorkbookFile } from "./lib/safe-workbook";

const workbookPath = path.resolve("docs/medical-review/hematuria_case_clinical_review.xlsx");
const expectedSheets = [
  "病例总表",
  "诊断与鉴别",
  "检查项目审核",
  "治疗与禁忌",
  "评分权重",
  "医学事实追踪",
  "指南与文献",
  "问题汇总"
];

function rows(sheet: XLSX.WorkSheet) {
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range: 2, defval: "" });
}

const workbook = readWorkbookFile(workbookPath, { cellFormula: true });
assert.deepEqual(workbook.SheetNames, expectedSheets);

const cases = rows(workbook.Sheets["病例总表"]);
assert.equal(cases.length, 42);
assert.equal(new Set(cases.map((item) => item.caseId)).size, 42);
assert.ok(cases.every((item) => item.medicalReview状态 === "needs_revision"));

const facts = rows(workbook.Sheets["医学事实追踪"]);
assert.equal(facts.length, 572);
assert.ok(facts.every((item) => String(item.caseId).trim() && String(item.原字段).trim()));
assert.ok(facts.every((item) => item.是否程序或AI补充 === "是"));

const formulaCells = [
  workbook.Sheets["病例总表"]["B2"],
  workbook.Sheets["评分权重"]["D2"],
  workbook.Sheets["问题汇总"]["B4"]
];
assert.ok(formulaCells.every((cell) => typeof cell?.f === "string" && cell.f.length > 0));
assert.equal(workbook.Sheets["评分权重"]["D2"].f, "SUMIFS(F4:F2000,A4:A2000,A4)");

console.log("Medical review workbook contract passed: 8 sheets, 42 cases, 572 pending facts.");
