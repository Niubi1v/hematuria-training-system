import type { StageKey } from "./types";

export type FullProcessAnswers = {
  historySummary: string;
  physicalExam: string;
  diagnosis: string;
  differentials: string;
  differentialAnalysis: string;
  diagnosticEvidence: string;
  confirmatoryTests: string;
  selectedOrders: string[];
  customOrders: string;
  consultNeeded: string;
  consultDepartments: string[];
  consultPurpose: string;
  consultQuestions: string;
  consultSummary: string;
  immediateTreatment: string;
  admissionTreatment: string;
  definitiveTreatment: string;
  perioperativePreparation: string;
  mdtRevisedPlan: string;
  followUp: string;
  patientEducation: string;
  debriefReflection: string;
};

export type StageEvaluation = {
  stageKey: StageKey;
  max: number;
  score: number;
  hits: string[];
  misses: string[];
  warnings: string[];
  standardAnswer: string;
  comment: string;
  practiceOnly?: boolean;
};

export type OrderResultLog = {
  id: string;
  input: string;
  matched: boolean;
  matchedOrders: Array<{ orderId: string; displayName: string }>;
  results: Array<{
    caseId: string;
    orderId: string;
    resultId?: string;
    status?: string;
    orderCategory: string;
    result: string;
    value?: string;
    unit?: string;
    referenceRange?: string;
    impression?: string;
    abnormalFlags?: string[];
    abnormalLevel: string;
    teachingExplanation: string;
  }>;
  pendingResults?: OrderResultLog["results"];
  message: string;
  at: string;
  placedAt?: string;
  returnedAt?: string;
  stageNo?: number;
  status?: "ordered" | "reported" | "no-result";
  duplicateOrderIds?: string[];
  unmetPrerequisites?: string[];
  selectedOrderCount?: number;
  recognizedOrderCount?: number;
  returnedReportCount?: number;
};

export type ExamResultLog = { input: string; result: string; at: string; examId?: string };

export type MdtOpinion = {
  department: string;
  opinion: string;
  questions: string[];
  expertJudgment?: string;
  neededInfo?: string;
  suggestedHandling?: string;
  riskReminder?: string;
  residentQuestion?: string;
};

export type Evaluator360Report = {
  total: number;
  max: number;
  items: Array<{
    label: string;
    max: number;
    score: number;
    evidence: string[];
    misses: string[];
    sequenceIssues: string[];
    overuse: string[];
    criticalErrors: string[];
    improvements: string[];
    comment: string;
    rubricItems?: Array<{ rubricItemId: string; status: string; score: number; max: number; eventId?: string; evidenceText?: string; timestamp?: string }>;
  }>;
  redFlags: string[];
  ragGuardrails: string[];
  scoringVersion: string;
  caseVersion: string;
  generatedAt: string;
  reportVersion: number;
  calculation?: string;
};
