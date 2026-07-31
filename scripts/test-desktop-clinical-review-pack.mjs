import assert from "node:assert/strict";
import { buildReviewItems, parseCsv } from "./build-desktop-clinical-review-pack.mjs";

const csv = [
  "caseId,项目ID,显示名称,已有source,是否影响诊断/评分,建议结果,needsMedicalReview,推荐provenance,医学说明",
  'P001,LAB-1,尿检,"source, with comma",是,"候选结果, 待审核",true,case_source_projection,不得自动应用',
  "P001,PE-1,查体,无,否,候选正常,false,simulated_normal,无需进入关键审核包",
  'P002,IMG-1,影像,"line 1\nline 2",是,候选影像,需要,diagnosis_consistent_teaching_simulation,需具名审核'
].join("\r\n");

const rows = parseCsv(csv);
assert.equal(rows.length, 3);
assert.equal(rows[0]["已有source"], "source, with comma");
assert.equal(rows[2]["已有source"], "line 1\nline 2");

const items = buildReviewItems([{ sourceFile: "fixture.csv", domain: "laboratory", rows }]);
assert.equal(items.length, 2);
assert.deepEqual(items.map((item) => item.caseId), ["P001", "P002"]);
assert(items.every((item) => item.needsMedicalReview && item.reviewStatus === "pending_human_medical_review"));
assert(items.every((item) => item.decision === "" && item.reviewer === "" && item.reviewDate === ""));
assert(items.every((item) => item.minimumSourceFile.startsWith("case-sources/P")));

console.log("Desktop clinical review pack filtering preserves pending human decisions and excludes non-critical automatic simulation rows.");
