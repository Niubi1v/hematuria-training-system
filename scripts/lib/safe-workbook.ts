import fs from "node:fs";
import { inflateRawSync } from "node:zlib";
import * as XLSX from "xlsx";

const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;
const DEFAULT_MAX_SHEETS = 32;
const DEFAULT_MAX_ROWS_PER_SHEET = 100_000;
const DEFAULT_MAX_COLUMNS_PER_SHEET = 512;
const DEFAULT_MAX_CELLS = 1_000_000;
const DEFAULT_MAX_ARCHIVE_ENTRIES = 2_048;
const DEFAULT_MAX_ARCHIVE_ENTRY_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_EXPANDED_BYTES = 64 * 1024 * 1024;

export type WorkbookLimits = {
  maxBytes?: number;
  maxSheets?: number;
  maxRowsPerSheet?: number;
  maxColumnsPerSheet?: number;
  maxCells?: number;
  maxArchiveEntries?: number;
  maxArchiveEntryBytes?: number;
  maxExpandedBytes?: number;
};

function findEndOfCentralDirectory(buffer: Buffer) {
  const floor = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= floor; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function assertArchiveLimits(buffer: Buffer, limits: WorkbookLimits) {
  if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) return;
  const end = findEndOfCentralDirectory(buffer);
  if (end < 0) throw new Error("workbook_archive_directory_missing");

  const disk = buffer.readUInt16LE(end + 4);
  const directoryDisk = buffer.readUInt16LE(end + 6);
  const entriesOnDisk = buffer.readUInt16LE(end + 8);
  const entryCount = buffer.readUInt16LE(end + 10);
  const directorySize = buffer.readUInt32LE(end + 12);
  let offset = buffer.readUInt32LE(end + 16);
  const directoryEnd = offset + directorySize;
  const maxEntries = limits.maxArchiveEntries ?? DEFAULT_MAX_ARCHIVE_ENTRIES;
  const maxEntryBytes = limits.maxArchiveEntryBytes ?? DEFAULT_MAX_ARCHIVE_ENTRY_BYTES;
  const maxExpandedBytes = limits.maxExpandedBytes ?? DEFAULT_MAX_EXPANDED_BYTES;

  if (disk !== 0 || directoryDisk !== 0 || entriesOnDisk !== entryCount) {
    throw new Error("workbook_archive_multidisk_unsupported");
  }
  if (entryCount === 0xffff || directorySize === 0xffffffff || offset === 0xffffffff) {
    throw new Error("workbook_archive_zip64_unsupported");
  }
  if (entryCount > maxEntries) throw new Error("workbook_archive_entry_limit_exceeded");
  if (directoryEnd > end || directoryEnd > buffer.length) throw new Error("workbook_archive_directory_invalid");

  let expandedBytes = 0;
  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    if (offset + 46 > directoryEnd || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("workbook_archive_entry_invalid");
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const nameEnd = offset + 46 + nameLength;
    const nextOffset = nameEnd + extraLength + commentLength;
    if (nextOffset > directoryEnd) throw new Error("workbook_archive_entry_invalid");
    const name = buffer.subarray(offset + 46, nameEnd).toString("utf8").replaceAll("\\", "/");
    offset = nextOffset;

    if (!name || name.startsWith("/") || /^[a-z]:\//i.test(name) || name.split("/").includes("..")) {
      throw new Error("workbook_archive_entry_path_invalid");
    }
    if ((flags & 1) !== 0) throw new Error("workbook_archive_encrypted");
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error("workbook_archive_zip64_unsupported");
    }
    if (method !== 0 && method !== 8) throw new Error("workbook_archive_compression_unsupported");
    if (uncompressedSize > maxEntryBytes) throw new Error("workbook_archive_entry_size_limit_exceeded");
    expandedBytes += uncompressedSize;
    if (expandedBytes > maxExpandedBytes) throw new Error("workbook_archive_expansion_limit_exceeded");

    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error("workbook_archive_local_entry_invalid");
    }
    const localFlags = buffer.readUInt16LE(localOffset + 6);
    const localMethod = buffer.readUInt16LE(localOffset + 8);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if ((localFlags & 1) !== 0 || localMethod !== method || dataOffset + compressedSize > buffer.length) {
      throw new Error("workbook_archive_local_entry_invalid");
    }
    const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
    let content: Buffer;
    try {
      content = method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: maxEntryBytes + 1 });
    } catch {
      throw new Error("workbook_archive_decompression_failed");
    }
    if (content.byteLength > maxEntryBytes) throw new Error("workbook_archive_entry_size_limit_exceeded");
    if (content.byteLength !== uncompressedSize) throw new Error("workbook_archive_entry_size_mismatch");
  }
  if (offset !== directoryEnd) throw new Error("workbook_archive_directory_invalid");
}

function assertWorkbookShape(workbook: XLSX.WorkBook, limits: WorkbookLimits = {}) {
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

export function readWorkbookBuffer(buffer: Buffer, options: XLSX.ParsingOptions = {}, limits: WorkbookLimits = {}) {
  const maxBytes = limits.maxBytes ?? DEFAULT_MAX_BYTES;
  if (buffer.byteLength > maxBytes) throw new Error("workbook_size_limit_exceeded");
  assertArchiveLimits(buffer, limits);
  const workbook = XLSX.read(buffer, { ...options, type: "buffer", bookVBA: false });
  return assertWorkbookShape(workbook, limits);
}

export function readWorkbookFile(file: string, options: XLSX.ParsingOptions = {}, limits: WorkbookLimits = {}) {
  const stat = fs.statSync(file);
  const maxBytes = limits.maxBytes ?? DEFAULT_MAX_BYTES;
  if (!stat.isFile() || stat.size > maxBytes) throw new Error("workbook_size_limit_exceeded");
  return readWorkbookBuffer(fs.readFileSync(file), options, limits);
}
