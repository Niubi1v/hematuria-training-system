import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientFiles = [
  "src/components/HomeWorkspaceClient.tsx",
  "src/components/CaseCatalogClient.tsx",
  "src/components/RandomTrainingClient.tsx",
  "src/components/ClinicalTrainingClient.tsx"
];
const sources = new Map();

for (const relative of clientFiles) {
  const source = await fs.readFile(path.join(repoRoot, relative), "utf8");
  sources.set(relative, source);
  assert.doesNotMatch(source, /cases_public\.json|chief_complaint_wording_runtime\.json/);
}

const layoutSource = await fs.readFile(path.join(repoRoot, "app/layout.tsx"), "utf8");
const headerSource = await fs.readFile(path.join(repoRoot, "src/components/AppHeader.tsx"), "utf8");
const footerSource = await fs.readFile(path.join(repoRoot, "src/components/BuildMetaFooter.tsx"), "utf8");
const homeSource = sources.get("src/components/HomeWorkspaceClient.tsx");
const catalogSource = sources.get("src/components/CaseCatalogClient.tsx");
const randomSource = sources.get("src/components/RandomTrainingClient.tsx");
const trainingSource = sources.get("src/components/ClinicalTrainingClient.tsx");

for (const [relative, source] of [
  ["app/layout.tsx", layoutSource],
  ["src/components/AppHeader.tsx", headerSource],
  ["src/components/HomeWorkspaceClient.tsx", homeSource]
]) {
  assert.match(source, /血尿临床问诊训练系统/, `${relative} must use the formal product name`);
  assert.doesNotMatch(source, /血尿多智能体临床思维训练平台|血尿临床问诊训练(?:["<])/,
    `${relative} must not use a shortened or legacy product name`);
}

for (const [relative, source] of [
  ["src/components/AppHeader.tsx", headerSource],
  ["src/components/HomeWorkspaceClient.tsx", homeSource],
  ["src/components/CaseCatalogClient.tsx", catalogSource],
  ["src/components/RandomTrainingClient.tsx", randomSource]
]) {
  assert.match(source, /随机抽取病例/, `${relative} must use the formal random-case label`);
  assert.doesNotMatch(source, /随机训练|随机抽题|自由训练/, `${relative} contains a legacy random-case label`);
}

assert.doesNotMatch(homeSource, /\bP001\b|Start P001|开始 P001/, "home must not steer learners to a fixed case");
assert.doesNotMatch(`${homeSource}\n${catalogSource}`, /盲病例|盲选|盲卡|BLIND CASE/i,
  "formal case-selection UI must not use prototype blind-case wording");
assert.match(homeSource, /病例 \$\{number\}/, "recent training must present a learner-facing case number");
assert.match(catalogSource, /病例 \$\{number\}/, "case cards must present a learner-facing case number");
assert.match(
  trainingSource,
  /String\(Number\(internalCaseId\[1\]\)\)\.padStart\(2, "0"\)/,
  "training workbench must present P001 as learner-facing case 01"
);
assert.doesNotMatch(
  footerSource,
  /NEXT_PUBLIC_(?:GIT_SHA|BUILD_TIME|CASE_LIBRARY_VERSION|SCORING_VERSION)|代码版本|构建时间|评分规则版本|build-metadata/,
  "ordinary UI must not expose build or scoring implementation metadata"
);

const cases = JSON.parse(await fs.readFile(path.join(repoRoot, "data", "cases_public.json"), "utf8"));
const forbiddenValues = [...new Set(cases.flatMap((caseData) => [
  caseData.studentChiefComplaint,
  caseData.chiefComplaintEn,
  caseData.standardChiefComplaint,
  caseData.diagnosis,
  caseData.standardSummary
]).map((value) => String(value || "").trim()).filter((value) => value.length >= 6))];

const outRoot = path.join(repoRoot, "out");
await fs.access(outRoot);
const textFiles = [];
async function collect(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(absolute);
    else if (entry.isFile() && /\.(?:html|js|json|txt)$/i.test(entry.name)) textFiles.push(absolute);
  }
}
await collect(outRoot);

for (const file of textFiles) {
  const content = await fs.readFile(file, "utf8");
  const leaked = forbiddenValues.find((value) => content.includes(value));
  assert.equal(
    leaked,
    undefined,
    `student-hidden case content leaked into static renderer output: ${path.relative(outRoot, file)}`
  );
}

console.log("Desktop public boundary passed: renderer receives blind case summaries and static output contains no chief complaint, diagnosis, or answer summary.");
