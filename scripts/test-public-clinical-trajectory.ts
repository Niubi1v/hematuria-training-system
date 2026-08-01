import assert from "node:assert/strict";
import { publicTrajectoryActionLabel } from "../src/lib/publicClinicalTrajectory";

const expected = {
  diagnosis: ["诊断结论", "Diagnosis"],
  department: ["会诊科室", "Consulting specialty"],
  trigger: ["会诊原因", "Reason for consultation"],
  question: ["会诊问题", "Consultation question"],
  evidence: ["提供依据", "Evidence provided"],
  consult: ["会诊意见", "Consultation advice"],
  treatment: ["治疗计划", "Treatment plan"],
  perioperative: ["围术期管理", "Perioperative management"]
} as const;

for (const [key, [zh, en]] of Object.entries(expected)) {
  assert.equal(publicTrajectoryActionLabel(key, "zh"), zh);
  assert.equal(publicTrajectoryActionLabel(key, "en"), en);
  assert.notEqual(publicTrajectoryActionLabel(key, "zh"), key);
}
assert.equal(publicTrajectoryActionLabel("natural English evidence sentence", "en"), "");
console.log("Public clinical trajectory presentation tests passed.");
