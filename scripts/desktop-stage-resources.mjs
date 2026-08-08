import fs from "node:fs/promises";
import path from "node:path";
import {
  assertPackageTreeClean,
  copyFilesByExtension,
  manifestPath,
  readRuntimeManifest,
  repoRoot,
  runtimeRoot,
  tauriResourcesRoot,
  verifyFile,
  verifyPinnedFiles
} from "./desktop-common.mjs";

const manifest = await readRuntimeManifest();
const appDestination = path.join(tauriResourcesRoot, "app");
const runtimeDestination = path.join(tauriResourcesRoot, "runtime");
const runtimeDataFiles = [
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
  "consult_catalog.json",
  "patient_slots_bilingual.json",
  "history_medical_reconciliation.json",
  "chief_complaint_wording_runtime.json"
];

await fs.rm(tauriResourcesRoot, { recursive: true, force: true });
await fs.mkdir(appDestination, { recursive: true });

await Promise.all([
  copyFilesByExtension(path.join(repoRoot, "api"), path.join(appDestination, "api"), [".js"]),
  copyFilesByExtension(path.join(repoRoot, "server"), path.join(appDestination, "server"), [".js"]),
  copyFilesByExtension(path.join(repoRoot, "shared"), path.join(appDestination, "shared"), [".js"]),
  copyFilesByExtension(path.join(repoRoot, "src", "lib"), path.join(appDestination, "src", "lib"), [".js"]),
  copyFilesByExtension(
    path.join(repoRoot, "desktop", "sidecar"),
    path.join(appDestination, "desktop", "sidecar"),
    [".cjs"]
  )
]);

await fs.mkdir(path.join(appDestination, "data"), { recursive: true });
await Promise.all(runtimeDataFiles.map((fileName) => fs.copyFile(
  path.join(repoRoot, "data", fileName),
  path.join(appDestination, "data", fileName)
)));
await fs.copyFile(
  path.join(repoRoot, "src", "lib", "patientRuntimeRecommendations.json"),
  path.join(appDestination, "src", "lib", "patientRuntimeRecommendations.json")
);

await fs.mkdir(path.join(appDestination, "desktop"), { recursive: true });
await Promise.all([
  fs.copyFile(manifestPath, path.join(appDestination, "desktop", "runtime-manifest.json")),
  fs.copyFile(
    path.join(repoRoot, "desktop", "clinical-content-triage-runtime.json"),
    path.join(appDestination, "desktop", "clinical-content-triage-runtime.json")
  ),
  fs.copyFile(
    path.join(repoRoot, "desktop", "human-approved-result-mappings.json"),
    path.join(appDestination, "desktop", "human-approved-result-mappings.json")
  ),
  fs.copyFile(
    path.join(repoRoot, "desktop", "medical-author-approved-stage2-results.json"),
    path.join(appDestination, "desktop", "medical-author-approved-stage2-results.json")
  ),
  fs.copyFile(
    path.join(repoRoot, "desktop", "THIRD_PARTY_NOTICES.txt"),
    path.join(appDestination, "desktop", "THIRD_PARTY_NOTICES.txt")
  )
]);

const nodeSource = path.join(runtimeRoot, "node", manifest.node.fileName);
const llamaSource = path.join(runtimeRoot, "llama");
if (!(await verifyFile(nodeSource, manifest.node.size, manifest.node.sha256))) {
  throw new Error("desktop_node_runtime_not_prepared_or_modified");
}
if (!(await verifyPinnedFiles(llamaSource, manifest.llamaCpp.files))) {
  throw new Error("desktop_llama_runtime_not_prepared");
}
await fs.mkdir(path.join(runtimeDestination, "node"), { recursive: true });
await fs.copyFile(nodeSource, path.join(runtimeDestination, "node", manifest.node.fileName));
const stagedLlamaRoot = path.join(runtimeDestination, "llama");
await Promise.all(manifest.llamaCpp.files.map(async (specification) => {
  const segments = specification.path.split("/");
  const source = path.join(llamaSource, ...segments);
  const destination = path.join(stagedLlamaRoot, ...segments);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
}));
if (!(await verifyPinnedFiles(stagedLlamaRoot, manifest.llamaCpp.files))) {
  throw new Error("desktop_llama_staged_files_failed_integrity");
}

await assertPackageTreeClean(tauriResourcesRoot);
console.log("Desktop resources staged from the runtime whitelist (model excluded).");
