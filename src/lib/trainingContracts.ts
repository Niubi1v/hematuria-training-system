import type { StageKey } from "./types";

export type StudentEvidenceOption = {
  evidenceId: string;
  sourceStage: number;
  label: string;
};

export type FeedbackEvidenceItem = {
  text: string;
  evidenceIds: string[];
};

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
  feedbackEvidence?: {
    hits: FeedbackEvidenceItem[];
    misses: FeedbackEvidenceItem[];
    warnings: FeedbackEvidenceItem[];
  };
  evidenceOptions?: StudentEvidenceOption[];
};

export type OrderResultLog = {
  id: string;
  input: string;
  matched: boolean;
  matchedOrders: Array<{ orderId: string; displayName: string; translationAvailable?: boolean }>;
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
    metadataStatus?: "complete" | "awaiting_reviewed_metadata";
    translationStatus?: string;
    provenance?: "configured_case_result" | "case_source_projection" | "simulated_normal" | "not_provided" | "medical_review_pending" | "source_not_collected" | "source_not_performed" | "source_not_available" | "medical_conflict" | "source_projection_match_failed";
    scoringEligible?: boolean;
  }>;
  orderOutcomes?: Array<{
    orderId: string;
    displayName: string;
    status: "reported" | "no_indication" | "not_performed" | "no_specimen" | "not_provided" | "medical_review_pending" | "prerequisite_missing" | "duplicate" | "unrecognized" | "unavailable";
    provenance: string;
    reviewStatus?: "pending_human_medical_review" | "not_required";
    scoringEligible?: boolean;
    resultId?: string;
    message: string;
  }>;
  pendingResults?: OrderResultLog["results"];
  message: string;
  at: string;
  placedAt?: string;
  returnedAt?: string;
  stageNo?: number;
  status?: "ordered" | "reported" | "no-result";
  evidenceOptions?: StudentEvidenceOption[];
  duplicateOrderIds?: string[];
  acceptedOrderIds?: string[];
  pendingPrerequisiteOrderIds?: string[];
  unmetPrerequisites?: string[];
  unavailableOrderCount?: number;
  selectedOrderCount?: number;
  recognizedOrderCount?: number;
  returnedReportCount?: number;
};

export type ExamResultLog = {
  input: string;
  result: string;
  at: string;
  examId?: string;
  translationStatus?: string;
  provenance?: "configured_case_result" | "case_source_projection" | "simulated_normal" | "not_provided" | "medical_review_pending" | "source_not_collected" | "source_not_performed" | "source_not_available" | "medical_conflict" | "source_projection_match_failed";
  scoringEligible?: boolean;
  affectsDiagnosis?: false;
  affectsScore?: false;
  reviewerStatus?: "not_required";
  simulationPolicyId?: string;
  evidenceOptions?: StudentEvidenceOption[];
};

export type MdtOpinion = {
  department: string;
  opinion: string;
  questions: string[];
  expertJudgment?: string;
  neededInfo?: string;
  suggestedHandling?: string;
  riskReminder?: string;
  residentQuestion?: string;
  necessity?: string;
  mdtIntegration?: string;
  evidenceIds?: string[];
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
    rubricItems?: Array<{ rubricItemId: string; status: string; score: number; max: number; eventId?: string; evidenceId?: string; evidenceText?: string; timestamp?: string }>;
  }>;
  redFlags: string[];
  ragGuardrails: string[];
  scoringVersion: string;
  caseVersion: string;
  generatedAt: string;
  reportVersion: number;
  calculation?: string;
  clinicalTrajectory?: {
    questions: ClinicalTrajectoryEntry[];
    acquiredEvidence: ClinicalTrajectoryEntry[];
    examinationsAndOrders: ClinicalTrajectoryEntry[];
    diagnosisFormation: ClinicalTrajectoryEntry[];
    consultations: ClinicalTrajectoryEntry[];
    treatmentOrders: ClinicalTrajectoryEntry[];
    perioperativeManagement: ClinicalTrajectoryEntry[];
    unnecessaryInvestigations?: ClinicalTrajectoryEntry[];
    decisionTransitions: Array<{ decisionEvidenceId: string; fromStage: number; toStage: number; reason: string }>;
    omissions: Array<{ domain: string; label: string; rubricItemId: string }>;
  };
};

export type ClinicalTrajectoryEntry = {
  evidenceId: string;
  stage: number;
  action: string;
  canonical: string;
  result: string;
  provenance: string;
};
