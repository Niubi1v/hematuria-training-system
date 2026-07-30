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

for (const relative of clientFiles) {
  const source = await fs.readFile(path.join(repoRoot, relative), "utf8");
  assert.doesNotMatch(source, /cases_public\.json|chief_complaint_wording_runtime\.json/);
}

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
