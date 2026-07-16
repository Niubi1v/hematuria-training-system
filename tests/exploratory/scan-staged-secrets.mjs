import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { scanFileBuffer, scanGitHistory } from "../../scripts/scan-repository-secrets.mjs";

const files = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], {
  encoding: "utf8",
  maxBuffer: 4 * 1024 * 1024
}).split("\0").filter(Boolean);
const runtimeValues = [
  "VERCEL_AUTOMATION_BYPASS_SECRET",
  "TRAINING_STATE_SECRET",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN"
].map((name) => process.env[name]).filter(Boolean).map((value) => Buffer.from(value));

const findings = [];
for (const file of files) {
  const absolute = path.resolve(file);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue;
  const buffer = fs.readFileSync(absolute);
  scanFileBuffer(buffer, file, findings);
  if (runtimeValues.some((value) => value.length > 0 && buffer.includes(value))) {
    findings.push({ rule: "runtime-secret-bytes", file, line: 0 });
  }
}
scanGitHistory(process.cwd(), findings);

if (findings.length > 0) {
  for (const finding of findings) console.error(`${finding.rule}\t${finding.file}:${finding.line}`);
  throw new Error(`Staged secret scan found ${findings.length} potential issue(s); values were intentionally not printed.`);
}

console.log(`Staged secret scan passed: files=${files.length} history=complete findings=0; no sensitive values were printed.`);
