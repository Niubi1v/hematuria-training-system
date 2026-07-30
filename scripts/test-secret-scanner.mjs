import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as XLSX from "xlsx";
import { scanFileBuffer, scanGitHistory, scanText } from "./scan-repository-secrets.mjs";

const jwt = ["eyJ", "headerpart", ".", "payloadpart", ".", "signaturepart"].join("");
const aws = ["AK", "IA", "1234567890ABCDEF"].join("");
const bearer = ["Authorization: Bearer ", "fixture", "-token-value-that-is-long"].join("");
const privateKey = ["-----BEGIN ", "PRIVATE KEY-----"].join("");

for (const [expectedRule, value] of [
  ["jwt", jwt],
  ["aws-access-key", aws],
  ["authorization", bearer],
  ["private-key", privateKey]
]) {
  const findings = scanText(value, "dynamic-text-fixture.txt", []);
  assert.ok(findings.some((finding) => finding.rule === expectedRule), `${expectedRule} fixture must be detected`);
  assert.equal(JSON.stringify(findings).includes(value), false, "findings must not contain secret values");
}

assert.deepEqual(scanText("LLM_API_KEY=unit-test-only-key", "placeholder.env", []), [], "test placeholders must remain allowed");

const visibleBinary = scanFileBuffer(Buffer.from(`metadata\0${bearer}\0`, "utf8"), "fixture.png", []);
assert.ok(visibleBinary.some((finding) => finding.rule === "authorization"), "visible binary metadata must be scanned");
const utf16Binary = scanFileBuffer(Buffer.concat([Buffer.from([0xff]), Buffer.from(bearer, "utf16le")]), "fixture.pdf", []);
assert.ok(utf16Binary.some((finding) => finding.rule === "authorization"), "odd-aligned UTF-16 binary metadata must be scanned");

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[aws]]), "fixture");
const workbookBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx", compression: true });
const workbookFindings = scanFileBuffer(Buffer.from(workbookBuffer), "fixture.xlsx", []);
assert.ok(workbookFindings.some((finding) => finding.rule === "aws-access-key"), "compressed workbook text must be scanned");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "hematuria-secret-history-"));
const shallowParent = fs.mkdtempSync(path.join(os.tmpdir(), "hematuria-secret-shallow-"));
try {
  execFileSync("git", ["init", "-q"], { cwd: temp });
  execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: temp });
  execFileSync("git", ["config", "user.name", "Secret Scanner Test"], { cwd: temp });
  fs.writeFileSync(path.join(temp, "historical.txt"), jwt, "utf8");
  execFileSync("git", ["add", "historical.txt"], { cwd: temp });
  execFileSync("git", ["commit", "-qm", "fixture add"], { cwd: temp });
  fs.unlinkSync(path.join(temp, "historical.txt"));
  execFileSync("git", ["add", "-u"], { cwd: temp });
  execFileSync("git", ["commit", "-qm", "fixture remove"], { cwd: temp });
  const historyFindings = scanGitHistory(temp, []);
  assert.ok(historyFindings.some((finding) => finding.rule === "jwt" && finding.file.includes("historical.txt")), "deleted historical secrets must remain detectable");
  assert.equal(JSON.stringify(historyFindings).includes(jwt), false, "history findings must not contain secret values");
  const shallow = path.join(shallowParent, "checkout");
  execFileSync("git", ["clone", "-q", "--depth", "1", pathToFileURL(temp).href, shallow]);
  const shallowFindings = scanGitHistory(shallow, []);
  assert.ok(shallowFindings.some((finding) => finding.rule === "history-scan-shallow"), "shallow repositories must fail closed instead of claiming complete history coverage");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
  fs.rmSync(shallowParent, { recursive: true, force: true });
}

console.log("Secret scanner text, binary metadata, compressed workbook, placeholder, non-disclosure, full-history, and shallow-repository contracts passed.");
