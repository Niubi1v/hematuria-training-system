export type TrainingStageNo = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export function nextTrainingStage(stageNo: TrainingStageNo): TrainingStageNo | null {
  return stageNo < 7 ? ((stageNo + 1) as TrainingStageNo) : null;
}

export function submittedTrainingStages(submitted: Readonly<Partial<Record<TrainingStageNo, unknown>>>) {
  return new Set(Object.entries(submitted)
    .filter(([, evaluation]) => Boolean(evaluation))
    .map(([stage]) => Number(stage)));
}

export function canOpenTrainingStage(
  stageNo: TrainingStageNo,
  submittedStages: ReadonlySet<number>,
  finalized: boolean
) {
  if (finalized && stageNo !== 7) return false;
  for (let current = 1; current < stageNo; current += 1) {
    if (!submittedStages.has(current)) return false;
  }
  return true;
}
