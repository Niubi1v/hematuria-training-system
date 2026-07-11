import assert from "node:assert/strict";
import fs from "node:fs";
import casesJson from "../data/cases.json";
import { generatePatientReply } from "../src/lib/patientEngine";
import { matchOrderResults, score360 } from "../src/lib/multiAgents";
import type { CaseData } from "../src/lib/types";

const cases = casesJson as CaseData[];
const byId = new Map(cases.map((item) => [item.id, item]));
const representativeIds = ["P001", "P002", "P003", "HX-ADD-006", "HX-ADD-011", "HX-ADD-017", "HX-ADD-019", "HX-ADD-023", "HX-ADD-026", "HX-ADD-025", "HX-ADD-030"];

for (const id of representativeIds) {
  const caseData = byId.get(id);
  assert.ok(caseData, `Missing representative case ${id}`);
  const smoking = generatePatientReply({ caseData: caseData!, userQuestion: "抽烟吗？", mode: "rule" });
  assert.ok(smoking.matchedSlotIds.includes("LIFE_SMOKING"), `${id} smoking slot missing`);
  assert.ok(!/未诉|需追问|诊断|CT提示/.test(smoking.replyText), `${id} patient reply leaked`);
  const emptyOrders = matchOrderResults(caseData!, "尿常规");
  assert.ok(!emptyOrders.results.some((item) => /CTU/i.test(item.orderCategory)), `${id} leaked unopened CTU`);
  const report = score360(caseData!, { events: [{ eventId: `${id}-smoking`, type: "slot_answered", stageNo: 1, at: "2026-01-01T00:00:00.000Z", slotId: "smoking", text: "抽烟吗？" }], askedSlots: smoking.matchedSlotIds, examTexts: [], orderTexts: [], diagnosisText: "", mdtDepartments: [], mdtPurpose: "", mdtStarted: false, treatmentText: "", followUpText: "" });
  assert.equal(report.max, 360);
  assert.equal(report.scoringVersion, "360-event-v1");
  assert.equal(report.reportVersion, 2);
  assert.equal(report.caseVersion, caseData!.caseVersion);
  assert.ok(report.generatedAt);
}

const source = fs.readFileSync("src/components/ClinicalTrainingClient.tsx", "utf8");
assert.doesNotMatch(source, /activeStageNo === 6 && !finalReport/, "Agent 6 must not generate final report");
assert.match(source, /完成训练并生成最终报告/, "Agent 7 explicit completion action is required");
assert.match(source, /if \(stageNo === 6\) return "perioperative"/, "Agent 6 requires independent scoring key");
assert.match(source, /speechSynthesis\.addEventListener\("voiceschanged"/, "TTS must refresh voices");
assert.match(source, /width:390,height:844|mobileNavOpen|lg:hidden/, "Mobile navigation support missing");

console.log(`Representative E2E contract tests passed for ${representativeIds.length} cases.`);
