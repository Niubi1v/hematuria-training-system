import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { inflateRawSync } from "node:zlib";
import {
  readRuntimeManifest,
  repoRoot,
  sha256,
  tauriResourcesRoot,
  walkFiles
} from "./desktop-common.mjs";

const MAX_TEXT_BYTES = 8 * 1024 * 1024;
const EXPECTED_DATA_FILES = new Set([
  "cases.json",
  "event_rubrics.json",
  "physical_exam_items.json",
  "physical_exam_results.json",
  "order_results_structured.json",
  "order_catalog_labs.json",
  "order_catalog_imaging.json",
  "order_catalog_procedures.json",
  "order_catalog_perioperative.json",
  "mdt_triggers.json",
  "patient_slots_bilingual.json",
  "history_medical_reconciliation.json",
  "chief_complaint_wording_runtime.json",
  "consult_catalog.json"
]);
const TEXT_EXTENSIONS = new Set([
  ".bat", ".cjs", ".cmd", ".conf", ".css", ".html", ".ini", ".js", ".json",
  ".md", ".mjs", ".ps1", ".svg", ".toml", ".txt", ".xml", ".yaml", ".yml"
]);
const PORTABLE_PATTERN = /^hematuria-desktop-portable-.+-windows-x64\.zip$/i;
const INSTALLER_PATTERN = /^hematuria-desktop-(?:setup|installer)-.+-windows-x64\.exe$/i;

function normalizedPath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\/+/, "");
}

function forbiddenPathReason(relativePath) {
  const normalized = normalizedPath(relativePath).toLowerCase();
  const segments = normalized.split("/").filter(Boolean);
  const baseName = segments.at(-1) || "";

  if (segments.some((segment) => [
    "node_modules",
    "__tests__",
    "tests",
    "test",
    "test-results",
    "screenshots",
    "screenshot",
    "traces",
    "trace",
    "logs",
    "coverage",
    "playwright-report",
    "fonts"
  ].includes(segment))) {
    return "development_or_test_directory";
  }
  if (
    baseName === ".env"
    || baseName.startsWith(".env.")
    || /^(?:id_rsa|id_dsa|id_ecdsa|id_ed25519)(?:\.pub)?$/i.test(baseName)
    || /\.(?:pem|key|p12|pfx|jks)$/i.test(baseName)
  ) {
    return "credential_file";
  }
  if (/\.(?:gguf|ggml)$/i.test(baseName)) return "model_binary";
  if (/\.(?:map|pdb|dmp|trace)$/i.test(baseName)) return "debug_or_trace_artifact";
  if (/\.(?:sqlite|sqlite3|db|db-wal|db-shm)$/i.test(baseName)) return "database_file";
  if (/\.(?:log)$/i.test(baseName)) return "development_log";
  if (/\.(?:woff2?|ttf|otf|eot)$/i.test(baseName)) return "bundled_font";
  if (/(?:^|[._-])(?:spec|test)(?:[._-]|$)/i.test(baseName)) return "test_file";
  if (/(?:screen-?shot|playwright|trace)(?:[._-]|$)/i.test(baseName)) {
    return "test_capture";
  }
  return null;
}

const SECRET_SIGNATURES = [
  {
    name: "private_key_material",
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/
  },
  {
    name: "openai_api_key",
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/
  },
  {
    name: "github_token",
    pattern: /\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{20,}\b/
  },
  {
    name: "slack_token",
    pattern: /\bxox(?:b|p|a|r|s)-[A-Za-z0-9-]{20,}\b/
  },
  {
    name: "google_api_key",
    pattern: /\bAIza[0-9A-Za-z_-]{20,}\b/
  },
  {
    name: "aws_access_key",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/
  }
];

const SECRET_LITERAL_PATTERN =
  /\b(api[_-]?key|access[_-]?token|auth[_-]?token|token|password|passwd|secret|private[_-]?key|client[_-]?secret|training[_-]?state[_-]?secret)\b["']?\s*[:=]\s*["']([^"' \r\n][^"'\r\n]*)["']/giu;

function isSuspiciousSecretLiteral(key, value) {
  const normalized = value.trim();
  if (normalized.length < 8 || normalized.length > 4096) return false;
  if (/^(?:none|null|undefined|redacted|<redacted>|\*+|\$\{[^}]+\})$/i.test(normalized)) {
    return false;
  }
  if (/^(?:authorization|bearer|x-[a-z0-9-]+)$/i.test(normalized)) return false;
  if (/(?:process\.env|import\.meta\.env|Deno\.env|std::env)/i.test(normalized)) return false;

  const normalizedKey = key.toLowerCase().replaceAll("-", "_");
  if (/(?:password|passwd|secret|private_key)/.test(normalizedKey)) return true;
  return normalized.length >= 16 && /[A-Za-z]/.test(normalized) && /[0-9_-]/.test(normalized);
}

function scanTextForSecrets(text, displayPath, findings) {
  for (const signature of SECRET_SIGNATURES) {
    if (signature.pattern.test(text)) {
      findings.push({ reason: signature.name, file: displayPath });
    }
  }
  for (const match of text.matchAll(SECRET_LITERAL_PATTERN)) {
    if (isSuspiciousSecretLiteral(match[1], match[2])) {
      findings.push({ reason: "hardcoded_secret_literal", file: displayPath });
      break;
    }
  }
}

function isTextCandidate(fileName, size) {
  return size <= MAX_TEXT_BYTES && TEXT_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

function verifyDataWhitelist(entries, rootPrefix, findings) {
  const prefix = normalizedPath(rootPrefix).replace(/\/+$/, "");
  const dataPrefix = `${prefix ? `${prefix}/` : ""}app/data/`;
  const actual = new Set();

  for (const entry of entries) {
    const normalized = normalizedPath(entry);
    if (!normalized.startsWith(dataPrefix)) continue;
    const relative = normalized.slice(dataPrefix.length);
    if (!relative || relative.includes("/")) {
      findings.push({ reason: "unexpected_data_path", file: normalized });
      continue;
    }
    actual.add(relative);
  }

  for (const fileName of actual) {
    if (!EXPECTED_DATA_FILES.has(fileName)) {
      findings.push({ reason: "data_not_in_runtime_whitelist", file: `${dataPrefix}${fileName}` });
    }
  }
  for (const fileName of EXPECTED_DATA_FILES) {
    if (!actual.has(fileName)) {
      findings.push({ reason: "required_runtime_data_missing", file: `${dataPrefix}${fileName}` });
    }
  }
}

function verifyRuntimeManifest(text, displayPath, entries, findings) {
  try {
    const manifest = JSON.parse(text);
    const models = manifest?.models || {};
    if (Object.keys(models).sort().join(",") !== "lightweight,standard") {
      findings.push({ reason: "model_modes_manifest_invalid", file: displayPath });
    }
    for (const [mode, model] of Object.entries(models)) {
      if (model?.bundledInInstaller !== false) {
        findings.push({ reason: "model_must_not_be_bundled", file: `${displayPath}:${mode}` });
      }
      const modelFileName = String(model?.fileName || "").toLowerCase();
      if (!modelFileName.endsWith(".gguf")) {
        findings.push({ reason: "model_manifest_filename_invalid", file: `${displayPath}:${mode}` });
      } else if (entries.some((entry) => path.posix.basename(normalizedPath(entry)).toLowerCase() === modelFileName)) {
        findings.push({ reason: "manifest_model_file_is_packaged", file: modelFileName });
      }
    }
    return manifest;
  } catch {
    findings.push({ reason: "runtime_manifest_invalid_json", file: displayPath });
    return null;
  }
}

function expectedRuntimeFiles(manifest) {
  return new Map([
    [
      `runtime/node/${manifest.node.fileName}`,
      { size: manifest.node.size, sha256: manifest.node.sha256 }
    ],
    ...manifest.llamaCpp.files.map((specification) => [
      `runtime/llama/${normalizedPath(specification.path)}`,
      { size: specification.size, sha256: specification.sha256 }
    ])
  ]);
}

function verifyRuntimeEntryNames(entries, manifest, findings) {
  const expected = expectedRuntimeFiles(manifest);
  const actual = entries.filter((entry) => {
    const normalized = normalizedPath(entry);
    return normalized.startsWith("runtime/node/") || normalized.startsWith("runtime/llama/");
  });
  const counts = new Map();
  for (const entry of actual) {
    const normalized = normalizedPath(entry);
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
    if (!expected.has(normalized)) {
      findings.push({ reason: "runtime_binary_not_in_pinned_whitelist", file: normalized });
    }
  }
  for (const expectedPath of expected.keys()) {
    if (!counts.has(expectedPath)) {
      findings.push({ reason: "pinned_runtime_binary_missing", file: expectedPath });
    } else if (counts.get(expectedPath) !== 1) {
      findings.push({ reason: "runtime_binary_duplicate", file: expectedPath });
    }
  }
  return expected;
}

async function verifyResourceRuntimeFiles(root, entries, manifest, findings) {
  const expected = verifyRuntimeEntryNames(entries, manifest, findings);
  for (const [relative, specification] of expected.entries()) {
    const absolute = path.join(root, ...relative.split("/"));
    try {
      const stat = await fs.stat(absolute);
      const digest = stat.isFile() ? await sha256(absolute) : "";
      if (stat.size !== specification.size || digest !== specification.sha256) {
        findings.push({ reason: "runtime_binary_integrity_mismatch", file: relative });
      }
    } catch {
      // Missing entries are already reported by verifyRuntimeEntryNames.
    }
  }
}

function digestBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function scanResourcesDirectory(root, expectedManifest) {
  const findings = [];
  const absoluteFiles = await walkFiles(root);
  const entries = absoluteFiles.map((file) => normalizedPath(path.relative(root, file)));
  const manifestRelative = "app/desktop/runtime-manifest.json";

  for (let index = 0; index < absoluteFiles.length; index += 1) {
    const absolute = absoluteFiles[index];
    const relative = entries[index];
    const pathReason = forbiddenPathReason(relative);
    if (pathReason) findings.push({ reason: pathReason, file: relative });

    const stat = await fs.stat(absolute);
    if (isTextCandidate(relative, stat.size)) {
      const bytes = await fs.readFile(absolute);
      if (!bytes.includes(0)) scanTextForSecrets(bytes.toString("utf8"), relative, findings);
    }
  }

  verifyDataWhitelist(entries, "", findings);
  if (!entries.includes(manifestRelative)) {
    findings.push({ reason: "runtime_manifest_missing", file: manifestRelative });
  } else {
    const embeddedManifest = verifyRuntimeManifest(
      await fs.readFile(path.join(root, ...manifestRelative.split("/")), "utf8"),
      manifestRelative,
      entries,
      findings
    );
    if (JSON.stringify(embeddedManifest) !== JSON.stringify(expectedManifest)) {
      findings.push({ reason: "runtime_manifest_not_equal_to_build_manifest", file: manifestRelative });
    }
  }
  await verifyResourceRuntimeFiles(root, entries, expectedManifest, findings);
  return { kind: "resources", target: root, entries: entries.length, findings };
}

function findEndOfCentralDirectory(buffer) {
  const minimumOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("zip_end_of_central_directory_missing");
}

function parseZipEntries(buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (entryCount === 0xffff || centralDirectoryOffset === 0xffffffff) {
    throw new Error("zip64_not_supported");
  }

  const entries = [];
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("zip_central_directory_invalid");
    const flags = buffer.readUInt16LE(offset + 8);
    const compression = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameBytes = buffer.subarray(offset + 46, offset + 46 + fileNameLength);
    const name = normalizedPath(nameBytes.toString((flags & 0x800) === 0x800 ? "utf8" : "latin1"));
    entries.push({
      name,
      flags,
      compression,
      compressedSize,
      uncompressedSize,
      localHeaderOffset
    });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function readZipEntry(buffer, entry) {
  if ((entry.flags & 0x1) === 0x1) throw new Error("zip_entry_encrypted");
  const offset = entry.localHeaderOffset;
  if (buffer.readUInt32LE(offset) !== 0x04034b50) throw new Error("zip_local_header_invalid");
  const fileNameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const start = offset + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(start, start + entry.compressedSize);
  if (entry.compression === 0) return compressed;
  if (entry.compression === 8) return inflateRawSync(compressed);
  throw new Error(`zip_compression_unsupported:${entry.compression}`);
}

async function scanPortableZip(archivePath, expectedManifest) {
  const findings = [];
  const buffer = await fs.readFile(archivePath);
  const zipEntries = parseZipEntries(buffer);
  const files = zipEntries.filter((entry) => !entry.name.endsWith("/"));
  const names = files.map((entry) => entry.name);
  if (new Set(names).size !== names.length) {
    findings.push({ reason: "portable_duplicate_entry_name", file: path.basename(archivePath) });
  }
  const resourceMarker = "/resources/";
  const portableResources = files
    .filter((entry) => entry.name.includes(resourceMarker) || entry.name.startsWith("resources/"))
    .map((entry) => {
      const markerIndex = entry.name.indexOf(resourceMarker);
      const relative = markerIndex >= 0
        ? entry.name.slice(markerIndex + resourceMarker.length)
        : entry.name.slice("resources/".length);
      return { entry, relative: normalizedPath(relative) };
    });
  const resourceNames = portableResources.map(({ relative }) => relative);

  for (const entry of files) {
    const pathReason = forbiddenPathReason(entry.name);
    if (pathReason) findings.push({ reason: pathReason, file: entry.name });
    if (isTextCandidate(entry.name, entry.uncompressedSize)) {
      try {
        const content = readZipEntry(buffer, entry);
        if (!content.includes(0)) scanTextForSecrets(content.toString("utf8"), entry.name, findings);
      } catch {
        findings.push({ reason: "zip_text_entry_unreadable", file: entry.name });
      }
    }
  }

  if (resourceNames.length === 0) {
    findings.push({ reason: "portable_resources_missing", file: path.basename(archivePath) });
  } else {
    verifyDataWhitelist(resourceNames, "", findings);
    const manifestEntry = files.find((entry) =>
      normalizedPath(entry.name).endsWith("/resources/app/desktop/runtime-manifest.json")
      || normalizedPath(entry.name) === "resources/app/desktop/runtime-manifest.json"
    );
    if (!manifestEntry) {
      findings.push({ reason: "runtime_manifest_missing", file: path.basename(archivePath) });
    } else {
      try {
        const embeddedManifest = verifyRuntimeManifest(
          readZipEntry(buffer, manifestEntry).toString("utf8"),
          manifestEntry.name,
          names,
          findings
        );
        if (JSON.stringify(embeddedManifest) !== JSON.stringify(expectedManifest)) {
          findings.push({ reason: "runtime_manifest_not_equal_to_build_manifest", file: manifestEntry.name });
        }
      } catch {
        findings.push({ reason: "runtime_manifest_unreadable", file: manifestEntry.name });
      }
    }
    const expectedRuntime = verifyRuntimeEntryNames(resourceNames, expectedManifest, findings);
    const runtimeEntries = new Map(portableResources.map(({ entry, relative }) => [relative, entry]));
    for (const [relative, specification] of expectedRuntime.entries()) {
      const entry = runtimeEntries.get(relative);
      if (!entry) continue;
      try {
        const content = readZipEntry(buffer, entry);
        if (content.length !== specification.size || digestBuffer(content) !== specification.sha256) {
          findings.push({ reason: "runtime_binary_integrity_mismatch", file: entry.name });
        }
      } catch {
        findings.push({ reason: "runtime_binary_unreadable", file: entry.name });
      }
    }
  }
  return { kind: "portable_zip", target: archivePath, entries: files.length, findings };
}

async function scanInstallerBinary(installerPath) {
  const findings = [];
  const buffer = await fs.readFile(installerPath);
  const baseName = path.basename(installerPath);
  const pathReason = forbiddenPathReason(baseName);
  if (pathReason) findings.push({ reason: pathReason, file: baseName });

  // NSIS payloads are compressed. Inspect only signatures that remain directly observable
  // in the executable; the paired portable ZIP and staged resources receive full scans.
  const ascii = buffer.toString("latin1");
  const utf16 = buffer.toString("utf16le");
  for (const signature of SECRET_SIGNATURES) {
    if (signature.pattern.test(ascii) || signature.pattern.test(utf16)) {
      findings.push({ reason: signature.name, file: baseName });
    }
  }
  return { kind: "nsis_exe_visible_strings", target: installerPath, entries: 1, findings };
}

async function scanArtifactReceipt(artifacts, expectedManifest) {
  const findings = [];
  if (artifacts.length === 0) {
    return { kind: "artifact_receipt", target: "", entries: 0, findings };
  }
  const roots = [...new Set(artifacts.map((artifact) => path.dirname(artifact)))];
  if (roots.length !== 1) {
    findings.push({ reason: "artifacts_not_in_one_directory", file: roots.join(",") });
    return { kind: "artifact_receipt", target: "", entries: 0, findings };
  }
  const root = roots[0];
  const portableName = artifacts.map((artifact) => path.basename(artifact))
    .find((name) => PORTABLE_PATTERN.test(name));
  const version = portableName?.match(/^hematuria-desktop-portable-(.+)-windows-x64\.zip$/i)?.[1];
  if (!version) {
    findings.push({ reason: "artifact_receipt_version_unresolved", file: root });
    return { kind: "artifact_receipt", target: root, entries: 0, findings };
  }
  const receiptPath = path.join(root, `hematuria-desktop-artifacts-${version}.json`);
  try {
    if (!(await fs.stat(receiptPath)).isFile()) throw new Error("not_file");
  } catch {
    findings.push({ reason: "artifact_receipt_missing", file: receiptPath });
    return { kind: "artifact_receipt", target: receiptPath, entries: 0, findings };
  }
  let receipt;
  try {
    receipt = JSON.parse(await fs.readFile(receiptPath, "utf8"));
  } catch {
    findings.push({ reason: "artifact_receipt_invalid_json", file: receiptPath });
    return { kind: "artifact_receipt", target: receiptPath, entries: 1, findings };
  }
  if (
    receipt?.schemaVersion !== 1
    || receipt?.platform !== "windows-x86_64"
    || receipt?.model?.fileName !== expectedManifest.model.fileName
    || receipt?.model?.bytes !== expectedManifest.model.size
    || receipt?.model?.sha256 !== expectedManifest.model.sha256
    || receipt?.model?.bundledInInstaller !== false
    || Object.entries(expectedManifest.models).some(([mode, model]) => (
      receipt?.models?.[mode]?.fileName !== model.fileName
      || receipt?.models?.[mode]?.alias !== model.alias
      || receipt?.models?.[mode]?.bytes !== model.size
      || receipt?.models?.[mode]?.sha256 !== model.sha256
      || receipt?.models?.[mode]?.bundledInInstaller !== false
    ))
    || receipt?.runtimeManifest?.nodeVersion !== expectedManifest.node.version
    || receipt?.runtimeManifest?.llamaCppVersion !== expectedManifest.llamaCpp.version
    || receipt?.runtimeManifest?.pinnedLlamaFiles !== expectedManifest.llamaCpp.files.length
  ) {
    findings.push({ reason: "artifact_receipt_contract_mismatch", file: receiptPath });
  }
  for (const artifact of artifacts) {
    const kind = path.extname(artifact).toLowerCase() === ".zip" ? "portable" : "installer";
    const record = receipt?.artifacts?.[kind];
    const stat = await fs.stat(artifact);
    const digest = await sha256(artifact);
    if (
      record?.fileName !== path.basename(artifact)
      || record?.bytes !== stat.size
      || record?.sha256 !== digest
    ) {
      findings.push({ reason: "artifact_receipt_digest_mismatch", file: artifact });
    }
  }
  return { kind: "artifact_receipt", target: receiptPath, entries: 1, findings };
}

function parseArguments(args) {
  const result = {
    resources: tauriResourcesRoot,
    resourcesOnly: false,
    requireArtifacts: false,
    artifacts: []
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--resources") result.resources = path.resolve(args[++index]);
    else if (argument === "--artifact") result.artifacts.push(path.resolve(args[++index]));
    else if (argument === "--resources-only") result.resourcesOnly = true;
    else if (argument === "--require-artifacts") result.requireArtifacts = true;
    else throw new Error(`unknown_argument:${argument}`);
  }
  return result;
}

async function discoverArtifacts(explicitArtifacts) {
  if (explicitArtifacts.length > 0) return explicitArtifacts;
  const configuredRoot = process.env.HEMATURIA_DESKTOP_ARTIFACTS?.trim();
  const artifactRoot = configuredRoot
    ? path.resolve(configuredRoot)
    : (process.platform === "win32" ? "D:\\HematuriaDesktopArtifacts" : path.join(repoRoot, "artifacts"));
  try {
    const entries = await fs.readdir(artifactRoot, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && (
        PORTABLE_PATTERN.test(entry.name) || INSTALLER_PATTERN.test(entry.name)
      ))
      .map((entry) => path.join(artifactRoot, entry.name))
      .sort();
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function deduplicateFindings(findings) {
  const seen = new Set();
  return findings.filter((finding) => {
    const key = `${finding.reason}\0${finding.file}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const expectedManifest = await readRuntimeManifest();
  const reports = [await scanResourcesDirectory(options.resources, expectedManifest)];
  const artifacts = options.resourcesOnly ? [] : await discoverArtifacts(options.artifacts);

  if (options.requireArtifacts && artifacts.length === 0) {
    throw new Error("desktop_artifacts_required_but_missing");
  }
  if (artifacts.length > 0) {
    reports.push(await scanArtifactReceipt(artifacts, expectedManifest));
  }
  for (const artifact of artifacts) {
    const extension = path.extname(artifact).toLowerCase();
    if (extension === ".zip") reports.push(await scanPortableZip(artifact, expectedManifest));
    else if (extension === ".exe") reports.push(await scanInstallerBinary(artifact));
    else throw new Error(`unsupported_artifact:${artifact}`);
  }

  let findingCount = 0;
  for (const report of reports) {
    report.findings = deduplicateFindings(report.findings);
    findingCount += report.findings.length;
    console.log(
      `${report.findings.length === 0 ? "PASS" : "FAIL"} `
      + `${report.kind}: ${report.entries} files/entries, ${report.findings.length} findings`
    );
    for (const finding of report.findings.slice(0, 50)) {
      console.log(`  ${finding.reason}: ${finding.file}`);
    }
    if (report.findings.length > 50) {
      console.log(`  ... ${report.findings.length - 50} additional findings omitted`);
    }
  }
  if (artifacts.length === 0 && !options.resourcesOnly) {
    console.log("INFO artifacts: none found; staged resources were still audited");
  }
  if (findingCount > 0) {
    console.error(`Desktop package audit failed with ${findingCount} finding(s).`);
    process.exitCode = 1;
  } else {
    console.log(`Desktop package audit passed (${reports.length} target(s)).`);
  }
}

main().catch((error) => {
  console.error(`Desktop package audit error: ${error?.message || error}`);
  process.exitCode = 1;
});
