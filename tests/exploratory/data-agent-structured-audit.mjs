import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const cases = require("../../data/cases.json");
const results = require("../../data/order_results_structured.json");
const catalog = [
  ...require("../../data/order_catalog_labs.json"),
  ...require("../../data/order_catalog_imaging.json"),
  ...require("../../data/order_catalog_procedures.json"),
  ...require("../../data/order_catalog_perioperative.json")
];

function cliValue(name, fallback = "") {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length) || fallback;
}

const reportPath = path.resolve(cliValue("report", "artifacts/exploratory-qa/reports/data-agent-structured-audit.json"));
const casesByInternalId = new Map(cases.map((item) => [item.id, item]));
const publicCaseId = (internalId) => {
  const item = casesByInternalId.get(internalId);
  return String(item?.displayCaseId || item?.id || internalId);
};
const catalogById = new Map(catalog.map((item) => [item.orderId, item]));
const resultIds = new Set();
const duplicateResultIds = [];
const unknownCases = [];
const unknownOrders = [];
const emptyResults = [];
const unknownPrerequisites = [];

for (const result of results) {
  if (resultIds.has(result.resultId)) duplicateResultIds.push(result.resultId);
  resultIds.add(result.resultId);
  if (!casesByInternalId.has(result.caseId)) unknownCases.push(result.resultId);
  if (!catalogById.has(result.orderId)) unknownOrders.push(result.resultId);
  if (!String(result.value || "").trim() && !String(result.impression || "").trim()) emptyResults.push(result.resultId);
  for (const prerequisite of result.prerequisites || []) {
    if (!catalogById.has(prerequisite)) unknownPrerequisites.push(result.resultId);
  }
}

const finalNumericLabs = results.filter((result) => result.status === "final"
  && String(result.orderId || "").startsWith("LAB-")
  && /[0-9]/.test(String(result.value || "")));
const metadataGaps = finalNumericLabs.map((result) => ({
  caseId: publicCaseId(result.caseId),
  orderId: result.orderId,
  missingFields: [
    ...(!String(result.unit || "").trim() ? ["unit"] : []),
    ...(!String(result.referenceRange || "").trim() ? ["referenceRange"] : [])
  ]
})).filter((item) => item.missingFields.length > 0);
const nonFinalEmptyCount = results.filter((result) => result.status !== "final"
  && !String(result.value || "").trim()
  && !String(result.impression || "").trim()).length;
const resultCountsByCase = cases.map((item) => results.filter((result) => result.caseId === item.id).length);
const structuralFailureCount = duplicateResultIds.length + unknownCases.length + unknownOrders.length
  + emptyResults.length + unknownPrerequisites.length + nonFinalEmptyCount;
const summary = {
  schemaVersion: 1,
  productionSha: "657ba5da8fc6460ad7d0deea882a010c40938b40",
  runtimeEquivalentSha: "3a16f9314d1b3cf50e30bc41dcfeaf19f4fa77a8",
  status: metadataGaps.length ? "FAIL_LOCAL_QA" : "PASS_LOCAL",
  defectId: metadataGaps.length ? "HEM-P1-046" : null,
  caseCount: cases.length,
  catalogOrderCount: catalog.length,
  resultCount: results.length,
  statusCounts: Object.fromEntries([...new Set(results.map((item) => item.status))]
    .sort().map((status) => [status, results.filter((item) => item.status === status).length])),
  minimumResultsPerCase: Math.min(...resultCountsByCase),
  maximumResultsPerCase: Math.max(...resultCountsByCase),
  structuralFailureCount,
  duplicateResultIdCount: duplicateResultIds.length,
  unknownCaseCount: unknownCases.length,
  unknownOrderCount: unknownOrders.length,
  emptyResultCount: emptyResults.length,
  unknownPrerequisiteCount: unknownPrerequisites.length,
  nonFinalEmptyCount,
  finalNumericLabCount: finalNumericLabs.length,
  numericLabMetadataGapCount: metadataGaps.length,
  affectedCaseCount: new Set(metadataGaps.map((item) => item.caseId)).size,
  missingUnitCount: metadataGaps.filter((item) => item.missingFields.includes("unit")).length,
  missingReferenceRangeCount: metadataGaps.filter((item) => item.missingFields.includes("referenceRange")).length,
  metadataGaps,
  medicalValuesRetained: false
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(`Data Agent audit: cases=${summary.caseCount} results=${summary.resultCount} structuralFailures=${structuralFailureCount} numericLabMetadataGaps=${metadataGaps.length}.`);
if (structuralFailureCount || metadataGaps.length) process.exitCode = 1;
