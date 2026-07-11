import assert from "node:assert/strict";
import fs from "node:fs";

const data = JSON.parse(fs.readFileSync("data/medical_review_queue.json", "utf8")) as {
  caseCount: number;
  trackedFactCount: number;
  sourceTraceCount: number;
  activeExpertReviewCount: number;
  reconciledCount: number;
  formalUseAllowed: boolean;
  queue: Array<Record<string, string>>;
};

assert.equal(data.caseCount, 42);
assert.equal(data.trackedFactCount, 572);
assert.equal(data.sourceTraceCount, 153);
assert.equal(data.activeExpertReviewCount, 419);
assert.equal(data.reconciledCount, 2);
assert.equal(data.formalUseAllowed, false);
assert.equal(data.queue.length, 419);
assert.equal(new Set(data.queue.map((item) => item.reviewItemId)).size, 419);
assert.ok(data.queue.every((item) => item.decision === "待确认"));
assert.ok(data.queue.every((item) => item.primaryReviewer && item.secondaryReviewer && item.priority));
assert.ok(data.queue.every((item) => !item.reviewerName && !item.reviewDate && !item.evidenceOrGuideline));
assert.ok(data.queue.some((item) => item.primaryReviewer.includes("肾内科")));
assert.ok(data.queue.some((item) => item.primaryReviewer.includes("妇产科")));
assert.ok(data.queue.some((item) => item.primaryReviewer.includes("心内科")));

console.log("Medical review queue contract passed: 153 source-trace facts, 419 pending expert decisions, no fabricated approvals.");
