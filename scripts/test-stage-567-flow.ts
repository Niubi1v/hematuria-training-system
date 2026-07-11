import fs from "node:fs";
import { evaluateStage } from "../src/lib/fullProcessScoring";
import cases from "../data/cases.json";

function assert(condition: unknown, message: string) { if (!condition) throw new Error(message); }

const source = fs.readFileSync("src/components/ClinicalTrainingClient.tsx", "utf8");
assert(/stageNo === 5\) return "treatment"/.test(source), "Stage 5 must map to treatment");
assert(/stageNo === 6\) return "perioperative"/.test(source), "Stage 6 must map to perioperative");
assert(/return "debrief"/.test(source), "Stage 7 must map to debrief");
assert(!/stageNo === 7 && !finalReport\) setFinalReport/.test(source), "Opening stage 7 must not create final report");
assert(/answers\.debriefReflection\.trim\(\)\.length < 10/.test(source), "Final report requires learner reflection");
assert(/setFinalReport\(report\)/.test(source), "Explicit completion must create final report");
assert(/if \(finalReport && stageNo !== 7\) return false/.test(source), "Final report must lock prior-stage logs");

const caseData = cases[0] as any;
const treatment = evaluateStage(caseData, "treatment", "即时处理；病因治疗；确定性治疗；随访教育");
const perioperative = evaluateStage(caseData, "perioperative", "麻醉评估；心肺功能；备血；感染控制；抗血小板管理；血压；血糖；贫血；肾功能；VTE预防；ERAS；术后并发症预防");
assert(treatment.standardAnswer !== perioperative.standardAnswer, "Stage 5 and stage 6 must use different scoring standards");
console.log("Stage 5/6/7 flow tests passed: independent scoring and explicit final report generation.");
