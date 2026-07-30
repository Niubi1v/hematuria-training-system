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
assert.throws(
  () => readWorkbookBuffer(normalBuffer, {}, { maxExpandedBytes: 1 }),
  /workbook_archive_expansion_limit_exceeded/,
  "compressed workbooks must be rejected before XLSX parsing when their expanded content exceeds the configured bound"
);
assert.throws(() => readWorkbookBuffer(normalBuffer, {}, { maxArchiveEntries: 1 }), /workbook_archive_entry_limit_exceeded/);
assert.throws(() => readWorkbookBuffer(normalBuffer, {}, { maxArchiveEntryBytes: 1 }), /workbook_archive_entry_size_limit_exceeded/);

const shaped = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(shaped, XLSX.utils.aoa_to_sheet([["a", "b"], ["c", "d"]]), "shape");
const shapedBuffer = XLSX.write(shaped, { type: "buffer", bookType: "xlsx" });
assert.throws(() => readWorkbookBuffer(shapedBuffer, {}, { maxRowsPerSheet: 1 }), /workbook_row_limit_exceeded/);
assert.throws(() => readWorkbookBuffer(shapedBuffer, {}, { maxColumnsPerSheet: 1 }), /workbook_column_limit_exceeded/);
assert.throws(() => readWorkbookBuffer(shapedBuffer, {}, { maxCells: 3 }), /workbook_cell_limit_exceeded/);

const tooManySheets = XLSX.utils.book_new();
for (let index = 0; index < 33; index += 1) {
  XLSX.utils.book_append_sheet(tooManySheets, XLSX.utils.aoa_to_sheet([[index]]), `S${index + 1}`);
}
const tooManySheetsBuffer = XLSX.write(tooManySheets, { type: "buffer", bookType: "xlsx" });
assert.throws(() => readWorkbookBuffer(tooManySheetsBuffer), /workbook_sheet_limit_exceeded/);

console.log("Workbook byte, archive entry/expansion, sheet, row, column, and aggregate-cell safety limits passed.");
