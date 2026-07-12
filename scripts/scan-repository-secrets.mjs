import { execFileSync } from "node:child_process";
import fs from "node:fs";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const binaryExtensions = /\.(?:xlsx?|png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|mp3)$/i;
const findings = [];
const tokenRules = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["api-token", /\b(?:sk-[A-Za-z0-9_-]{16,}|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{30,})\b/]
];
const sensitiveAssignment = /^\s*(LLM_API_KEY|AZURE_SPEECH_KEY|TRAINING_STATE_SECRET|AGENT_API_SERVER_TOKEN|VERCEL_OIDC_TOKEN)\s*=\s*(.*?)\s*$/;
const placeholder = /^(?:|your_|replace_|optional_|example|test-|unit-test|<|\$\{\{|process\.env)/i;

for (const file of files) {
  if (binaryExtensions.test(file)) continue;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const [rule, pattern] of tokenRules) {
      if (pattern.test(line)) findings.push({ file, line: index + 1, rule });
    }
    const assignment = line.match(sensitiveAssignment);
    if (assignment && !placeholder.test(assignment[2].replace(/^['"]|['"]$/g, ""))) {
      findings.push({ file, line: index + 1, rule: `non-placeholder-${assignment[1]}` });
    }
  });
}

if (findings.length) {
  for (const finding of findings) console.error(`${finding.rule}\t${finding.file}:${finding.line}`);
  throw new Error(`Repository secret scan found ${findings.length} potential secret(s); values were intentionally not printed.`);
}

console.log(`Repository secret scan passed across ${files.length} tracked or candidate files; no secret values were printed.`);
