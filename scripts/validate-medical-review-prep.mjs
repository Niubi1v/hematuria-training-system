import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const reviewDir = path.join(repoRoot, "docs/medical-review");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function parseCsv(text) {
  const input = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    if (row.some((value) => value !== "")) rows.push(row);
  }
  assert(!quoted, "CSV contains an unterminated quoted field");
  const headers = rows.shift();
  assert(headers?.length, "CSV has no header");
  return {
    headers,
    records: rows.map((values, rowIndex) => {
      assert(
        values.length === headers.length,
        `CSV row ${rowIndex + 2} has ${values.length} columns; expected ${headers.length}`,
      );
      return Object.fromEntries(
        headers.map((header, columnIndex) => [header, values[columnIndex]]),
      );
    }),
  };
}

function loadCsv(name) {
  const filePath = path.join(reviewDir, name);
  const bytes = fs.readFileSync(filePath);
  assert(
    bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf,
    `${name} must use a UTF-8 BOM for Excel compatibility`,
  );
  const text = bytes.toString("utf8");
  assert(!text.includes("\ufffd"), `${name} contains replacement characters`);
  return parseCsv(text);
}

const master = loadCsv("MEDICAL_REVIEW_PRIORITY_QUEUE.csv");
const bilingual = loadCsv("BILINGUAL_CONFLICT_REVIEW.csv");
const source = loadCsv("SOURCE_REVISION_REVIEW.csv");
const metadata = loadCsv("METADATA_AND_ENGLISH_LABEL_REVIEW.csv");
const signoff = loadCsv("CASE_SIGNOFF_CHECKLIST.csv");

const requiredHeaders = [
  "审核ID",
  "病例ID",
  "医学领域",
  "字段或事实",
  "当前中文值",
  "当前英文值",
  "source值",
  "derived/simulation值",
  "冲突类型",
  "provenance",
  "reviewerStatus",
  "teacherReviewRequired",
  "是否影响诊断",
  "是否影响Patient回答",
  "是否影响评分",
  "当前运行时处理",
  "推荐审核问题",
  "推荐审核人专业",
  "优先级",
  "原始证据文件及位置",
  "建议结论选项",
  "审核结论",
  "审核人",
  "审核日期",
  "备注",
];
assert(
  JSON.stringify(master.headers) === JSON.stringify(requiredHeaders),
  "Master queue headers differ from the governance contract",
);
assert(master.records.length === 756, "Master queue must contain 756 rows");
assert(bilingual.records.length === 18, "Bilingual queue must contain 18 rows");
assert(source.records.length === 268, "Source queue must contain 268 rows");
assert(
  metadata.records.length === 51,
  "Metadata/English queue must contain 51 rows",
);
assert(signoff.records.length === 42, "Case signoff must contain 42 rows");

const ids = master.records.map((row) => row["审核ID"]);
assert(ids.every(Boolean), "Every master row must have an audit ID");
assert(new Set(ids).size === ids.length, "Master audit IDs must be unique");
assert(
  master.records.every(
    (row) =>
      row["推荐审核问题"].length >= 24 &&
      !["请审核。", "存在冲突。", "信息不一致。"].includes(
        row["推荐审核问题"].trim(),
      ),
  ),
  "Every review question must be specific",
);
assert(
  master.records.every(
    (row) =>
      row["审核结论"] === "" &&
      row["审核人"] === "" &&
      row["审核日期"] === "",
  ),
  "Review conclusion, reviewer, and date must remain blank",
);
assert(
  signoff.records.every(
    (row) =>
      row["终签结论"] === "" &&
      row["终签人"] === "" &&
      row["终签日期"] === "" &&
      row["是否具备终签条件"] === "否",
  ),
  "Case signoff fields must remain blank and no case may be auto-approved",
);

const expectedCases = Array.from(
  { length: 42 },
  (_, index) => `P${String(index + 1).padStart(3, "0")}`,
);
assert(
  JSON.stringify(signoff.records.map((row) => row["病例ID"])) ===
    JSON.stringify(expectedCases),
  "Case signoff must contain P001-P042 exactly once in order",
);
assert(
  signoff.records.every(
    (row) => row["当前病例审核状态"] === "needs_revision",
  ),
  "All cases must retain needs_revision",
);

const priorityCounts = Object.fromEntries(
  ["P0", "P1", "P2"].map((priority) => [
    priority,
    master.records.filter((row) => row["优先级"] === priority).length,
  ]),
);
assert(
  JSON.stringify(priorityCounts) ===
    JSON.stringify({ P0: 477, P1: 199, P2: 80 }),
  "Priority counts must be P0=477, P1=199, P2=80",
);
const ranks = { P0: 0, P1: 1, P2: 2 };
assert(
  master.records.every(
    (row, index) =>
      index === 0 ||
      ranks[master.records[index - 1]["优先级"]] <= ranks[row["优先级"]],
  ),
  "Master queue must be sorted P0 -> P1 -> P2",
);

assert(
  master.records.filter((row) => row["审核ID"].startsWith("MR-")).length ===
    419,
  "All 419 existing MR rows must be retained",
);
assert(
  master.records.filter((row) =>
    row["审核ID"].startsWith("HEM-P0-001-"),
  ).length === 151,
  "All 151 HEM-P0-001 rows must be retained",
);
assert(
  master.records.filter((row) =>
    row["审核ID"].startsWith("HEM-P0-023-"),
  ).length === 18,
  "All 18 HEM-P0-023 rows must be retained",
);
assert(
  master.records.filter((row) =>
    row["审核ID"].startsWith("HISTORY-MED-"),
  ).length === 14,
  "All 14 history BLOCKED_MEDICAL rows must be retained",
);
assert(
  master.records.filter((row) => row["审核ID"].startsWith("SRC-REV-"))
    .length === 103,
  "Source revision observations must dedupe to 103 standalone rows after P002 merge",
);
assert(
  master.records.filter((row) => row["审核ID"].startsWith("META-")).length ===
    28,
  "All 28 metadata rows must be retained",
);
assert(
  master.records.filter((row) => row["审核ID"].startsWith("EN-LABEL-"))
    .length === 23,
  "All 23 English label rows must be retained",
);
assert(
  master.records.some(
    (row) =>
      row["审核ID"] === "HISTORY-MED-001" &&
      row["病例ID"] === "P002" &&
      row["备注"].includes("SRC-REV"),
  ),
  "P002 source/source surgery history must absorb the matching source-revision observation",
);

const disallowedEngineering = /CI-|CORS|Playwright|Vercel|移动端|依赖漏洞/;
assert(
  master.records.every(
    (row) =>
      !disallowedEngineering.test(
        `${row["审核ID"]} ${row["冲突类型"]} ${row["字段或事实"]}`,
      ),
  ),
  "Engineering defects must not enter the medical review queue",
);

for (const markdownName of [
  "MEDICAL_REVIEW_MASTER_INDEX.md",
  "MEDICAL_REVIEW_SUMMARY.md",
]) {
  const text = fs.readFileSync(path.join(reviewDir, markdownName), "utf8");
  assert(!text.includes("\ufffd"), `${markdownName} contains encoding errors`);
}
assert(
  fs.existsSync(
    path.join(
      repoRoot,
      "docs/goal/HEM-P0-001_SOURCE_MARKER_CONFLICT.md",
    ),
  ),
  "The previously broken HEM-P0-001 report path must now resolve",
);

console.log(
  JSON.stringify({
    masterRows: master.records.length,
    priorityCounts,
    uniqueAuditIds: ids.length,
    bilingualRows: bilingual.records.length,
    sourceRows: source.records.length,
    metadataAndEnglishRows: metadata.records.length,
    signoffRows: signoff.records.length,
    blankReviewSignatures: true,
    utf8BomCsv: true,
  }),
);
