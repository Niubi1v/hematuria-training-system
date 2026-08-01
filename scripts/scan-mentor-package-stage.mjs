import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { sha256, walkFiles } from "./desktop-common.mjs";

const stage = path.resolve(process.argv[2] || "");
assert(stage && path.isAbsolute(stage), "mentor_stage_path_required");
const files = await walkFiles(stage);
const relativeFiles = files.map((file) => path.relative(stage, file).replaceAll("\\", "/"));
const required = [
  "启动血尿训练系统.cmd",
  "README_导师验收.txt",
  "KNOWN_LIMITATIONS.txt",
  "VERSION.json",
  "VERIFY-PACKAGE.ps1",
  "SHA256SUMS.txt",
  "tools/Start-Mentor.ps1",
  "App/HematuriaTraining.exe",
  "App/resources/runtime/node/node.exe",
  "App/resources/runtime/llama/llama-server.exe",
  "App/resources/app/desktop/clinical-content-triage-runtime.json",
  "Model/Qwen3-1.7B-Q4_K_M.gguf"
];
for (const relative of required) assert(relativeFiles.includes(relative), `mentor_required_file_missing:${relative}`);

const forbiddenDirectory = /(?:^|\/)(?:\.git|node_modules|test-results|playwright-report|coverage|screenshots?|traces?|logs?|cache)(?:\/|$)/iu;
const forbiddenFile = /(?:^|\/)(?:\.env(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?)$|\.(?:map|pdb|dmp|trace|sqlite3?|db(?:-wal|-shm)?|log|pem|key|p12|pfx|jks|woff2?|ttf|otf)$/iu;
for (const relative of relativeFiles) {
  assert(!forbiddenDirectory.test(relative), `mentor_forbidden_directory:${relative}`);
  assert(!forbiddenFile.test(relative), `mentor_forbidden_file:${relative}`);
  if (/\.(?:gguf|ggml)$/iu.test(relative)) assert.equal(relative, "Model/Qwen3-1.7B-Q4_K_M.gguf", `mentor_unexpected_model:${relative}`);
}

const secretPatterns = [
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/u,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/u,
  /\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{20,}\b/u,
  /\bxox(?:b|p|a|r|s)-[A-Za-z0-9-]{20,}\b/u,
  /\bAIza[0-9A-Za-z_-]{20,}\b/u,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u,
  /\b(?:cookie|set-cookie)\s*[:=]\s*["'][^"']{12,}["']/iu
];
const textExtensions = new Set([".bat", ".cjs", ".cmd", ".css", ".html", ".ini", ".js", ".json", ".md", ".mjs", ".ps1", ".svg", ".txt", ".xml", ".yaml", ".yml"]);
for (const file of files) {
  const stat = await fs.stat(file);
  if (stat.size > 8 * 1024 * 1024 || !textExtensions.has(path.extname(file).toLowerCase())) continue;
  const text = await fs.readFile(file, "utf8");
  for (const pattern of secretPatterns) assert(!pattern.test(text), `mentor_secret_signature:${path.relative(stage, file)}`);
}

const modelPath = path.join(stage, "Model", "Qwen3-1.7B-Q4_K_M.gguf");
const modelStat = await fs.stat(modelPath);
assert.equal(modelStat.size, 1_282_439_264, "mentor_model_size_mismatch");
assert.equal(await sha256(modelPath), "d2387ca2dbfee2ffabce7120d3770dadca0b293052bc2f0e138fdc940d9bc7b5", "mentor_model_sha256_mismatch");

const readme = await fs.readFile(path.join(stage, "README_导师验收.txt"), "utf8");
const readmeLines = readme.replace(/^\uFEFF/u, "").split(/\r?\n/u);
assert.deepEqual(readmeLines.slice(0, 3), [
  "完整解压",
  "→ 双击“启动血尿训练系统.cmd”",
  "→ 自动启动本地服务、本地模型和桌面窗口"
]);
assert.match(readme, /医学教学 Beta.*不用于真实诊疗/u);
assert.match(readme, /source projection 保留并应用 4 项.*运行时拒绝总数 121 项/u);
assert.match(readme, /1023 项等待医学审核.*1 项医学冲突/u);
const limitations = await fs.readFile(path.join(stage, "KNOWN_LIMITATIONS.txt"), "utf8");
assert.match(limitations, /保留并应用 4 项.*拒绝总数为 121 项/u);
assert.match(limitations, /1023 项等待医学审核.*fail-closed/u);
assert.match(limitations, /1 项医学冲突/u);

const version = JSON.parse((await fs.readFile(path.join(stage, "VERSION.json"), "utf8")).replace(/^\uFEFF/u, ""));
assert.match(version.channel, /^mentor-local-ai-final-candidate(?:-r2)?$/u);
assert.match(version.productHead, /^[0-9a-f]{40}$/u);
assert.equal(version.medicalGovernance.sourceProjectionApplied, 4);
assert.equal(version.medicalGovernance.sourceProjectionWithdrawn, 62);
assert.equal(version.medicalGovernance.sourceProjectionRejected, 121);
assert.equal(version.medicalGovernance.medicalReviewPending, 1023);
assert.equal(version.medicalGovernance.medicalConflict, 1);
assert.equal(version.runtimeSecurity.cloudRequestAllowed, false);
assert.equal(version.runtimeSecurity.listenAddress, "127.0.0.1");

const launcher = await fs.readFile(path.join(stage, "tools", "Start-Mentor.ps1"), "utf8");
for (const signal of ["正在启动本地患者服务", "127.0.0.1", "Get-FileHash", "Get-NetTCPConnection", "llama-server.exe", "node.exe"]) {
  assert(launcher.includes(signal), `mentor_launcher_contract_missing:${signal}`);
}
const runtime = JSON.parse(await fs.readFile(path.join(stage, "App", "resources", "app", "desktop", "clinical-content-triage-runtime.json"), "utf8"));
assert.equal(runtime.sourceProjection.length, 4);
assert.equal(runtime.sourceProjectionRejected.length, 121);
assert.equal(runtime.medicalReviewPending.length, 1023);
assert.equal(runtime.safeSimulatedNormal.length, 75);
assert.equal(runtime.noSpecimenOrNotIndicated.length, 552);
assert.equal(runtime.noReportOrNotIndicated.length, 952);
assert.equal(runtime.medicalConflicts.length, 1);
assert(runtime.safeSimulatedNormal.every((item) => item.scoringEligible === false && item.diagnosticEligible === false));

console.log(JSON.stringify({
  stage,
  files: files.length,
  modelBytes: modelStat.size,
  secretFindings: 0,
  forbiddenFindings: 0,
  rootLauncher: true,
  triageRuntime: { sourceProjectionApplied: 4, sourceProjectionRejected: 121, medicalReviewPending: 1023, medicalConflicts: 1 }
}));
