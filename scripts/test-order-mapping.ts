import casesJson from "../data/cases.json";
import { matchOrderResults } from "../src/lib/multiAgents";
import type { CaseData } from "../src/lib/types";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const p008 = (casesJson as CaseData[]).find((item) => item.id === "P008")!;

const cbc = matchOrderResults(p008, "LAB-BL-001");
assert(cbc.selectedOrderCount === 1 && cbc.recognizedOrderCount === 1 && cbc.returnedReportCount === 1, "P008 CBC counts must be explainable");
assert(cbc.results[0]?.orderId === "LAB-BL-001", "P008 CBC must return only CBC");
assert(!/前列腺|结石|CT|尿动力/.test(cbc.results[0]?.result || ""), "P008 CBC leaked imaging or functional results");

const renal = matchOrderResults(p008, "LAB-BL-003");
assert(renal.results.length === 1 && renal.results[0].orderId === "LAB-BL-003", "P008 renal function must return only renal function");
assert(/肌酐|eGFR/.test(renal.results[0].result), "P008 renal result must explain creatinine/eGFR availability");
assert(!/前列腺|结石|CT|尿动力/.test(renal.results[0].result), "P008 renal result leaked unrelated findings");

const ctuBlocked = matchOrderResults(p008, "IMG-CT-002");
assert(ctuBlocked.results.length === 0 && ctuBlocked.unmetPrerequisites?.includes("LAB-BL-003"), "CTU must wait for renal-function prerequisite");

const ctu = matchOrderResults(p008, "LAB-BL-003；IMG-CT-002");
const ctuReport = ctu.results.find((item) => item.orderId === "IMG-CT-002");
assert(Boolean(ctuReport), "P008 CTU should return after prerequisite is ordered");
assert(/膀胱内多发结石/.test(ctuReport?.result || ""), "P008 CTU must return its independent imaging report");
assert(!/乳果糖|肠道准备|心肺功能/.test(ctuReport?.result || ""), "P008 CTU contains unrelated treatment content");

const pathology = matchOrderResults(p008, "END-002；LAB-PATH-001");
const pathologyReport = pathology.results.find((item) => item.orderId === "LAB-PATH-001");
assert(pathologyReport?.status === "not_performed", "P008 TURBT pathology must explicitly state not performed");
assert(!/乳果糖|肠道准备|前列腺体积/.test(pathologyReport?.result || ""), "P008 TURBT pathology returned contaminated content");

const partial = matchOrderResults(p008, "血常");
assert(partial.recognizedOrderCount === 0 && partial.results.length === 0, "substring fragments must not match an order");

const duplicate = matchOrderResults(p008, "LAB-BL-001", { previousOrderIds: ["LAB-BL-001"] });
assert(duplicate.duplicateOrderIds?.includes("LAB-BL-001") && duplicate.results.length === 0, "duplicate orders must not return or score duplicate evidence");

console.log("P008 exact order mapping and prerequisite tests passed.");
