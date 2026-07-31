import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_REVIEW_ROOT = "D:\\HematuriaReview";
const INPUT_NAME = "clinical-content-review-pack-completed.zip";
const OUTPUT_NAME = "desktop-clinical-content-review-pack.zip";
const REVIEW_TABLES = Object.freeze([
  ["physical-exam-gaps.csv", "physical_exam"],
  ["laboratory-result-gaps.csv", "laboratory"],
  ["imaging-result-gaps.csv", "imaging"],
  ["pathology-result-gaps.csv", "pathology"]
]);

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "") : fallback;
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("desktop_review_csv_unterminated_quote");
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows.shift().map((value) => value.replace(/^\uFEFF/, ""));
  return rows
    .filter((values) => values.some((value) => value.trim()))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

function reviewBoolean(value) {
  return String(value || "")
    .trim()
    .split(/[\/／、,，;；|]/)
    .some((part) => /^(?:true|1|yes|y|是|需要|需审核)$/i.test(part.trim()));
}

export function buildReviewItems(tables) {
  return tables.flatMap(({ sourceFile, domain, rows }) => rows
    .filter((row) => reviewBoolean(row.needsMedicalReview))
    .map((row) => ({
      caseId: String(row.caseId || "").trim(),
      domain,
      itemId: String(row["项目ID"] || "").trim(),
      displayName: String(row["显示名称"] || "").trim(),
      existingSource: String(row["已有source"] || "").trim(),
      suggestedResult: String(row["建议结果"] || "").trim(),
      provenance: String(row["推荐provenance"] || "").trim(),
      affectsDiagnosisOrScoring: reviewBoolean(row["是否影响诊断/评分"]),
      needsMedicalReview: true,
      medicalExplanation: String(row["医学说明"] || "").trim(),
      reviewStatus: "pending_human_medical_review",
      decision: "",
      reviewer: "",
      reviewDate: "",
      sourceFile,
      minimumSourceFile: `case-sources/${String(row.caseId || "").trim()}.json`
    }))
    .filter((item) => /^P\d{3}$/.test(item.caseId) && item.itemId && item.displayName));
}

async function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("end", resolve);
    stream.once("error", reject);
  });
  return hash.digest("hex");
}

function runPowerShell(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy", "Bypass",
      "-Command", command
    ], {
      env: {
        ...process.env,
        HEMATURIA_REVIEW_ARG0: String(args[0] || ""),
        HEMATURIA_REVIEW_ARG1: String(args[1] || "")
      },
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"]
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`desktop_review_archive_failed:${code}:${stderr.trim().slice(0, 240)}`));
    });
  });
}

async function copyRequiredSource(extractedRoot, stagingRoot, itemCaseIds) {
  const sourceRoot = path.join(stagingRoot, "minimum-source");
  await fsp.mkdir(path.join(sourceRoot, "case-sources"), { recursive: true });
  for (const fileName of ["canonical-alias-map.json", "case-source-index.json"]) {
    await fsp.copyFile(path.join(extractedRoot, fileName), path.join(sourceRoot, fileName));
  }
  for (const caseId of itemCaseIds) {
    await fsp.copyFile(
      path.join(extractedRoot, "case-sources", `${caseId}.json`),
      path.join(sourceRoot, "case-sources", `${caseId}.json`)
    );
  }
}

export async function buildDesktopClinicalReviewPack({ sourceZip, outputZip, force = false }) {
  assert.equal(process.platform, "win32", "desktop_review_pack_requires_windows");
  if (!path.isAbsolute(sourceZip) || !path.isAbsolute(outputZip)) throw new Error("desktop_review_pack_paths_must_be_absolute");
  if (path.resolve(sourceZip) === path.resolve(outputZip)) throw new Error("desktop_review_pack_output_must_differ");
  const sourceStat = await fsp.stat(sourceZip);
  if (!sourceStat.isFile()) throw new Error("desktop_review_pack_source_missing");
  if (await fsp.stat(outputZip).then(() => true, () => false)) {
    if (!force) throw new Error("desktop_review_pack_output_exists_use_force");
    await fsp.rm(outputZip, { force: true });
  }

  const temporaryRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "hematuria-desktop-review-"));
  const extractedRoot = path.join(temporaryRoot, "source");
  const stagingRoot = path.join(temporaryRoot, "package");
  try {
    await fsp.mkdir(extractedRoot, { recursive: true });
    await fsp.mkdir(path.join(stagingRoot, "review"), { recursive: true });
    await runPowerShell(
      "Expand-Archive -LiteralPath $env:HEMATURIA_REVIEW_ARG0 -DestinationPath $env:HEMATURIA_REVIEW_ARG1 -Force",
      [sourceZip, extractedRoot]
    );

    const tables = [];
    for (const [sourceFile, domain] of REVIEW_TABLES) {
      const rows = parseCsv(await fsp.readFile(path.join(extractedRoot, sourceFile), "utf8"));
      tables.push({ sourceFile, domain, rows });
    }
    const items = buildReviewItems(tables);
    if (!items.length) throw new Error("desktop_review_pack_has_no_pending_items");
    const itemCaseIds = [...new Set(items.map((item) => item.caseId))].sort();
    await copyRequiredSource(extractedRoot, stagingRoot, itemCaseIds);

    const domainCounts = Object.fromEntries(REVIEW_TABLES.map(([, domain]) => [
      domain,
      items.filter((item) => item.domain === domain).length
    ]));
    const manifest = {
      schemaVersion: "hematuria-desktop-clinical-review-v1",
      generatedAt: new Date().toISOString(),
      sourcePackage: path.basename(sourceZip),
      sourcePackageSha256: await sha256(sourceZip),
      itemCount: items.length,
      caseCount: itemCaseIds.length,
      domainCounts,
      status: "requires_human_medical_review",
      runtimeApplied: false,
      dataDirectoryModified: false
    };
    await fsp.writeFile(path.join(stagingRoot, "review", "review-items.json"), `${JSON.stringify(items, null, 2)}\n`, "utf8");
    await fsp.writeFile(path.join(stagingRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await fsp.writeFile(path.join(stagingRoot, "README.md"), [
      "# 桌面版临床内容人工审核包",
      "",
      "本包仅收录仍需人工医学裁决的关键查体、检验、影像与病理候选。",
      "",
      "- `review/review-items.json` 中的建议结果不是已批准病例事实。",
      "- `decision`、`reviewer`、`reviewDate` 保持为空，必须由具名医学负责人填写。",
      "- `minimum-source/` 保存可追溯的最小病例 source 与 canonical/alias 索引。",
      "- 本包未写入 `data/**`，也未改变 `needs_revision`、审核状态或360分规则。",
      "- 未完成医学审核前，这些候选不得进入诊断、治疗或评分证据链。",
      ""
    ].join("\n"), "utf8");

    await fsp.mkdir(path.dirname(outputZip), { recursive: true });
    const temporaryZip = path.join(
      path.dirname(outputZip),
      `.${path.basename(outputZip, path.extname(outputZip))}.partial-${process.pid}.zip`
    );
    await fsp.rm(temporaryZip, { force: true });
    await runPowerShell(
      "Compress-Archive -Path (Join-Path $env:HEMATURIA_REVIEW_ARG0 '*') -DestinationPath $env:HEMATURIA_REVIEW_ARG1 -CompressionLevel Optimal -Force",
      [stagingRoot, temporaryZip]
    );
    await fsp.rename(temporaryZip, outputZip);
    return { outputZip, ...manifest };
  } finally {
    await fsp.rm(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const sourceZip = path.resolve(option("--source", path.join(DEFAULT_REVIEW_ROOT, INPUT_NAME)));
  const outputZip = path.resolve(option("--output", path.join(DEFAULT_REVIEW_ROOT, OUTPUT_NAME)));
  const result = await buildDesktopClinicalReviewPack({
    sourceZip,
    outputZip,
    force: process.argv.includes("--force")
  });
  process.stdout.write(`${JSON.stringify({
    status: "PASS",
    outputZip: result.outputZip,
    itemCount: result.itemCount,
    caseCount: result.caseCount,
    domainCounts: result.domainCounts,
    runtimeApplied: result.runtimeApplied,
    dataDirectoryModified: result.dataDirectoryModified
  }, null, 2)}\n`);
}
