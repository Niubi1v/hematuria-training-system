import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, inflateRawSync } from "node:zlib";

const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
const MAX_ARCHIVE_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_ARCHIVE_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 2048;
const MAX_HISTORY_BYTES = 128 * 1024 * 1024;

const binaryExtensions = /\.(?:xlsx?|xlsm|docx|pptx|png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|mp3)$/i;
const archiveExtensions = /\.(?:xlsx?|xlsm|docx|pptx|zip)$/i;
const archiveTextEntry = /(?:^|\/)(?:\[Content_Types\]\.xml|[^/]+\.(?:xml|rels|txt|csv|tsv|json|md|html?|css|js|mjs|cjs|ts|tsx|env|yml|yaml))$/i;
const historyBinaryExtensions = ["xlsx", "xls", "xlsm", "docx", "pptx", "png", "jpg", "jpeg", "gif", "webp", "ico", "pdf", "zip", "gz", "woff", "woff2", "ttf", "mp3"];

const tokenRules = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["api-token", /\b(?:sk-[A-Za-z0-9_-]{16,}|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/],
  ["jwt", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/],
  ["aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["google-api-key", /\bAIza[A-Za-z0-9_-]{30,}\b/],
  ["azure-account-key", /\bAccountKey=[A-Za-z0-9+/]{32,}={0,2}\b/],
  ["authorization", /\bAuthorization\s*[:=]\s*["']?(?:Bearer\s+[A-Za-z0-9._~+/-]{20,}|Basic\s+[A-Za-z0-9+/]{16,}={0,2})/i],
  ["cookie", /\b(?:Cookie|Set-Cookie)\s*[:=]\s*["']?[A-Za-z0-9_.-]+=[^;\s"']{16,}/i]
];
const sensitiveAssignment = /^\s*([A-Z][A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD|CONNECTION_STRING|DATABASE_URL|REDIS_URL|COOKIE))\s*=\s*(.*?)\s*$/;
const placeholder = /^(?:|your_|replace_|optional_|example|test-|test_|unit-test|fake|dummy|mock|<|\$\{\{|process\.env|env\.)/i;

function addFinding(findings, file, line, rule) {
  findings.push({ file, line, rule });
}

export function scanText(text, file, findings = []) {
  String(text).split(/\r?\n/).forEach((line, index) => {
    for (const [rule, pattern] of tokenRules) {
      if (pattern.test(line)) addFinding(findings, file, index + 1, rule);
    }
    const assignment = line.match(sensitiveAssignment);
    const value = assignment?.[2]?.replace(/^['"`]|['"`; ,]+$/g, "") || "";
    if (assignment && !placeholder.test(value)) addFinding(findings, file, index + 1, `non-placeholder-${assignment[1]}`);
  });
  return findings;
}

function scanVisibleStrings(buffer, file, findings) {
  const latin = buffer.toString("latin1");
  for (const match of latin.matchAll(/[\x20-\x7e]{4,}/g)) scanText(match[0], `${file}#binary-ascii`, findings);

  const utf16 = [];
  for (const alignment of [0, 1]) {
    let current = "";
    for (let index = alignment; index + 1 < buffer.length; index += 2) {
      const code = buffer[index];
      if (buffer[index + 1] === 0 && code >= 0x20 && code <= 0x7e) current += String.fromCharCode(code);
      else {
        if (current.length >= 4) utf16.push(current);
        current = "";
      }
    }
    if (current.length >= 4) utf16.push(current);
  }
  for (const value of utf16) scanText(value, `${file}#binary-utf16`, findings);
}

function findEndOfCentralDirectory(buffer) {
  const floor = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= floor; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function scanZip(buffer, file, findings) {
  if (buffer.length > MAX_ARCHIVE_BYTES) {
    addFinding(findings, file, 0, "archive-too-large-to-scan");
    return;
  }
  const end = findEndOfCentralDirectory(buffer);
  if (end < 0) {
    addFinding(findings, file, 0, "archive-directory-missing");
    return;
  }
  const entryCount = buffer.readUInt16LE(end + 10);
  const directorySize = buffer.readUInt32LE(end + 12);
  let offset = buffer.readUInt32LE(end + 16);
  if (entryCount > MAX_ARCHIVE_ENTRIES || offset + directorySize > buffer.length) {
    addFinding(findings, file, 0, "archive-limits-invalid");
    return;
  }

  let totalBytes = 0;
  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      addFinding(findings, file, 0, "archive-entry-invalid");
      return;
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
    if (nameEnd > buffer.length) {
      addFinding(findings, file, 0, "archive-entry-invalid");
      return;
    }
    const name = buffer.subarray(offset + 46, nameEnd).toString("utf8").replaceAll("\\", "/");
    offset = nameEnd + extraLength + commentLength;
    totalBytes += uncompressedSize;
    if (name.startsWith("/") || name.split("/").includes("..")) {
      addFinding(findings, `${file}#${name}`, 0, "archive-entry-path-invalid");
      continue;
    }
    if ((flags & 1) !== 0 || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      addFinding(findings, `${file}#${name}`, 0, "archive-entry-unscannable");
      continue;
    }
    if (uncompressedSize > MAX_ARCHIVE_ENTRY_BYTES || totalBytes > MAX_ARCHIVE_TOTAL_BYTES) {
      addFinding(findings, `${file}#${name}`, 0, "archive-entry-too-large");
      continue;
    }
    if (!archiveTextEntry.test(name)) continue;
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      addFinding(findings, `${file}#${name}`, 0, "archive-local-entry-invalid");
      continue;
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (dataOffset + compressedSize > buffer.length) {
      addFinding(findings, `${file}#${name}`, 0, "archive-entry-invalid");
      continue;
    }
    try {
      const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
      const content = method === 0
        ? compressed
        : method === 8
          ? inflateRawSync(compressed, { maxOutputLength: MAX_ARCHIVE_ENTRY_BYTES })
          : null;
      if (!content) addFinding(findings, `${file}#${name}`, 0, "archive-compression-unsupported");
      else scanText(content.toString("utf8"), `${file}#${name}`, findings);
    } catch {
      addFinding(findings, `${file}#${name}`, 0, "archive-entry-decompression-failed");
    }
  }
}

export function scanFileBuffer(buffer, file, findings = []) {
  if (buffer.length > MAX_FILE_BYTES) {
    addFinding(findings, file, 0, "file-too-large-to-scan");
    return findings;
  }
  if (!binaryExtensions.test(file)) return scanText(buffer.toString("utf8"), file, findings);

  scanVisibleStrings(buffer, file, findings);
  if (archiveExtensions.test(file)) scanZip(buffer, file, findings);
  if (/\.gz$/i.test(file)) {
    try {
      scanText(gunzipSync(buffer, { maxOutputLength: MAX_ARCHIVE_TOTAL_BYTES }).toString("utf8"), `${file}#gzip`, findings);
    } catch {
      addFinding(findings, file, 0, "gzip-decompression-failed");
    }
  }
  return findings;
}

export function scanGitHistory(cwd, findings = []) {
  const excludes = historyBinaryExtensions.map((extension) => `:(exclude,glob)**/*.${extension}`);
  let patch;
  try {
    patch = execFileSync("git", ["log", "--all", "--no-ext-diff", "--no-textconv", "--format=commit:%H", "-p", "--", ".", ...excludes], {
      cwd,
      encoding: "utf8",
      maxBuffer: MAX_HISTORY_BYTES
    });
  } catch {
    addFinding(findings, "git-history", 0, "history-scan-incomplete");
    return findings;
  }

  let commit = "unknown";
  let file = "unknown";
  let patchLine = 0;
  for (const line of patch.split(/\r?\n/)) {
    patchLine += 1;
    if (line.startsWith("commit:")) commit = line.slice(7, 19);
    else if (line.startsWith("+++ b/")) file = line.slice(6);
    else if (line.startsWith("--- a/")) file = line.slice(6);
    else if ((line.startsWith("+") && !line.startsWith("+++")) || (line.startsWith("-") && !line.startsWith("---"))) {
      const before = findings.length;
      scanText(line.slice(1), `git-history:${commit}:${file}`, findings);
      for (let index = before; index < findings.length; index += 1) findings[index].line = patchLine;
    }
  }
  return findings;
}

export function scanRepository(cwd = process.cwd()) {
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd, encoding: "utf8" }).split("\0").filter(Boolean);
  const findings = [];
  for (const file of files) {
    const absolute = path.join(cwd, file);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue;
    scanFileBuffer(fs.readFileSync(absolute), file, findings);
  }
  scanGitHistory(cwd, findings);
  return { files, findings };
}

function main() {
  const { files, findings } = scanRepository();
  if (findings.length) {
    for (const finding of findings) console.error(`${finding.rule}\t${finding.file}:${finding.line}`);
    throw new Error(`Repository secret scan found ${findings.length} potential secret(s); values were intentionally not printed.`);
  }
  console.log(`Repository secret scan passed across ${files.length} tracked or candidate files plus reachable text history and bounded binary/archive metadata; no secret values were printed.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
