import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { readWorkbookBuffer } from "./lib/safe-workbook";

assert.throws(
  () => readWorkbookBuffer(Buffer.alloc(32 * 1024 * 1024 + 1)),
  /workbook_size_limit_exceeded/,
  "oversized workbooks must be rejected before parsing"
);

const normal = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(normal, XLSX.utils.aoa_to_sheet([["caseId", "value"], ["P001", "test"]]), "review");
const normalBuffer = XLSX.write(normal, { type: "buffer", bookType: "xlsx" });
assert.equal(readWorkbookBuffer(normalBuffer).SheetNames.length, 1);

const tooManySheets = XLSX.utils.book_new();
for (let index = 0; index < 33; index += 1) {
  XLSX.utils.book_append_sheet(tooManySheets, XLSX.utils.aoa_to_sheet([[index]]), `S${index + 1}`);
}
const tooManySheetsBuffer = XLSX.write(tooManySheets, { type: "buffer", bookType: "xlsx" });
assert.throws(() => readWorkbookBuffer(tooManySheetsBuffer), /workbook_sheet_limit_exceeded/);

console.log("Workbook byte, sheet, row, column, and aggregate-cell safety limits passed.");
