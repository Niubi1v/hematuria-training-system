import assert from "node:assert/strict";
import crypto from "node:crypto";
import { canOpenTrainingStage, nextTrainingStage, submittedTrainingStages, type TrainingStageNo } from "../src/lib/trainingStageState";

const seedIndex = process.argv.indexOf("--seed");
const seed = (seedIndex >= 0 ? process.argv[seedIndex + 1] : undefined)
  || process.env.R5_TEST_SEED
  || "99c206e-r5-fast";

function randomIndex(counter: number, length: number) {
  const digest = crypto.createHash("sha256").update(`${seed}:${counter}`).digest();
  return digest.readUInt32BE(0) % length;
}

for (let run = 0; run < 30; run += 1) {
  const submitted = new Set<number>();
  let active: TrainingStageNo = 1;
  let finalized = false;

  for (let step = 0; step < 25; step += 1) {
    const action = randomIndex(run * 25 + step, 3);
    if (action === 0 && !finalized) {
      submitted.add(active);
      const next = nextTrainingStage(active);
      if (next) active = next;
      else finalized = true;
    } else if (action === 1) {
      const candidate = (randomIndex(run * 25 + step + 1000, 7) + 1) as TrainingStageNo;
      if (canOpenTrainingStage(candidate, submitted, finalized)) active = candidate;
    } else if (submitted.has(active)) {
      submitted.add(active);
    }

    assert(canOpenTrainingStage(active, submitted, finalized), "active stage must remain legally open");
    for (let stage = 2 as TrainingStageNo; stage <= 7; stage = (stage + 1) as TrainingStageNo) {
      const prerequisitesSubmitted = Array.from({ length: stage - 1 }, (_, index) => index + 1)
        .every((value) => submitted.has(value));
      const expected: boolean = (!finalized || stage === 7) && prerequisitesSubmitted;
      assert.equal(canOpenTrainingStage(stage, submitted, finalized), expected, `stage ${stage} gate drifted`);
    }
  }
}

assert.equal(nextTrainingStage(7), null);
assert.deepEqual([...submittedTrainingStages({ 1: { status: "submitted" }, 2: null })], [1]);
process.stdout.write(`R5 stage-state model passed (seed=${seed})\n`);
