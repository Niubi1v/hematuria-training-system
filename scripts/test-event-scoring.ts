import casesJson from "../data/cases.json";
import { matchCanonicalSlots } from "../src/lib/canonicalSlots";
import { caseRubric, scoreTrainingEvents, type TrainingEvent } from "../src/lib/eventScoring";
import type { CaseData } from "../src/lib/types";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const cases = casesJson as CaseData[];
function standardEvents(caseData: CaseData) {
  const events: TrainingEvent[] = [];
  let index = 0;
  for (const dimension of caseRubric(caseData)) {
    for (const requirement of dimension.requirements) {
      const count = requirement.count || 1;
      for (let occurrence = 0; occurrence < count; occurrence += 1) {
        events.push({
          eventId: `${caseData.id}-${index++}`,
          type: requirement.eventType,
          at: "2026-01-01T00:00:00.000Z",
          stageNo: dimension.id === "history" || dimension.id === "risk" ? 1 : dimension.id === "exam" || dimension.id === "orders" ? 2 : dimension.id === "diagnosis" ? 3 : dimension.id === "mdt" ? 4 : dimension.id === "treatment" ? 5 : 7,
          slotId: requirement.eventType === "slot_answered" ? requirement.key as TrainingEvent["slotId"] : undefined,
          actionId: requirement.eventType !== "slot_answered" ? requirement.key || `${requirement.id}.${occurrence}` : undefined,
          text: `Evidence for ${requirement.label}`,
          metadata: requirement.eventType === "order_placed" ? { appropriateAdditional: true } : undefined
        });
      }
    }
  }
  return events;
}

for (const caseData of cases) {
  const full = scoreTrainingEvents(caseData, standardEvents(caseData));
  assert(full.total === 360, `${caseData.id}: standard complete trace should score 360, got ${full.total}`);
  assert(full.items.reduce((sum, item) => sum + item.score, 0) === 360, `${caseData.id}: dimensions do not add to 360`);
  assert(full.items.every((item) => item.score === item.max && item.misses.length === 0), `${caseData.id}: full dimension has contradictory misses`);
  const empty = scoreTrainingEvents(caseData, []);
  assert(empty.total === 0, `${caseData.id}: empty trace must score zero`);

  const rubric = caseRubric(caseData);
  const incremental: TrainingEvent[] = [];
  let previous = 0;
  for (const event of standardEvents(caseData)) {
    incremental.push(event);
    const next = scoreTrainingEvents(caseData, incremental).total;
    assert(next >= previous, `${caseData.id}: correct evidence reduced score from ${previous} to ${next}`);
    previous = next;
  }
  assert(rubric.reduce((sum, item) => sum + item.max, 0) === 360, `${caseData.id}: rubric max is not 360`);
}

const p001 = cases.find((item) => item.id === "P001")!;
const synonymA = matchCanonicalSlots("Is the urine red throughout the whole stream?", "en");
const synonymB = matchCanonicalSlots("Does it stay red from beginning to end?", "en");
assert(synonymA.includes("hematuria_phase") && synonymB.includes("hematuria_phase"), "synonymous questions must resolve to the same canonical slot");

const summaryOnly: TrainingEvent[] = [{ eventId: "summary", type: "summary_written", at: new Date(0).toISOString(), stageNo: 1, text: "Tumor, stone, infection, glomerular disease, smoking, clots, CTU, pathology, treatment." }];
assert(scoreTrainingEvents(p001, summaryOnly).total === 0, "keyword-packed summary must not create numeric evidence");

const fullEvents = standardEvents(p001);
const overchecked = scoreTrainingEvents(p001, [...fullEvents, { eventId: "extra", type: "order_placed", at: new Date(0).toISOString(), stageNo: 2, actionId: "NUC-002", text: "Unnecessary PET/CT" }]);
assert(overchecked.total < 360 && overchecked.items.find((item) => item.label.includes("影像"))?.overuse.length, "over-testing must prevent a perfect score");

const sample = scoreTrainingEvents(p001, fullEvents);
const evidenceItem = sample.items.flatMap((item) => item.rubricItems).find((item) => item.status === "earned");
assert(Boolean(evidenceItem?.eventId && evidenceItem.timestamp && evidenceItem.evidenceText), "earned rubric item must cite eventId, student action, and timestamp");
assert(!sample.calculation.includes("HX"), "final calculation must not expose legacy HX identifiers");

console.log(`Event-based 360 scoring passed for ${cases.length} cases, monotonicity, synonyms, anti-summary-gaming, and overuse penalties.`);
