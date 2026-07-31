import casesJson from "../data/cases.json";
import imaging from "../data/order_catalog_imaging.json";
import labs from "../data/order_catalog_labs.json";
import perioperative from "../data/order_catalog_perioperative.json";
import procedures from "../data/order_catalog_procedures.json";
import orderResults from "../data/order_results_structured.json";
import { buildStudentOrderCatalog, sourceOrderId } from "../shared/dataAgentPresentation.js";
import { matchOrderResults } from "../src/lib/multiAgents";
import type { CaseData } from "../src/lib/types";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const p008 = (casesJson as CaseData[]).find((item) => item.id === "P008")!;

const cbc = matchOrderResults(p008, "LAB-BL-001");
assert(cbc.selectedOrderCount === 1 && cbc.recognizedOrderCount === 1 && cbc.returnedReportCount === 0, "P008 CBC counts must distinguish an order from an available report");
assert(cbc.orderOutcomes?.[0]?.status === "medical_review_pending" && cbc.orderOutcomes[0].provenance === "source_not_available" && cbc.orderOutcomes[0].reviewStatus === "pending_human_medical_review" && cbc.orderOutcomes[0].scoringEligible === false, "P008 unavailable CBC must preserve source provenance and remain a non-scoring medical-review outcome");

const renal = matchOrderResults(p008, "LAB-BL-003");
assert(renal.results.length === 0, "P008 unavailable renal-function placeholder must not be presented as a report");
assert(renal.orderOutcomes?.[0]?.status === "medical_review_pending" && renal.orderOutcomes[0].provenance === "source_not_available" && renal.orderOutcomes[0].reviewStatus === "pending_human_medical_review" && renal.orderOutcomes[0].scoringEligible === false, "P008 renal-function absence must preserve source provenance and remain excluded from scoring");

const ctuBlocked = matchOrderResults(p008, "IMG-CT-002");
assert(ctuBlocked.results.length === 0 && ctuBlocked.unmetPrerequisites?.includes("LAB-BL-003"), "CTU must wait for renal-function prerequisite");

const ctu = matchOrderResults(p008, "LAB-BL-003；IMG-CT-002");
const ctuReport = ctu.results.find((item) => item.orderId === "IMG-CT-002");
assert(Boolean(ctuReport), "P008 CTU should return after prerequisite is ordered");
assert(/膀胱内多发结石/.test(ctuReport?.result || ""), "P008 CTU must return its independent imaging report");
assert(!/乳果糖|肠道准备|心肺功能/.test(ctuReport?.result || ""), "P008 CTU contains unrelated treatment content");

const pathology = matchOrderResults(p008, "END-002；LAB-PATH-001");
const pathologyOutcome = pathology.orderOutcomes?.find((item) => item.orderId === "LAB-PATH-001");
assert(pathology.results.every((item) => item.orderId !== "LAB-PATH-001"), "P008 not-performed pathology must not be presented as a report");
assert(pathologyOutcome?.status === "not_provided" && /未实施/.test(pathologyOutcome.message), "P008 TURBT pathology must explicitly state not performed per order");

const partial = matchOrderResults(p008, "血常");
assert(partial.recognizedOrderCount === 0 && partial.results.length === 0, "substring fragments must not match an order");

const duplicate = matchOrderResults(p008, "LAB-BL-001", { previousOrderIds: ["LAB-BL-001"] });
assert(duplicate.duplicateOrderIds?.includes("LAB-BL-001") && duplicate.results.length === 0, "duplicate orders must not return or score duplicate evidence");

const cases = casesJson as CaseData[];
const studentCatalog = buildStudentOrderCatalog([...labs, ...imaging, ...procedures, ...perioperative]);
let finalMappings = 0;
let unavailableMappings = 0;
for (const sourceResult of orderResults) {
  const caseData = cases.find((item) => item.id === sourceResult.caseId);
  assert(caseData, `${sourceResult.caseId}: result case must exist`);
  const studentOrder = studentCatalog.find((item) => sourceOrderId(item) === sourceResult.orderId);
  const input = studentOrder?.displayName || sourceResult.orderId;
  const mapped = matchOrderResults(caseData!, input, { previousOrderIds: sourceResult.prerequisites });
  const outcome = mapped.orderOutcomes?.find((item) => item.orderId === sourceResult.orderId);
  assert(outcome, `${sourceResult.caseId}/${sourceResult.orderId}: canonical or alias must resolve to an outcome`);
  if (sourceResult.status === "final") {
    assert(mapped.results.some((item) => item.resultId === sourceResult.resultId), `${sourceResult.caseId}/${sourceResult.orderId}: final source report must be released`);
    assert(outcome?.status === "reported" && outcome.provenance === "configured_case_result", `${sourceResult.caseId}/${sourceResult.orderId}: final mapping must preserve source provenance`);
    finalMappings += 1;
  } else if (sourceResult.status === "not_performed") {
    assert(mapped.results.every((item) => item.resultId !== sourceResult.resultId), `${sourceResult.caseId}/${sourceResult.orderId}: unavailable placeholder must not be presented as a report`);
    assert(outcome?.status === "not_provided" && outcome.provenance === "source_not_performed", `${sourceResult.caseId}/${sourceResult.orderId}: not-performed source status must remain explicit`);
    unavailableMappings += 1;
  } else {
    assert(mapped.results.every((item) => item.resultId !== sourceResult.resultId), `${sourceResult.caseId}/${sourceResult.orderId}: pending placeholder must not be presented as a report`);
    assert(outcome?.status === "medical_review_pending" && outcome.provenance === "source_not_available" && outcome.reviewStatus === "pending_human_medical_review" && outcome.scoringEligible === false, `${sourceResult.caseId}/${sourceResult.orderId}: unavailable source status must remain traceable, pending human review, and excluded from scoring`);
    unavailableMappings += 1;
  }
}

console.log(`Order mapping audit passed: P008 prerequisites plus 42 cases / ${finalMappings} final reports / ${unavailableMappings} unavailable or not-performed outcomes.`);
