import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.HEMATURIA_RUNTIME_TARGET = "desktop";
const cases = require("../data/cases.json");
const structuredResults = require("../data/order_results_structured.json");
const catalogs = ["labs", "imaging", "procedures", "perioperative"].flatMap((name) => require(`../data/order_catalog_${name}.json`));
const { buildStudentOrderCatalog, orderApplicableForCase, orderApplicableForSex, sourceOrderId } = require("../shared/dataAgentPresentation.js");
const { desktopTeachingSimulation } = require("../server/desktopClinicalContentProjection.js");

const catalog = buildStudentOrderCatalog(catalogs);
const noPregnancyPotential = new Set(["P002", "P014", "P021", "P022", "P026"]);
const exclusions = [];
const newlyExcluded = [];
let selectable = 0;
let applicabilityConflicts = 0;
let procedurePrerequisiteConflicts = 0;

function previousApplicability(order, caseData) {
  return ["LAB-BL-010", "LAB-BL-015"].includes(sourceOrderId(order)) || orderApplicableForSex(order, caseData.sex);
}

for (const caseData of cases) {
  const publicCaseId = caseData.displayCaseId || caseData.id;
  const available = catalog.filter((order) => orderApplicableForCase(order, caseData));
  const availableIds = new Set(available.map(sourceOrderId));
  selectable += available.length;
  for (const order of catalog) {
    if (orderApplicableForCase(order, caseData)) continue;
    const row = { caseId: publicCaseId, runtimeCaseId: caseData.id, age: Number(caseData.age), sex: caseData.sex, orderId: sourceOrderId(order), displayName: order.displayName };
    exclusions.push(row);
    if (previousApplicability(order, caseData)) newlyExcluded.push(row);
  }
  for (const order of available) {
    const orderId = sourceOrderId(order);
    if (caseData.sex === "女" && ["LAB-BL-015", "IMG-US-003", "IMG-MR-004"].includes(orderId)) applicabilityConflicts += 1;
    if (caseData.sex === "男" && ["LAB-BL-010", "STD-US-003"].includes(orderId)) applicabilityConflicts += 1;
    if (Number(caseData.age) < 18 && ["LAB-BL-015", "IMG-MR-004"].includes(orderId)) applicabilityConflicts += 1;
    if (noPregnancyPotential.has(publicCaseId) && orderId === "LAB-BL-010") applicabilityConflicts += 1;
  }
  for (const result of structuredResults.filter((item) => item.caseId === caseData.id && item.prerequisites?.length && availableIds.has(item.orderId))) {
    if (result.prerequisites.some((orderId) => !availableIds.has(orderId))) procedurePrerequisiteConflicts += 1;
  }
}

const categories = {
  femalePsa: newlyExcluded.filter((item) => item.sex === "女" && item.orderId === "LAB-BL-015").length,
  malePregnancy: newlyExcluded.filter((item) => item.sex === "男" && item.orderId === "LAB-BL-010").length,
  noPregnancyPotential: newlyExcluded.filter((item) => item.sex === "女" && item.orderId === "LAB-BL-010").length,
  pediatricProstate: newlyExcluded.filter((item) => item.sex === "男" && item.age < 18 && ["LAB-BL-015", "IMG-MR-004"].includes(item.orderId)).length
};

assert.equal(cases.length * catalog.length, 2814);
assert.equal(exclusions.length, 122);
assert.equal(newlyExcluded.length, 50);
assert.deepEqual(categories, { femalePsa: 15, malePregnancy: 27, noPregnancyPotential: 5, pediatricProstate: 3 });
assert.equal(selectable, 2692);
assert.equal(applicabilityConflicts, 0);
assert.equal(procedurePrerequisiteConflicts, 0);
assert.equal(desktopTeachingSimulation({ caseData: { id: "female", age: 30, sex: "女", diagnosis: "" }, orderId: "LAB-BL-015", displayName: "PSA" }), null);
assert.equal(desktopTeachingSimulation({ caseData: { id: "male", age: 30, sex: "男", diagnosis: "" }, orderId: "LAB-BL-010", displayName: "育龄女性妊娠试验" }), null);
console.log(`R5_CASE_ORDER_APPLICABILITY ${JSON.stringify({ rawCombinations: 2814, previouslySelectable: 2742, newlyExcluded: newlyExcluded.length, finalSelectable: selectable, categories, applicabilityConflicts, procedurePrerequisiteConflicts, exclusions: newlyExcluded })}`);
