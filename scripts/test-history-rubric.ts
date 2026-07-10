import fs from "node:fs";
import { allCases } from "@/src/lib/cases";
import { evaluateStage } from "@/src/lib/fullProcessScoring";
import questionSlots from "@/data/question_slots.json";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const caseData = allCases.find((item) => item.id === "P001");
if (!caseData) throw new Error("Missing test case P001");

const fullSlotAnswer = (questionSlots as Array<{ slotId: string; label: string; triggers?: string[] }>)
  .map((slot) => `${slot.slotId} ${slot.label} ${(slot.triggers || []).slice(0, 2).join(" ")}`)
  .join("；");

const report = evaluateStage(caseData, "history", fullSlotAnswer);
assert(report.max === 100, `history rubric should be 100 points, got ${report.max}`);
assert(report.hits.length >= 8, `history rubric should produce dimension hits, got ${report.hits.length}`);
assert(report.standardAnswer.includes("诊断学安全网"), "history feedback should include diagnostic guardrails");

const weakReport = evaluateStage(caseData, "history", "患者说小便变红。");
assert(weakReport.max === 100, "weak history report should still use 100-point rubric");
assert(weakReport.score < report.score, "weak answer should score lower than full slot answer");
assert(weakReport.misses.length > 0, "weak answer should list missing items after submit");

const clientSource = fs.readFileSync("src/components/ClinicalTrainingClient.tsx", "utf8");
assert(!clientSource.includes("missingSlots") && !clientSource.includes("criticalSlots") && !clientSource.includes("scoreKeywords"), "student UI should not render evaluator internals before submit");
assert(clientSource.includes("showStageFeedback") && clientSource.includes("activeEvaluation"), "stage feedback should be gated by submit state");
assert(clientSource.includes("isOsce") && clientSource.includes("activeStageNo === 7"), "OSCE mode should avoid immediate stage feedback before final debrief");

console.log("History rubric tests passed.");
