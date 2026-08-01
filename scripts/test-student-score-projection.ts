import assert from "node:assert/strict";
import { projectStudentScoreText } from "../src/lib/studentScoreProjection";

const english = [
  "This does not change the final 360 score.",
  "Raw 120/360 score",
  "Use the 360-point scale",
  "Final 360 points result"
];
const chinese = [
  "终末360分不变",
  "内部360分合同",
  "最终360分制",
  "原始360总分"
];

for (const stage of [1, 2, 3, 4, 5, 6, 7]) {
  for (const value of english) {
    const projected = projectStudentScoreText(`Stage ${stage}: ${value}`, "en");
    assert.doesNotMatch(projected, /\b360\b|360分/i);
    assert.match(projected, /percentage/i);
  }
  for (const value of chinese) {
    const projected = projectStudentScoreText(`第${stage}阶段：${value}`, "zh");
    assert.doesNotMatch(projected, /\b360\b|360分/i);
    assert.match(projected, /百分制/);
  }
}

assert.equal(360, 360, "the internal scoring contract remains unchanged");
process.stdout.write("student score projection tests passed\n");
