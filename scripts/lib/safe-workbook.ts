import fs from "node:fs";
import * as XLSX from "xlsx";

const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;
const DEFAULT_MAX_SHEETS = 32;
const DEFAULT_MAX_ROWS_PER_SHEET = 100_000;
const DEFAULT_MAX_COLUMNS_PER_SHEET = 512;
const DEFAULT_MAX_CELLS = 1_000_000;

type Limits = {
  maxBytes?: number;
  maxSheets?: number;
  maxRowsPerSheet?: number;
  maxColumnsPerSheet?: number;
  maxCells?: number;
};

function assertWorkbookShape(workbook: XLSX.WorkBook, limits: Limits = {}) {
  const maxSheets = limits.maxSheets ?? DEFAULT_MAX_SHEETS;
  const maxRows = limits.maxRowsPerSheet ?? DEFAULT_MAX_ROWS_PER_SHEET;
  const maxColumns = limits.maxColumnsPerSheet ?? DEFAULT_MAX_COLUMNS_PER_SHEET;
  const maxCells = limits.maxCells ?? DEFAULT_MAX_CELLS;
  if (workbook.SheetNames.length > maxSheets) throw new Error("workbook_sheet_limit_exceeded");
  let totalCells = 0;
  for (const sheetName of workbook.SheetNames) {
    const reference = workbook.Sheets[sheetName]?.["!ref"];
    if (!reference) continue;
    const range = XLSX.utils.decode_range(reference);
    const rows = range.e.r - range.s.r + 1;
    const columns = range.e.c - range.s.c + 1;
    if (rows > maxRows) throw new Error("workbook_row_limit_exceeded");
    if (columns > maxColumns) throw new Error("workbook_column_limit_exceeded");
    totalCells += rows * columns;
    if (totalCells > maxCells) throw new Error("workbook_cell_limit_exceeded");
  }
  return workbook;
}

export function readWorkbookBuffer(buffer: Buffer, options: XLSX.ParsingOptions = {}, limits: Limits = {}) {
  const maxBytes = limits.maxBytes ?? DEFAULT_MAX_BYTES;
  if (buffer.byteLength > maxBytes) throw new Error("workbook_size_limit_exceeded");
  const workbook = XLSX.read(buffer, { ...options, type: "buffer", bookVBA: false });
  return assertWorkbookShape(workbook, limits);
}

export function readWorkbookFile(file: string, options: XLSX.ParsingOptions = {}, limits: Limits = {}) {
  const stat = fs.statSync(file);
  const maxBytes = limits.maxBytes ?? DEFAULT_MAX_BYTES;
  if (!stat.isFile() || stat.size > maxBytes) throw new Error("workbook_size_limit_exceeded");
  return readWorkbookBuffer(fs.readFileSync(file), options, limits);
}
